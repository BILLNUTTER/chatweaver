import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { DBUser, DBConversation } from "@/lib/database.types";
import { getConversations, getMessages, getStorageMode, getUsers, updateConversation, updateMessage } from "@/lib/storage";

export interface ConversationWithDetails extends DBConversation {
  other_user: DBUser | null;
  participants_data: DBUser[];
  unread_count: number;
}

export function useConversations() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ConversationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConversations = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const convs: DBConversation[] = await getConversations(user.id);
      const allIds = [...new Set(convs.flatMap(c => c.participants))];
      const users = await getUsers({ ids: allIds });
      const userMap = new Map(users.map(u => [u.id, u]));

      const detailed: ConversationWithDetails[] = convs.map(conv => {
        const otherIds = conv.participants.filter(id => id !== user.id);
        const other_user = otherIds.length === 1 ? (userMap.get(otherIds[0]) ?? null) : null;
        const participants_data = conv.participants.map(id => userMap.get(id)).filter(Boolean) as DBUser[];
        return { ...conv, other_user, participants_data, unread_count: 0 };
      });

      const visibleConversations = detailed.filter(c => !c.is_admin_chat);
      setConversations(visibleConversations);
      setLoading(false);

      // Unread counts are secondary data. Do not block the chat list on them.
      if (visibleConversations.length > 0) {
        const messageResults = await Promise.allSettled(
          visibleConversations.map(conversation => getMessages(conversation.id))
        );
        const unreadMap = new Map<string, number>();
        messageResults.forEach((result, index) => {
          if (result.status !== "fulfilled") return;
          for (const message of result.value) {
            if (message.sender_id !== user.id && !message.read_by?.includes(user.id)) {
              const conversationId = visibleConversations[index].id;
              unreadMap.set(conversationId, (unreadMap.get(conversationId) ?? 0) + 1);
            }
          }
        });
        setConversations(current =>
          current.map(conversation => ({
            ...conversation,
            unread_count: unreadMap.get(conversation.id) ?? conversation.unread_count,
          }))
        );
      }
    } catch (error) {
      // Keep the last good list during a brief API restart or network failure.
      console.warn("Could not refresh conversations", error);
    } finally {
      setLoading(false);
    }
  };

  // Instantly clear badge in local state; also clear unread_by in DB
  const markConversationRead = async (conversationId: string) => {
    setConversations(prev =>
      prev.map(c => c.id === conversationId ? { ...c, unread_count: 0 } : c)
    );
    if (user) {
      await updateConversation(conversationId, { unread_by: [] });
    }
  };

  useEffect(() => {
    void fetchConversations();
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    void getStorageMode().then(mode => {
      if (cancelled) return;
      if (mode === "mongodb") {
        const timer = window.setInterval(() => void fetchConversations(), 4000);
        cleanup = () => window.clearInterval(timer);
      }
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [user]);

  return { conversations, loading, refetch: fetchConversations, markConversationRead };
}
