import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { DBUser, DBConversation } from "@/lib/database.types";
import { getConversations, getUnreadMessageCounts, getUsers, updateConversation } from "@/lib/storage";

export interface ConversationWithDetails extends DBConversation {
  other_user: DBUser | null;
  participants_data: DBUser[];
  unread_count: number;
}

export function useConversations() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ConversationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const refreshInFlight = useRef(false);

  const fetchConversations = useCallback(async () => {
    if (!user) {
      setConversations([]);
      setLoading(false);
      return;
    }
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;

    try {
      const convs: DBConversation[] = await getConversations(user.id);
      const visibleConversations = convs
        .filter(c => !c.is_admin_chat)
        .map<ConversationWithDetails>(conversation => ({
          ...conversation,
          other_user: null,
          participants_data: [],
          unread_count: 0,
        }));

      // Refresh the server-owned conversation fields without clearing enriched
      // participant data that is already visible to the user.
      setConversations(current => {
        const currentById = new Map(current.map(conversation => [conversation.id, conversation]));
        return visibleConversations.map(conversation => {
          const previous = currentById.get(conversation.id);
          return previous
            ? {
                ...previous,
                ...conversation,
                other_user: previous.other_user,
                participants_data: previous.participants_data,
                unread_count: previous.unread_count,
              }
            : conversation;
        });
      });
      setLoading(false);

      const allIds = [...new Set(convs.flatMap(c => c.participants))];
      const [usersResult, unreadResult] = await Promise.allSettled([
        allIds.length ? getUsers({ ids: allIds }) : Promise.resolve([] as DBUser[]),
        getUnreadMessageCounts(),
      ]);
      const userMap = usersResult.status === "fulfilled"
        ? new Map(usersResult.value.map(profile => [profile.id, profile]))
        : null;
      const unreadMap = unreadResult.status === "fulfilled"
        ? new Map(unreadResult.value.map(item => [item.conversation_id, item.count]))
        : null;

      if (usersResult.status === "rejected") {
        console.warn("Could not load conversation participant details", usersResult.reason);
      }
      if (unreadResult.status === "rejected") {
        console.warn("Could not load unread message counts", unreadResult.reason);
      }

      setConversations(current =>
        visibleConversations.map(conversation => {
          const previous = current.find(item => item.id === conversation.id);
          const otherIds = conversation.participants.filter(id => id !== user.id);
          return {
            ...conversation,
            other_user: userMap
              ? otherIds.length === 1 ? userMap.get(otherIds[0]) ?? null : null
              : previous?.other_user ?? null,
            participants_data: userMap
              ? conversation.participants.map(id => userMap.get(id)).filter(Boolean) as DBUser[]
              : previous?.participants_data ?? [],
            unread_count: unreadMap?.get(conversation.id) ?? previous?.unread_count ?? 0,
          };
        })
      );
    } catch (error) {
      // Keep the last good list during a brief API restart or network failure.
      console.warn("Could not refresh conversations", error);
    } finally {
      refreshInFlight.current = false;
      setLoading(false);
    }
  }, [user]);

  // Instantly clear badge in local state; also clear unread_by in DB
  const markConversationRead = async (conversationId: string) => {
    const conversation = conversations.find(item => item.id === conversationId);
    setConversations(prev =>
      prev.map(c => c.id === conversationId ? { ...c, unread_count: 0 } : c)
    );
    if (user && conversation?.unread_by?.includes(user.id)) {
      const unread_by = (conversation?.unread_by ?? []).filter(id => id !== user.id);
      await updateConversation(conversationId, { unread_by });
    }
  };

  const updateConversationPreview = (conversationId: string, lastMessage: string, lastMessageAt: string) => {
    setConversations(current => current.map(conversation =>
      conversation.id === conversationId
        ? { ...conversation, last_message: lastMessage, last_message_at: lastMessageAt }
        : conversation,
    ));
  };

  useEffect(() => {
    void fetchConversations();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void fetchConversations();
    };
    const timer = window.setInterval(refreshWhenVisible, 15_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [fetchConversations]);

  return { conversations, loading, refetch: fetchConversations, markConversationRead, updateConversationPreview };
}
