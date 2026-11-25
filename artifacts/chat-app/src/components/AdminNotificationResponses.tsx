import {
  getGetAdminNotificationRepliesQueryKey,
  useGetAdminNotificationReplies,
} from "@workspace/api-client-react";
import { AlertTriangle, BellRing, Clock3, MessageCircle, RefreshCw } from "lucide-react";

export function AdminNotificationResponses() {
  const repliesQuery = useGetAdminNotificationReplies({
    query: {
      queryKey: getGetAdminNotificationRepliesQueryKey(),
      staleTime: 10_000,
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    },
  });
  const replies = repliesQuery.data ?? [];

  return (
    <section className="overflow-hidden rounded-2xl border border-[#d7e7e4] bg-[#fbfefd] dark:border-[#294143] dark:bg-[#172526]" data-testid="admin-notification-responses">
      <header className="flex items-center justify-between gap-3 border-b border-[#e0ecea] px-5 py-4 dark:border-[#294143]">
        <div>
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-[#128c7e]" />
            <h2 className="font-semibold">App notification replies</h2>
          </div>
          <p className="mt-1 text-sm text-[#78908d] dark:text-[#9cb3b0]">Private responses, visible only to the sender and admins.</p>
        </div>
        <button
          type="button"
          onClick={() => repliesQuery.refetch()}
          disabled={repliesQuery.isFetching}
          aria-label="Refresh notification replies"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#78908d] transition hover:bg-[#edf5f3] disabled:opacity-50 dark:hover:bg-[#203334]"
          data-testid="button-refresh-notification-replies"
        >
          <RefreshCw className={`h-4 w-4 ${repliesQuery.isFetching ? "animate-spin" : ""}`} />
        </button>
      </header>

      {repliesQuery.isLoading ? (
        <p className="px-5 py-10 text-center text-sm text-[#78908d]">Loading replies…</p>
      ) : repliesQuery.isError ? (
        <div className="px-5 py-10 text-center">
          <p className="text-sm text-[#78908d]">Replies could not be loaded.</p>
          <button onClick={() => repliesQuery.refetch()} className="mt-3 rounded-lg bg-[#128c7e] px-4 py-2 text-sm font-semibold text-white">Try again</button>
        </div>
      ) : replies.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <BellRing className="mx-auto h-7 w-7 text-[#91aaa6]" />
          <p className="mt-3 text-sm font-medium">No replies yet</p>
          <p className="mt-1 text-xs text-[#78908d]">Responses appear here when a notification allows replies.</p>
        </div>
      ) : (
        <div className="divide-y divide-[#e5efed] dark:divide-[#294143]" data-testid="list-notification-replies">
          {replies.map(reply => (
            <article key={reply.id} className="flex gap-3 px-5 py-4" data-testid={`admin-notification-reply-${reply.id}`}>
              <div className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${reply.notification_type === "warning" ? "bg-[#fff1df] text-[#ac6b1d] dark:bg-[#3a3023] dark:text-[#edbc75]" : "bg-[#e7f3f1] text-[#128c7e] dark:bg-[#203d3a]"}`}>
                {reply.notification_type === "warning" ? <AlertTriangle className="h-4 w-4" /> : <BellRing className="h-4 w-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{reply.recipient_name} <span className="font-normal text-[#78908d]">@{reply.recipient_username}</span></p>
                  <time className="inline-flex items-center gap-1 text-[10px] text-[#91a6a3]"><Clock3 className="h-3 w-3" />{new Date(reply.created_at).toLocaleString()}</time>
                </div>
                <p className="mt-1 text-xs font-medium text-[#128c7e]">Re: {reply.notification_title}</p>
                <p className="mt-2 whitespace-pre-wrap rounded-xl bg-[#f0f7f5] px-3 py-2.5 text-sm text-[#294846] dark:bg-[#203334] dark:text-[#d1e3e0]">{reply.content}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
