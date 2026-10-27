import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAdminChatMessagesQueryKey,
  getGetAdminChatsQueryKey,
  useGetAdminChatMessages,
  useGetAdminChats,
  useMarkAdminChatRead,
  useSendAdminChatMessage,
  type AdminChatThread,
} from "@workspace/api-client-react";
import { Avatar } from "@/components/Avatar";
import { useToast } from "@/hooks/use-toast";
import { Check, MessageCircle, Send } from "lucide-react";

export function AdminChatResponses() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const threadsQuery = useGetAdminChats({
    query: {
      queryKey: getGetAdminChatsQueryKey(),
      staleTime: 10_000,
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    },
  });
  const messagesQuery = useGetAdminChatMessages(activeId ?? "", {
    query: {
      queryKey: getGetAdminChatMessagesQueryKey(activeId ?? ""),
      enabled: Boolean(activeId),
      refetchInterval: activeId ? 10_000 : false,
      refetchOnWindowFocus: true,
    },
  });
  const markRead = useMarkAdminChatRead();
  const sendMessage = useSendAdminChatMessage();
  const threads = threadsQuery.data ?? [];
  const activeThread = threads.find(thread => thread.id === activeId) ?? null;

  useEffect(() => {
    if (!activeId) return;
    markRead.mutate({ id: activeId }, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetAdminChatsQueryKey() });
      },
    });
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messagesQuery.data]);

  const onSend = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();
    if (!activeId || !content || sendMessage.isPending) return;
    sendMessage.mutate({ id: activeId, data: { content } }, {
      onSuccess: () => {
        setDraft("");
        void queryClient.invalidateQueries({ queryKey: getGetAdminChatMessagesQueryKey(activeId) });
        void queryClient.invalidateQueries({ queryKey: getGetAdminChatsQueryKey() });
      },
      onError: error => toast({
        title: "Reply not sent",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      }),
    });
  };

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-[#d7e7e4] bg-[#fbfefd] dark:border-[#294143] dark:bg-[#172526] lg:col-span-2" data-testid="admin-chat-responses">
      <header className="border-b border-[#e0ecea] px-5 py-5 dark:border-[#294143]">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-[#128c7e]" />
          <h2 className="font-semibold">Admin chat responses</h2>
          {threads.some(thread => thread.unread_for_admin > 0) && (
            <span className="rounded-full bg-[#e6f3f0] px-2 py-0.5 text-[10px] font-semibold text-[#128c7e] dark:bg-[#203d3a]" data-testid="badge-unread-admin-responses">
              {threads.reduce((total, thread) => total + thread.unread_for_admin, 0)} new
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-[#78908d] dark:text-[#9cb3b0]">Each recipient has a private conversation. Their replies are visible only here and to them.</p>
      </header>

      <div className="grid min-h-[360px] md:grid-cols-[minmax(220px,300px)_minmax(0,1fr)]">
        <div className="max-h-[480px] overflow-y-auto border-b border-[#e0ecea] dark:border-[#294143] md:border-b-0 md:border-r">
          {threadsQuery.isLoading ? (
            <div className="p-5 text-sm text-[#78908d]">Loading conversations…</div>
          ) : threadsQuery.isError ? (
            <div className="p-5 text-sm text-red-600">
              Responses could not be loaded.
              <button onClick={() => threadsQuery.refetch()} className="ml-2 font-semibold underline">Try again</button>
            </div>
          ) : threads.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-[#78908d]">Admin chat replies will appear here.</div>
          ) : (
            <div className="divide-y divide-[#e5efed] dark:divide-[#294143]">
              {threads.map(thread => (
                <ThreadRow key={thread.id} thread={thread} selected={activeId === thread.id} onClick={() => setActiveId(thread.id)} />
              ))}
            </div>
          )}
        </div>

        <div className="flex min-h-[360px] min-w-0 flex-col">
          {!activeThread ? (
            <div className="grid flex-1 place-items-center p-6 text-center text-sm text-[#78908d]">Choose a conversation to review messages and replies.</div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-[#e0ecea] px-4 py-3 dark:border-[#294143]">
                <Avatar src={activeThread.recipient_profile_picture} name={activeThread.recipient_name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{activeThread.recipient_name}</p>
                  <p className="truncate text-xs text-[#78908d]">@{activeThread.recipient_username} · {activeThread.title}</p>
                </div>
                {activeThread.allow_replies && <span className="shrink-0 rounded-full bg-[#e6f3f0] px-2 py-1 text-[10px] font-semibold text-[#128c7e] dark:bg-[#203d3a]">Replies on</span>}
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto bg-[#f5faf9] p-4 dark:bg-[#132122]" data-testid="admin-chat-message-list">
                {messagesQuery.isLoading ? <p className="text-sm text-[#78908d]">Loading messages…</p> :
                  messagesQuery.isError ? <p className="text-sm text-red-600">Messages could not be loaded.</p> :
                    (messagesQuery.data ?? []).map(message => {
                      const isAdmin = message.sender_type === "admin";
                      return (
                        <div key={message.id} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
                          <article className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${isAdmin ? "rounded-br-md bg-[#d9fdd3] text-[#183332] dark:bg-[#174c44] dark:text-[#e3efed]" : "rounded-bl-md border border-[#e0ecea] bg-white text-[#183332] dark:border-[#294143] dark:bg-[#172526] dark:text-[#e3efed]"}`}>
                            <p className="whitespace-pre-wrap break-words">{message.content}</p>
                            <time className="mt-1 block text-right text-[10px] opacity-60">{new Date(message.created_at).toLocaleString()}</time>
                          </article>
                        </div>
                      );
                    })}
                <div ref={bottomRef} />
              </div>
              <form onSubmit={onSend} className="flex items-end gap-2 border-t border-[#e0ecea] p-3 dark:border-[#294143]">
                <textarea
                  value={draft}
                  onChange={event => setDraft(event.target.value)}
                  maxLength={2000}
                  rows={2}
                  placeholder="Reply to this user…"
                  aria-label="Admin reply"
                  className="max-h-28 min-h-11 flex-1 resize-y rounded-xl border border-[#d5e5e2] bg-[#f7fbfa] px-3 py-2.5 text-sm text-[#183332] outline-none focus:border-[#128c7e] dark:border-[#355052] dark:bg-[#122021] dark:text-[#e3efed]"
                  data-testid="input-admin-chat-reply"
                />
                <button type="submit" disabled={!draft.trim() || sendMessage.isPending} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#128c7e] text-white transition hover:bg-[#0d7469] disabled:opacity-50" aria-label="Send admin reply" data-testid="button-send-admin-chat-reply">
                  {sendMessage.isPending ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function ThreadRow({ thread, selected, onClick }: { thread: AdminChatThread; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${selected ? "bg-[#edf6f4] dark:bg-[#203334]" : "hover:bg-[#f4f9f8] dark:hover:bg-[#1c2d2e]"}`}
      data-testid={`admin-chat-thread-${thread.id}`}
    >
      <Avatar src={thread.recipient_profile_picture} name={thread.recipient_name} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{thread.recipient_name}</span>
          {thread.unread_for_admin > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-[#25D366]" aria-label="Unread replies" />}
        </span>
        <span className="block truncate text-xs text-[#78908d]">{thread.last_sender === "user" ? `${thread.recipient_name}: ` : "WhatsChat: "}{thread.last_message}</span>
      </span>
      {thread.user_reply_count > 0 && <span className="shrink-0 rounded-full bg-[#e6f3f0] px-2 py-0.5 text-[10px] font-semibold text-[#128c7e] dark:bg-[#203d3a]">{thread.user_reply_count}</span>}
    </button>
  );
}
