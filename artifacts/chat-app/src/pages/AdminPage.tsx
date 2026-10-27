import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAdminChatsQueryKey,
  getGetAdminUsersQueryKey,
  useAdminLogin,
  useGetAdminUsers,
  useSendAdminChat,
  useSendAdminNotification,
} from "@workspace/api-client-react";
import type { AdminChatInput, AdminSession, AdminUser, AdminNotificationInput } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Avatar } from "@/components/Avatar";
import { AdminChatResponses } from "@/components/AdminChatResponses";
import { AlertTriangle, BellRing, LockKeyhole, LogOut, MessageCircle, Search, ShieldCheck, Users } from "lucide-react";

type LoginValues = { username: string; password: string };
type NoticeValues = { audience: "all" | "user"; type: "update" | "warning"; title: string; content: string };
type ChatValues = { audience: "all" | "user"; title: string; content: string; allow_replies: boolean };

const SESSION_KEY = "whatschat_admin_session";
const TOKEN_KEY = "admin_token";

function readSession(): AdminSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as AdminSession;
    if (!value.token || !value.expires_at || new Date(value.expires_at).getTime() <= Date.now()) {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export default function AdminPage() {
  const [session, setSession] = useState<AdminSession | null>(() => readSession());
  const [filter, setFilter] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const loginForm = useForm<LoginValues>({
    defaultValues: { username: new URLSearchParams(window.location.search).get("admin") ?? "", password: "" },
  });
  const noticeForm = useForm<NoticeValues>({ defaultValues: { audience: "all", type: "update", title: "", content: "" } });
  const chatForm = useForm<ChatValues>({ defaultValues: { audience: "all", title: "", content: "", allow_replies: false } });
  const login = useAdminLogin();
  const usersQuery = useGetAdminUsers({
    query: { enabled: Boolean(session), queryKey: getGetAdminUsersQueryKey(), staleTime: 30_000 },
  });
  const sendNotice = useSendAdminNotification();
  const sendChat = useSendAdminChat();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const users = usersQuery.data ?? [];
  const visibleUsers = users.filter(user =>
    `${user.name} ${user.username}`.toLowerCase().includes(filter.toLowerCase().trim()),
  );

  const onLogin = loginForm.handleSubmit(values => {
    login.mutate({ data: values }, {
      onSuccess: result => {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(result));
        sessionStorage.setItem(TOKEN_KEY, result.token);
        setSession(result);
      },
      onError: error => toast({ title: "Could not sign in", description: error instanceof Error ? error.message : "Check your details and try again.", variant: "destructive" }),
    });
  });

  const onSend = noticeForm.handleSubmit(values => {
    if (values.audience === "user" && !selectedUser) {
      toast({ title: "Choose a recipient", description: "Select a person from the directory first.", variant: "destructive" });
      return;
    }
    const payload: AdminNotificationInput = {
      audience: values.audience,
      ...(values.audience === "user" && selectedUser ? { recipient_id: selectedUser.id } : {}),
      type: values.type,
      title: values.title.trim(),
      content: values.content.trim(),
    };
    sendNotice.mutate({ data: payload }, {
      onSuccess: result => {
        toast({ title: "Notice sent", description: `Delivered to ${result.sent} ${result.sent === 1 ? "user" : "users"}.` });
        noticeForm.reset({ audience: "all", type: "update", title: "", content: "" });
      },
      onError: error => toast({ title: "Notice not sent", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" }),
    });
  });

  const onSendChat = chatForm.handleSubmit(values => {
    if (values.audience === "user" && !selectedUser) {
      toast({ title: "Choose a recipient", description: "Select a person from the directory first.", variant: "destructive" });
      return;
    }
    const payload: AdminChatInput = {
      audience: values.audience,
      ...(values.audience === "user" && selectedUser ? { recipient_id: selectedUser.id } : {}),
      title: values.title.trim(),
      content: values.content.trim(),
      allow_replies: values.allow_replies,
    };
    sendChat.mutate({ data: payload }, {
      onSuccess: result => {
        toast({ title: "Admin chat sent", description: `Created private chats for ${result.sent} ${result.sent === 1 ? "user" : "users"}.` });
        chatForm.reset({ audience: "all", title: "", content: "", allow_replies: false });
        void queryClient.invalidateQueries({ queryKey: getGetAdminChatsQueryKey() });
      },
      onError: error => toast({ title: "Admin chat not sent", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" }),
    });
  });

  const signOut = () => {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    setSession(null);
    setSelectedUser(null);
    queryClient.removeQueries({ queryKey: getGetAdminUsersQueryKey() });
    queryClient.removeQueries({ queryKey: getGetAdminChatsQueryKey() });
  };

  if (!session) {
    return (
      <main className="h-[100dvh] overflow-y-auto overscroll-contain bg-[#e8f3f1] dark:bg-[#101b1c] px-4 py-10 flex items-center justify-center" data-testid="admin-login-page">
        <section className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-[#d0e2df] dark:border-[#294143] bg-[#fbfefd] dark:bg-[#172526] shadow-xl shadow-[#075e54]/10">
          <div className="bg-[#075e54] px-7 py-7 text-white">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/12"><ShieldCheck className="h-6 w-6" /></span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/65">WhatsChat</p>
                <h1 className="text-xl font-semibold tracking-tight">Admin sign in</h1>
              </div>
            </div>
            <p className="mt-5 max-w-xs text-sm leading-6 text-white/75">A private workspace for managing accounts and sending important notices.</p>
          </div>
          <form onSubmit={onLogin} className="space-y-5 p-7" data-testid="form-admin-login">
            <div>
              <label htmlFor="admin-username" className="mb-1.5 block text-sm font-medium text-[#294143] dark:text-[#dce9e7]">Admin username</label>
              <input id="admin-username" autoComplete="username" {...loginForm.register("username", { required: "Enter your username" })} className={inputClass} data-testid="input-admin-username" />
              {loginForm.formState.errors.username && <p className="mt-1 text-xs text-red-600" data-testid="error-admin-username">{loginForm.formState.errors.username.message}</p>}
            </div>
            <div>
              <label htmlFor="admin-password" className="mb-1.5 block text-sm font-medium text-[#294143] dark:text-[#dce9e7]">Password</label>
              <input id="admin-password" type="password" autoComplete="current-password" {...loginForm.register("password", { required: "Enter your password" })} className={inputClass} data-testid="input-admin-password" />
              {loginForm.formState.errors.password && <p className="mt-1 text-xs text-red-600" data-testid="error-admin-password">{loginForm.formState.errors.password.message}</p>}
            </div>
            <div className="flex items-start gap-2 rounded-xl bg-[#edf6f4] dark:bg-[#203334] p-3 text-xs leading-5 text-[#52706d] dark:text-[#b0c8c4]">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[#128c7e]" />
              Admin access is protected and this session stays on this device only.
            </div>
            <button type="submit" disabled={login.isPending} className="w-full rounded-xl bg-[#128c7e] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0d7469] disabled:cursor-wait disabled:opacity-60" data-testid="button-admin-login">
              {login.isPending ? "Signing in…" : "Continue securely"}
            </button>
            {login.isError && <p className="text-sm text-red-600" role="alert" data-testid="status-admin-login-error">Sign in failed. Please check your details and try again.</p>}
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="h-[100dvh] overflow-y-auto overscroll-contain bg-[#edf5f3] dark:bg-[#101b1c] text-[#183332] dark:text-[#e3efed]" data-testid="admin-directory-page">
      <header className="sticky top-0 z-10 border-b border-[#d7e7e4] dark:border-[#294143] bg-[#f9fcfb] dark:bg-[#172526]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-7">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#128c7e] text-white"><ShieldCheck className="h-5 w-5" /></div>
            <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#71908c]">WhatsChat</p><h1 className="text-lg font-semibold">Admin directory</h1></div>
          </div>
          <button onClick={signOut} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[#57716e] transition-colors hover:bg-[#edf5f3] dark:hover:bg-[#203334]" data-testid="button-admin-signout"><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Sign out</span></button>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-7 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 rounded-2xl border border-[#d7e7e4] dark:border-[#294143] bg-[#fbfefd] dark:bg-[#172526]">
          <div className="flex flex-col gap-4 border-b border-[#e0ecea] dark:border-[#294143] px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2"><Users className="h-4 w-4 text-[#128c7e]" /><h2 className="font-semibold">People</h2></div>
              <p className="mt-1 text-sm text-[#78908d] dark:text-[#9cb3b0]">Public account details only · {users.length} registered</p>
            </div>
            <label className="relative block w-full sm:max-w-[260px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#829a97]" />
              <input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Find a person" className={`${inputClass} pl-9`} data-testid="input-user-search" />
            </label>
          </div>
          {usersQuery.isLoading ? <UserSkeleton /> : usersQuery.isError ? (
            <div className="p-8 text-center" data-testid="status-users-error"><p className="font-medium">People could not be loaded</p><p className="mt-1 text-sm text-[#78908d]">Check your connection, then try again.</p><button onClick={() => usersQuery.refetch()} className="mt-4 rounded-lg bg-[#128c7e] px-4 py-2 text-sm font-semibold text-white" data-testid="button-retry-users">Try again</button></div>
          ) : users.length === 0 ? (
            <div className="px-6 py-14 text-center" data-testid="status-users-empty"><Users className="mx-auto h-8 w-8 text-[#91aaa6]" /><p className="mt-3 font-medium">No accounts to show yet</p><p className="mt-1 text-sm text-[#78908d]">Registered users will appear here.</p></div>
          ) : visibleUsers.length === 0 ? (
            <p className="p-8 text-center text-sm text-[#78908d]" data-testid="status-users-no-results">No people match “{filter}”.</p>
          ) : (
            <div className="divide-y divide-[#e5efed] dark:divide-[#294143]">
              {visibleUsers.map(user => <AdminUserRow key={user.id} user={user} selected={selectedUser?.id === user.id} onSelect={() => { setSelectedUser(user); noticeForm.reset({ audience: "user", type: "update", title: "", content: "" }); chatForm.setValue("audience", "user"); }} />)}
            </div>
          )}
        </section>

        <div className="space-y-5">
          <section className="h-fit rounded-2xl border border-[#d7e7e4] bg-[#fbfefd] dark:border-[#294143] dark:bg-[#172526]">
            <div className="border-b border-[#e0ecea] px-5 py-5 dark:border-[#294143]">
              <div className="flex items-center gap-2"><BellRing className="h-4 w-4 text-[#128c7e]" /><h2 className="font-semibold">Send a notice</h2></div>
              <p className="mt-1 text-sm text-[#78908d] dark:text-[#9cb3b0]">One-way update or warning. Users cannot reply.</p>
            </div>
            <form onSubmit={onSend} className="space-y-4 p-5" data-testid="form-admin-notice">
              <div>
                <label htmlFor="notice-audience" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#78908d]">Send to</label>
                <select id="notice-audience" {...noticeForm.register("audience")} className={inputClass} data-testid="select-notice-audience">
                  <option value="all">Everyone</option><option value="user">One selected person</option>
                </select>
              </div>
              {noticeForm.watch("audience") === "user" && (selectedUser
                ? <SelectedRecipient user={selectedUser} onClear={() => setSelectedUser(null)} />
                : <p className="rounded-lg bg-[#edf6f4] p-3 text-xs leading-5 text-[#52706d] dark:bg-[#203334] dark:text-[#b0c8c4]">Select a person from the directory before sending.</p>)}
              <div>
                <label htmlFor="notice-type" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#78908d]">Notice type</label>
                <select id="notice-type" {...noticeForm.register("type")} className={inputClass} data-testid="select-notice-type">
                  <option value="update">Update</option><option value="warning">Warning</option>
                </select>
              </div>
              <div>
                <label htmlFor="notice-title" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#78908d]">Title</label>
                <input id="notice-title" maxLength={120} {...noticeForm.register("title", { required: "Add a title", maxLength: 120 })} placeholder="A short, clear headline" className={inputClass} data-testid="input-notice-title" />
                {noticeForm.formState.errors.title && <p className="mt-1 text-xs text-red-600" data-testid="error-notice-title">A title is required (up to 120 characters).</p>}
              </div>
              <div>
                <label htmlFor="notice-content" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#78908d]">Message</label>
                <textarea id="notice-content" rows={4} maxLength={2000} {...noticeForm.register("content", { required: "Add a message", maxLength: 2000 })} placeholder="Write the details they need to know…" className={`${inputClass} resize-y`} data-testid="input-notice-content" />
                <p className="mt-1 text-right text-xs text-[#91a6a3]">{noticeForm.watch("content").length}/2000</p>
                {noticeForm.formState.errors.content && <p className="mt-1 text-xs text-red-600" data-testid="error-notice-content">A message is required.</p>}
              </div>
              {noticeForm.watch("type") === "warning" && <p className="flex gap-2 rounded-lg bg-[#fff4e6] p-3 text-xs leading-5 text-[#8a5a1c] dark:bg-[#3b3021] dark:text-[#f0c98d]" data-testid="warning-notice-note"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Warnings should be reserved for important account or safety information.</p>}
              <button type="submit" disabled={sendNotice.isPending || (noticeForm.watch("audience") === "user" && !selectedUser)} className="w-full rounded-xl bg-[#128c7e] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0d7469] disabled:opacity-60" data-testid="button-send-notice">{sendNotice.isPending ? "Sending…" : noticeForm.watch("audience") === "all" ? "Send notice to everyone" : "Send one-way notice"}</button>
            </form>
          </section>

          <section className="h-fit rounded-2xl border border-[#d7e7e4] bg-[#fbfefd] dark:border-[#294143] dark:bg-[#172526]">
            <div className="border-b border-[#e0ecea] px-5 py-5 dark:border-[#294143]">
              <div className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-[#128c7e]" /><h2 className="font-semibold">Start an admin chat</h2></div>
              <p className="mt-1 text-sm text-[#78908d] dark:text-[#9cb3b0]">Private conversations. Turn replies on when you want responses.</p>
            </div>
            <form onSubmit={onSendChat} className="space-y-4 p-5" data-testid="form-admin-chat">
              <div>
                <label htmlFor="chat-audience" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#78908d]">Send to</label>
                <select id="chat-audience" {...chatForm.register("audience")} className={inputClass} data-testid="select-chat-audience">
                  <option value="all">Everyone</option><option value="user">One selected person</option>
                </select>
              </div>
              {chatForm.watch("audience") === "user" && (selectedUser
                ? <SelectedRecipient user={selectedUser} onClear={() => setSelectedUser(null)} />
                : <p className="rounded-lg bg-[#edf6f4] p-3 text-xs leading-5 text-[#52706d] dark:bg-[#203334] dark:text-[#b0c8c4]">Select a person from the directory before sending.</p>)}
              <div>
                <label htmlFor="chat-title" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#78908d]">Subject</label>
                <input id="chat-title" maxLength={120} {...chatForm.register("title", { required: true, maxLength: 120 })} placeholder="What is this chat about?" className={inputClass} data-testid="input-admin-chat-title" />
              </div>
              <div>
                <label htmlFor="chat-content" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#78908d]">Message</label>
                <textarea id="chat-content" rows={4} maxLength={2000} {...chatForm.register("content", { required: true, maxLength: 2000 })} placeholder="Write your message…" className={`${inputClass} resize-y`} data-testid="input-admin-chat-content" />
              </div>
              <label className="flex items-start gap-3 rounded-xl bg-[#edf6f4] p-3 text-sm dark:bg-[#203334]">
                <input type="checkbox" {...chatForm.register("allow_replies")} className="mt-0.5 h-4 w-4 accent-[#128c7e]" data-testid="checkbox-admin-chat-replies" />
                <span><span className="font-semibold">Allow recipients to reply</span><span className="mt-0.5 block text-xs leading-5 text-[#78908d] dark:text-[#b0c8c4]">Each reply stays private between that user and the admin.</span></span>
              </label>
              <button type="submit" disabled={sendChat.isPending || (chatForm.watch("audience") === "user" && !selectedUser)} className="w-full rounded-xl bg-[#128c7e] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0d7469] disabled:opacity-60" data-testid="button-send-admin-chat">{sendChat.isPending ? "Sending…" : "Start admin chat"}</button>
            </form>
          </section>
        </div>

        <AdminChatResponses />
      </div>
    </main>
  );
}

function AdminUserRow({ user, selected, onSelect }: { user: AdminUser; selected: boolean; onSelect: () => void }) {
  const online = user.last_seen ? Date.now() - new Date(user.last_seen).getTime() < 5 * 60_000 : false;
  return (
    <div className={`flex items-center gap-3 px-5 py-3.5 transition-colors ${selected ? "bg-[#edf6f4] dark:bg-[#203334]" : "hover:bg-[#f4f9f8] dark:hover:bg-[#1c2d2e]"}`} data-testid={`row-admin-user-${user.id}`}>
      <Avatar src={user.profile_picture} name={user.name} size="md" online={online} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2"><p className="truncate text-sm font-semibold" data-testid={`text-user-name-${user.id}`}>{user.name}</p>{user.is_admin && <span className="rounded-full bg-[#e6f2f0] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#128c7e] dark:bg-[#203d3a]">Admin</span>}</div>
        <p className="truncate text-xs text-[#78908d]" data-testid={`text-user-username-${user.id}`}>@{user.username}{user.status ? ` · ${user.status}` : ""}</p>
      </div>
      <button onClick={onSelect} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${selected ? "bg-[#d5ebe7] text-[#075e54] dark:bg-[#294744]" : "bg-[#128c7e] text-white hover:bg-[#0d7469]"}`} data-testid={`button-select-user-${user.id}`}>{selected ? "Selected" : "Select"}</button>
    </div>
  );
}

function SelectedRecipient({ user, onClear }: { user: AdminUser; onClear: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-[#edf6f4] p-3 dark:bg-[#203334]" data-testid={`selected-recipient-${user.id}`}>
      <Avatar src={user.profile_picture} name={user.name} size="sm" />
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{user.name}</p><p className="text-xs text-[#78908d]">@{user.username}</p></div>
      <button type="button" onClick={onClear} className="text-xs font-medium text-[#128c7e]" data-testid="button-clear-recipient">Change</button>
    </div>
  );
}

function UserSkeleton() {
  return <div className="animate-pulse divide-y divide-[#e5efed] p-2" aria-label="Loading people" data-testid="loading-admin-users">{[0, 1, 2, 3].map(i => <div key={i} className="flex items-center gap-3 px-3 py-4"><div className="h-10 w-10 rounded-full bg-[#e1eeeb] dark:bg-[#294143]" /><div className="flex-1 space-y-2"><div className="h-3 w-32 rounded bg-[#e1eeeb] dark:bg-[#294143]" /><div className="h-2.5 w-48 rounded bg-[#e1eeeb] dark:bg-[#294143]" /></div></div>)}</div>;
}

const inputClass = "w-full rounded-xl border border-[#d5e5e2] bg-[#f7fbfa] px-3.5 py-3 text-sm text-[#183332] outline-none transition focus:border-[#128c7e] focus:ring-2 focus:ring-[#128c7e]/15 dark:border-[#355052] dark:bg-[#122021] dark:text-[#e3efed]";
