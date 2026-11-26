import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetMyAdminChatMessagesQueryKey,
  getGetMyAdminChatsQueryKey,
  useGetMyAdminChatMessages,
  useGetMyAdminChats,
  useMarkMyAdminChatRead,
} from "@workspace/api-client-react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { WhatsChatAvatar } from "@/components/WhatsChatAvatar";

export function WhatsChatSystemWindow({ threadId, onBack }: { threadId: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const listRef = useRef<HTMLDivElement>(null);
  const threadsQuery = useGetMyAdminChats({
    query: {
      queryKey: getGetMyAdminChatsQueryKey(),
      staleTime: 10_000,
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    },
  });
  const messagesQuery = useGetMyAdminChatMessages(threadId, {
    query: {
      queryKey: getGetMyAdminChatMessagesQueryKey(threadId),
      enabled: Boolean(threadId),
      refetchInterval: 10_000,
      refetchOnWindowFocus: true,
    },
  });
  const markRead = useMarkMyAdminChatRead();
  const thread = (threadsQuery.data ?? []).find(item => item.id === threadId);

  useEffect(() => {
    if (!threadsQuery.isLoading && threadsQuery.data && !thread) onBack();
  }, [thread, threadsQuery.data, threadsQuery.isLoading, onBack]);

  useEffect(() => {
    if (!threadId) return;
    markRead.mutate({ id: threadId }, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetMyAdminChatsQueryKey() });
      },
    });
  }, [threadId]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messagesQuery.data]);

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#efeae2] text-[#183332] dark:bg-gray-950 dark:text-[#e3efed]" data-testid="whatschat-system-thread">
      <header className="z-10 flex h-16 flex-none items-center gap-3 border-b border-gray-200 bg-[#f0f2f5] px-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <button onClick={onBack} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-gray-600 transition hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-800" aria-label="Back to chats" data-testid="button-back-whatschat-thread">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <WhatsChatAvatar />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">WhatsChat <CheckCircle2 className="ml-1 inline h-3.5 w-3.5 text-[#128c7e]" /></h1>
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">{thread?.title || "App message"}</p>
        </div>
      </header>
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-5" data-testid="whatschat-system-messages">
        {messagesQuery.isLoading ? (
          <p className="text-center text-sm text-gray-500">Loading messages…</p>
        ) : messagesQuery.isError ? (
          <div className="rounded-xl bg-white/80 p-4 text-center text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            Messages could not be loaded. <button onClick={() => messagesQuery.refetch()} className="font-semibold text-[#128c7e]">Try again</button>
          </div>
        ) : (messagesQuery.data ?? []).length === 0 ? (
          <p className="text-center text-sm text-gray-500">No messages in this conversation.</p>
        ) : (
          (messagesQuery.data ?? []).map(message => (
            <div key={message.id} className={`flex ${message.sender_type === "user" ? "justify-end" : "justify-start"}`}>
              <article className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 shadow-sm ${message.sender_type === "user" ? "rounded-br-md bg-[#d9fdd3] text-[#183332] dark:bg-[#174c44] dark:text-[#e3efed]" : "rounded-bl-md border border-[#e0ecea] bg-white text-[#183332] dark:border-[#294143] dark:bg-[#172526] dark:text-[#e3efed]"}`}>
                <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>
                <time className="mt-1 block text-right text-[10px] opacity-60">{new Date(message.created_at).toLocaleString()}</time>
              </article>
            </div>
          ))
        )}
      </div>
      <footer className="border-t border-[#dcebe8] bg-white px-4 py-3 text-center text-xs text-[#78908d] dark:border-[#294143] dark:bg-gray-900 dark:text-gray-400" data-testid="status-whatschat-one-way">
        Only WhatsChat can send messages in this conversation.
      </footer>
    </section>
  );
}
