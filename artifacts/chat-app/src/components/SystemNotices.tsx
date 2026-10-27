import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetMyAdminChatsQueryKey,
  getGetMyNotificationsQueryKey,
  useGetMyAdminChats,
  useGetMyNotifications,
  useMarkNotificationRead,
} from "@workspace/api-client-react";
import type { SystemNotification } from "@workspace/api-client-react";
import { AlertTriangle, BellRing, Check, Clock3, MessageCircle, RefreshCw } from "lucide-react";
import { AdminChatInbox } from "@/components/AdminChatInbox";

export default function SystemNotices() {
  const [view, setView] = useState<"notices" | "chats">("notices");
  const notificationsQuery = useGetMyNotifications({
    query: { queryKey: getGetMyNotificationsQueryKey(), staleTime: 20_000, refetchOnWindowFocus: true },
  });
  const chatsQuery = useGetMyAdminChats({
    query: { queryKey: getGetMyAdminChatsQueryKey(), staleTime: 10_000, refetchOnWindowFocus: true },
  });
  const markRead = useMarkNotificationRead();
  const queryClient = useQueryClient();
  const notices = useMemo(() => [...(notificationsQuery.data ?? [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()), [notificationsQuery.data]);
  const unreadNotices = notices.filter(notice => !notice.read).length;
  const unreadChats = chatsQuery.data?.reduce((total, thread) => total + thread.unread_count, 0) ?? 0;

  const handleRead = (notice: SystemNotification) => {
    if (notice.read || markRead.isPending) return;
    markRead.mutate({ id: notice.id }, {
      onSuccess: updated => {
        queryClient.setQueryData<SystemNotification[]>(getGetMyNotificationsQueryKey(), old =>
          old?.map(item => item.id === updated.id ? updated : item),
        );
        void queryClient.invalidateQueries({ queryKey: getGetMyNotificationsQueryKey() });
      },
    });
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-[#f7fbfa] text-[#183332] dark:bg-[#101b1c] dark:text-[#e3efed]" data-testid="system-notices-surface">
      <header className="border-b border-[#dcebe8] bg-[#fbfefd] px-5 py-5 dark:border-[#294143] dark:bg-[#172526] sm:px-7">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-start justify-between gap-4">
            <div>
            <div className="flex items-center gap-2"><BellRing className="h-5 w-5 text-[#128c7e]" /><h1 className="text-lg font-semibold">Updates</h1></div>
              <p className="mt-1 text-sm text-[#78908d] dark:text-[#9cb3b0]">Notices and private chats from WhatsChat.</p>
            </div>
            <button onClick={() => view === "notices" ? notificationsQuery.refetch() : chatsQuery.refetch()} disabled={notificationsQuery.isFetching || chatsQuery.isFetching} aria-label="Refresh updates" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#78908d] transition-colors hover:bg-[#edf5f3] disabled:opacity-50 dark:hover:bg-[#203334]" data-testid="button-refresh-notices"><RefreshCw className={`h-4 w-4 ${notificationsQuery.isFetching || chatsQuery.isFetching ? "animate-spin" : ""}`} /></button>
          </div>
          <div className="mt-4 grid grid-cols-2 rounded-xl bg-[#edf5f3] p-1 dark:bg-[#203334]" role="tablist" aria-label="Update type">
            <button onClick={() => setView("notices")} role="tab" aria-selected={view === "notices"} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${view === "notices" ? "bg-white text-[#128c7e] shadow-sm dark:bg-[#172526] dark:text-[#46cfc0]" : "text-[#78908d]"}`} data-testid="tab-one-way-notices">
              <BellRing className="h-4 w-4" />Notices{unreadNotices > 0 && <span className="rounded-full bg-[#25D366] px-1.5 py-0.5 text-[10px] font-bold text-white">{unreadNotices}</span>}
            </button>
            <button onClick={() => setView("chats")} role="tab" aria-selected={view === "chats"} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${view === "chats" ? "bg-white text-[#128c7e] shadow-sm dark:bg-[#172526] dark:text-[#46cfc0]" : "text-[#78908d]"}`} data-testid="tab-admin-chats">
              <MessageCircle className="h-4 w-4" />Admin chats{unreadChats > 0 && <span className="rounded-full bg-[#25D366] px-1.5 py-0.5 text-[10px] font-bold text-white">{unreadChats}</span>}
            </button>
          </div>
        </div>
      </header>
      {view === "chats" ? (
        <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 py-5 sm:px-7" role="tabpanel" data-testid="panel-admin-chats">
          <AdminChatInbox />
        </div>
      ) : (
      <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 py-5 sm:px-7" role="tabpanel" data-testid="panel-one-way-notices">
        {notificationsQuery.isLoading ? <NoticeSkeleton /> : notificationsQuery.isError ? (
          <div className="rounded-2xl border border-[#dcebe8] bg-[#fbfefd] px-6 py-12 text-center dark:border-[#294143] dark:bg-[#172526]" data-testid="status-notices-error"><BellRing className="mx-auto h-8 w-8 text-[#91aaa6]" /><p className="mt-3 font-semibold">Updates aren’t available</p><p className="mt-1 text-sm text-[#78908d]">Check your connection, then try again.</p><button onClick={() => notificationsQuery.refetch()} className="mt-4 rounded-lg bg-[#128c7e] px-4 py-2 text-sm font-semibold text-white" data-testid="button-retry-notices">Try again</button></div>
        ) : notices.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#c8ddda] bg-[#fbfefd] px-6 py-14 text-center dark:border-[#355052] dark:bg-[#172526]" data-testid="status-notices-empty"><div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#e7f3f1] text-[#128c7e] dark:bg-[#203334]"><BellRing className="h-5 w-5" /></div><h2 className="mt-4 font-semibold">You’re all caught up</h2><p className="mt-1 text-sm text-[#78908d]">When there’s something important, it’ll show up here.</p></div>
        ) : (
          <div className="space-y-3" data-testid="list-system-notices">
            {notices.map(notice => <NoticeCard key={notice.id} notice={notice} onRead={() => handleRead(notice)} />)}
          </div>
        )}
      </div>
      )}
    </section>
  );
}

function NoticeCard({ notice, onRead }: { notice: SystemNotification; onRead: () => void }) {
  const isWarning = notice.type === "warning";
  return (
    <article className={`relative overflow-hidden rounded-2xl border bg-[#fbfefd] dark:bg-[#172526] ${notice.read ? "border-[#dcebe8] dark:border-[#294143]" : "border-[#b8dad4] shadow-sm shadow-[#075e54]/5 dark:border-[#37615c]"}`} data-testid={`card-system-notice-${notice.id}`}>
      {!notice.read && <span className="absolute bottom-0 left-0 top-0 w-1 bg-[#128c7e]" />}
      <div className="flex gap-3 p-4 sm:p-5">
        <div className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl ${isWarning ? "bg-[#fff1df] text-[#ac6b1d] dark:bg-[#3a3023] dark:text-[#edbc75]" : "bg-[#e7f3f1] text-[#128c7e] dark:bg-[#203d3a]"}`} data-testid={`icon-notice-${notice.id}`}>{isWarning ? <AlertTriangle className="h-5 w-5" /> : <BellRing className="h-5 w-5" />}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-[10px] font-bold uppercase tracking-[0.14em] ${isWarning ? "text-[#a66a20]" : "text-[#128c7e]"}`} data-testid={`text-notice-type-${notice.id}`}>{isWarning ? "Warning" : "Update"}</span>
            {!notice.read && <span className="rounded-full bg-[#e6f3f0] px-2 py-0.5 text-[10px] font-semibold text-[#128c7e] dark:bg-[#203d3a]" data-testid={`status-notice-unread-${notice.id}`}>New</span>}
          </div>
          <h2 className="mt-1.5 text-[15px] font-semibold leading-5" data-testid={`text-notice-title-${notice.id}`}>{notice.title}</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#5b7773] dark:text-[#b3c8c5]" data-testid={`text-notice-content-${notice.id}`}>{notice.content}</p>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#e8f0ee] pt-3 dark:border-[#294143]">
            <span className="inline-flex items-center gap-1.5 text-xs text-[#829895]" data-testid={`text-notice-date-${notice.id}`}><Clock3 className="h-3.5 w-3.5" />{new Date(notice.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
            {!notice.read && <button onClick={onRead} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#128c7e] transition-colors hover:bg-[#edf6f4] dark:hover:bg-[#203334]" data-testid={`button-mark-notice-read-${notice.id}`}><Check className="h-3.5 w-3.5" />Mark as read</button>}
            {notice.read && <span className="inline-flex items-center gap-1 text-xs text-[#91a6a3]" data-testid={`status-notice-read-${notice.id}`}><Check className="h-3.5 w-3.5" />Read</span>}
          </div>
        </div>
      </div>
    </article>
  );
}

function NoticeSkeleton() {
  return <div className="space-y-3" aria-label="Loading updates" data-testid="loading-system-notices">{[0, 1, 2].map(i => <div key={i} className="flex animate-pulse gap-3 rounded-2xl border border-[#dcebe8] bg-[#fbfefd] p-5 dark:border-[#294143] dark:bg-[#172526]"><div className="h-10 w-10 rounded-xl bg-[#e1eeeb] dark:bg-[#294143]" /><div className="flex-1 space-y-3"><div className="h-2.5 w-16 rounded bg-[#e1eeeb] dark:bg-[#294143]" /><div className="h-4 w-48 rounded bg-[#e1eeeb] dark:bg-[#294143]" /><div className="h-3 w-full rounded bg-[#e1eeeb] dark:bg-[#294143]" /><div className="h-3 w-2/3 rounded bg-[#e1eeeb] dark:bg-[#294143]" /></div></div>)}</div>;
}
