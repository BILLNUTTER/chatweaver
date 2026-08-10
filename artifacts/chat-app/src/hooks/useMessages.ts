import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { DBMessage, DBUser } from "@/lib/database.types";
import {
  createMessage,
  getConversations,
  getMessages,
  getStorageMode,
  getUsers,
  updateConversation,
  updateMessage,
  updateUser,
} from "@/lib/storage";

export interface MessageWithSender extends DBMessage {
  sender: DBUser | null;
  reply_to_message: MessageWithSender | null;
  _optimistic?: boolean; // true while pending DB confirmation
}

// Simple in-memory typing state (no DB table needed)
const typingUsers = new Map<string, Map<string, { user: DBUser; expiry: number }>>();

export function useMessages(conversationId: string | null) {
  const { user, dbUser } = useAuth();
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [loading, setLoading] = useState(false);
  const [typingList, setTypingList] = useState<DBUser[]>([]);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const buildWithSenders = async (rawMessages: DBMessage[]): Promise<MessageWithSender[]> => {
    const senderIds = [...new Set(rawMessages.map(m => m.sender_id))];
    const replyIds = rawMessages.filter(m => m.reply_to).map(m => m.reply_to as string);
    const allIds = [...new Set([...senderIds, ...replyIds])];

    const users = allIds.length > 0 ? await getUsers({ ids: allIds }) : [];
    const userMap = new Map(users.map(u => [u.id, u]));

    let replyMessages: DBMessage[] = [];
    if (replyIds.length > 0) {
      const allMessages = await getMessages(conversationId ?? "");
      replyMessages = allMessages.filter(message => replyIds.includes(message.id));
    }
    const replyMap = new Map(replyMessages.map(m => [m.id, m]));

    return rawMessages.map(m => ({
      ...m,
      sender: userMap.get(m.sender_id) ?? null,
      reply_to_message: m.reply_to
        ? { ...(replyMap.get(m.reply_to) ?? m), sender: userMap.get(replyMap.get(m.reply_to)?.sender_id ?? "") ?? null, reply_to_message: null }
        : null,
    }));
  };

  const fetchMessages = async () => {
    if (!conversationId) return;
    setLoading(true);

    let data: DBMessage[];
    try {
      data = await getMessages(conversationId);
    } catch {
      setMessages([]);
      setLoading(false);
      return;
    }

    const withSenders = await buildWithSenders(data);
    setMessages(withSenders);
    setLoading(false);

    // Mark messages as read — must await or Supabase JS v2 never fires the request
    if (user) {
      const unread = data.filter(m => m.sender_id !== user.id && !m.read_by?.includes(user.id));
      if (unread.length > 0) {
        // Update each message's read_by individually (can't batch different arrays)
        await Promise.all(
          unread.map(msg =>
            updateMessage(msg.id, { read_by: [...(msg.read_by ?? []), user.id] })
          )
        );
      }
      await updateConversation(conversationId, { unread_by: [] });
    }
  };

  useEffect(() => {
    if (!conversationId) { setMessages([]); return; }
    fetchMessages();

    let cancelled = false;
    let messageTimer: number | undefined;
    let msgChannel: ReturnType<typeof supabase.channel> | undefined;
    let typingChannel: ReturnType<typeof supabase.channel> | undefined;

    const attachRealtime = async () => {
      const mode = await getStorageMode();
      if (cancelled) return;

      if (mode === "mongodb") {
        messageTimer = window.setInterval(() => void fetchMessages(), 4000);
        return;
      }

      if (!supabase) return;
      const uid = crypto.randomUUID();
      msgChannel = supabase
        .channel(`msgs-${conversationId}-${uid}`)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        }, async (payload) => {
          const newMsg = payload.new as DBMessage;
          const built = await buildWithSenders([newMsg]);
          setMessages(prev => {
            const optimisticIdx = prev.findIndex(m =>
              m._optimistic &&
              m.sender_id === newMsg.sender_id &&
              m.content === newMsg.content &&
              Math.abs(new Date(m.created_at).getTime() - new Date(newMsg.created_at).getTime()) < 10000
            );
            if (optimisticIdx !== -1) {
              const next = [...prev];
              next[optimisticIdx] = built[0];
              return next;
            }
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, ...built];
          });
        })
        .on("postgres_changes", {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        }, (payload) => {
          const updated = payload.new as DBMessage;
          setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated, _optimistic: false } : m));
        })
        .subscribe();

      typingChannel = supabase
        .channel(`typing-bc-${conversationId}-${uid}`)
        .on("broadcast", { event: "typing" }, async ({ payload }) => {
          if (!payload?.userId || payload.userId === user?.id) return;
          const typingUser = (await getUsers({ ids: [payload.userId] }))[0];
          if (!typingUser) return;

          if (!typingUsers.has(conversationId)) typingUsers.set(conversationId, new Map());
          const convTyping = typingUsers.get(conversationId)!;
          convTyping.set(payload.userId, { user: typingUser, expiry: Date.now() + 4000 });
          setTypingList([...convTyping.values()].filter(t => t.expiry > Date.now()).map(t => t.user));

          setTimeout(() => {
            convTyping.delete(payload.userId);
            setTypingList([...convTyping.values()].filter(t => t.expiry > Date.now()).map(t => t.user));
          }, 4000);
        })
        .subscribe();

      typingChannelRef.current = typingChannel;
    };
    void attachRealtime();

    return () => {
      cancelled = true;
      if (messageTimer) window.clearInterval(messageTimer);
      if (msgChannel) void supabase?.removeChannel(msgChannel);
      if (typingChannel) void supabase?.removeChannel(typingChannel);
      typingUsers.delete(conversationId);
      setTypingList([]);
    };
  }, [conversationId, user]);

  const sendMessage = async (content: string, replyToId?: string) => {
    if (!conversationId || !user || !content.trim()) return;

    // 1. Show message instantly (optimistic)
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    const optimistic: MessageWithSender = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: user.id,
      content: content.trim(),
      reply_to: replyToId ?? null,
      reply_to_message: null,
      read_by: [user.id],
      is_system: false,
      is_edited: false,
      audio_url: null,
      expires_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      sender: dbUser,
      _optimistic: true,
    };
    setMessages(prev => [...prev, optimistic]);

    // 2. Persist to DB
    let inserted: DBMessage;
    try {
      inserted = await createMessage({
      conversation_id: conversationId,
      sender_id: user.id,
      content: content.trim(),
      reply_to: replyToId ?? null,
      read_by: [user.id],
      });
    } catch {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      return;
    }
    setMessages(prev => prev.map(message => message.id === tempId ? {
      ...message,
      ...inserted,
      sender: dbUser,
      _optimistic: false,
    } : message));

    const conv = (await getConversations(user.id)).find(item => item.id === conversationId);
    const otherParticipants = (conv?.participants ?? []).filter((id: string) => id !== user.id);

    await updateConversation(conversationId, {
      last_message: content.trim().slice(0, 100),
      last_message_at: new Date().toISOString(),
      unread_by: otherParticipants,
    });

    stopTyping();
  };

  const deleteMessage = async (messageId: string) => {
    await updateMessage(messageId, {
      content: null,
      is_edited: true,
    });
  };

  const startTyping = async () => {
    if (!conversationId || !user || !typingChannelRef.current) return;
    typingChannelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: user.id },
    });
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(stopTyping, 3500);
  };

  const stopTyping = () => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
  };

  return { messages, loading, typingUsers: typingList, sendMessage, deleteMessage, startTyping, stopTyping, refetch: fetchMessages };
}
