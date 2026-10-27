import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetMyAdminChatMessagesQueryKey,
  getGetMyAdminChatsQueryKey,
  useGetMyAdminChatMessages,
  useGetMyAdminChats,
  useMarkMyAdminChatRead,
  useSendMyAdminChatMessage,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, LockKeyhole, MessageCircle, Send } from "lucide-react";

export function AdminChatInbox() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const threadsQuery = useGetMyAdminChats({
    query: {
      queryKey: getGetMyAdminChatsQueryKey(),
      staleTime: 10_000,
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    },
  });
  const messagesQuery = useGetMyAdminChatMessages(activeId ?? "", {
    query: {
      queryKey: getGetMyAdminChatMessagesQueryKey(activeId ?? ""),
      enabled: Boolean(activeId),
      refetchInterval: activeId ? 10_000 : false,
      refetchOnWindowFocus: true,
    },
  });
  const markRead = useMarkMyAdminChatRead();
  const sendMessage = useSendMyAdminChatMessage();
  const threads = threadsQuery.data ?? [];
  const activeThread = threads.find(thread => thread.id === activeId) ?? null;

  useEffect(() => {
    if (!activeId) return;
    markRead.mutate({ id: activeId }, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetMyAdminChatsQueryKey() });
      },
    });
  }, [activeId]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messagesQuery.data]);

  const onSend = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();
    if (!activeId || !content || sendMessage.isPending) return;
    sendMessage.mutate({ id: activeId, data: { content } }, {
      onSuccess: () => {
        setDraft("");
        void queryClient.invalidateQueries({ queryKey: getGetMyAdminChatMessagesQueryKey(activeId) });
        void queryClient.invalidateQueries({ queryKey: getGetMyAdminChatsQueryKey() });
      },
      onError: error => toast({
        title: "Reply not sent",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      }),
    });
  };

  if (threadsQuery.isLoading) {
    return <div className="rounded-2xl border border-dashed border-[#c8ddda] px-6 py-12 text-center text-sm text-[#78908d] dark:border-[#355052]" data-testid="loading-admin-chats">Loading admin chats…</div>;
  }
  if (threadsQuery.isError) {
    return (
      <div className="rounded-2xl border border-[#dcebe8] bg-[#fbfefd] px-6 py-12 text-center dark:border-[#294143] dark:bg-[#172526]" data-testid="status-admin-chats-error">
        <p className="text-sm text-[#78908d]">Admin chats aren’t available right now.</p>
        <button onClick={() => threadsQuery.refetch()} className="mt-3 rounded-lg bg-[#128c7e] px-4 py-2 text-sm font-semibold text-white">Try again</button>
      </div>
    );
  }
  if (threads.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#c8ddda] px-6 py-14 text-center dark:border-[#355052]" data-testid="status-admin-chats-empty">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#e7f3f1] text-[#128c7e] dark:bg-[#203334]"><MessageCircle className="h-5 w-5" /></div>
        <h2 className="mt-4 font-semibold">No admin chats yet</h2>
        <p className="mt-1 text-sm text-[#78908d]">Messages from WhatsChat will appear here.</p>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[#dcebe8] bg-[#fbfefd] dark:border-[#294143] dark:bg-[#172526]" data-testid="list-admin-chats">
      {!activeThread ? (
        <div className="divide-y divide-[#e5efed] dark:divide-[#294143]">
          {threads.map(thread => (
            <button key={thread.id} onClick={() => setActiveId(thread.id)} className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-[#f4f9f8] dark:hover:bg-[#1c2d2e]" data-testid={`button-open-admin-chat-${thread.id}`}>
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#e7f3f1] text-[#128c7e] dark:bg-[#203d3a]"><MessageCircle className="h-5 w-5" /></div>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-semibold">{thread.title}</span>
                  <time className="shrink-0 text-[10px] text-[#91a6a3]">{new Date(thread.last_message_at).toLocaleDateString()}</time>
                </span>
                <span className="mt-1 block truncate text-xs text-[#78908d]">{thread.last_sender === "user" ? "You: " : "WhatsChat: "}{thread.last_message}</span>
              </span>
              {thread.unread_count > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#25D366] px-1 text-[10px] font-bold text-white">{thread.unread_count}</span>}
            </button>
          ))}
        </div>
      ) : (
        <>
          <header className="flex items-center gap-3 border-b border-[#dcebe8] px-4 py-3 dark:border-[#294143]">
            <button onClick={() => setActiveId(null)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#52706d] hover:bg-[#edf5f3] dark:text-[#b0c8c4] dark:hover:bg-[#203334]" aria-label="Back to admin chats" data-testid="button-back-admin-chats"><ArrowLeft className="h-4 w-4" /></button>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold">{activeThread.title}</h2>
              <p className="text-xs text-[#78908d]">Private message from WhatsChat</p>
            </div>
            {activeThread.allow_replies
              ? <span className="shrink-0 rounded-full bg-[#e6f3f0] px-2 py-1 text-[10px] font-semibold text-[#128c7e] dark:bg-[#203d3a]">Replies on</span>
              : <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#edf5f3] px-2 py-1 text-[10px] font-medium text-[#78908d] dark:bg-[#203334]"><LockKeyhole className="h-3 w-3" />One-way</span>}
          </header>
          <div ref={listRef} className="max-h-[55dvh] min-h-[220px] space-y-3 overflow-y-auto bg-[#f5faf9] p-4 dark:bg-[#132122]" data-testid="my-admin-chat-message-list">
            {messagesQuery.isLoading ? <p className="text-sm text-[#78908d]">Loading messages…</p> :
              messagesQuery.isError ? <p className="text-sm text-red-600">Messages could not be loaded.</p> :
                (messagesQuery.data ?? []).map(message => {
                  const isUser = message.sender_type === "user";
                  return (
                    <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                      <article className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${isUser ? "rounded-br-md bg-[#d9fdd3] text-[#183332] dark:bg-[#174c44] dark:text-[#e3efed]" : "rounded-bl-md border border-[#e0ecea] bg-white text-[#183332] dark:border-[#294143] dark:bg-[#172526] dark:text-[#e3efed]"}`}>
                        <p className="whitespace-pre-wrap break-words">{message.content}</p>
                        <time className="mt-1 block text-right text-[10px] opacity-60">{new Date(message.created_at).toLocaleString()}</time>
                      </article>
                    </div>
                  );
                })}
          </div>
          {activeThread.allow_replies ? (
            <form onSubmit={onSend} className="flex items-end gap-2 border-t border-[#dcebe8] p-3 dark:border-[#294143]" data-testid="form-user-admin-chat-reply">
              <textarea
                value={draft}
                onChange={event => setDraft(event.target.value)}
                maxLength={2000}
                rows={2}
                placeholder="Write a reply…"
                aria-label="Reply to WhatsChat"
                className="max-h-28 min-h-11 flex-1 resize-y rounded-xl border border-[#d5e5e2] bg-[#f7fbfa] px-3 py-2.5 text-sm text-[#183332] outline-none focus:border-[#128c7e] dark:border-[#355052] dark:bg-[#122021] dark:text-[#e3efed]"
                data-testid="input-user-admin-chat-reply"
              />
              <button type="submit" disabled={!draft.trim() || sendMessage.isPending} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#128c7e] text-white transition hover:bg-[#0d7469] disabled:opacity-50" aria-label="Send reply" data-testid="button-send-user-admin-chat-reply">
                <Send className="h-4 w-4" />
              </button>
            </form>
          ) : (
            <div className="border-t border-[#dcebe8] px-4 py-3 text-center text-xs text-[#78908d] dark:border-[#294143]" data-testid="status-admin-chat-replies-off">WhatsChat has turned replies off for this message.</div>
          )}
        </>
      )}
    </section>
  );
}
