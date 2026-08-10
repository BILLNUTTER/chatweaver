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
    if (!user) return;

    let convs: DBConversation[];
    try {
      convs = await getConversations(user.id);
    } catch {
      setConversations([]);
      setLoading(false);
      return;
    }

    const allIds = [...new Set(convs.flatMap(c => c.participants))];
    const users = await getUsers({ ids: allIds });
    const userMap = new Map(users.map(u => [u.id, u]));

    // Count unread messages: sent by others, not yet read by me
    const convIds = convs.map(c => c.id);
    const unreadMap = new Map<string, number>();
    if (convIds.length > 0) {
      const messageLists = await Promise.all(convIds.map(id => getMessages(id)));
      for (const messages of messageLists) {
        for (const row of messages) {
          if (row.sender_id !== user.id && !row.read_by?.includes(user.id)) {
            unreadMap.set(row.conversation_id, (unreadMap.get(row.conversation_id) ?? 0) + 1);
          }
        }
      }
    }

    const detailed: ConversationWithDetails[] = convs.map(conv => {
      const otherIds = conv.participants.filter(id => id !== user.id);
      const other_user = otherIds.length === 1 ? (userMap.get(otherIds[0]) ?? null) : null;
      const participants_data = conv.participants.map(id => userMap.get(id)).filter(Boolean) as DBUser[];
      const unread_count = unreadMap.get(conv.id) ?? 0;
      return { ...conv, other_user, participants_data, unread_count };
    });

    setConversations(detailed.filter(c => !c.is_admin_chat));
    setLoading(false);
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
