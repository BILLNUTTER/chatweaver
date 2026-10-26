import { Link, useParams } from "wouter";
import { useGetPublicProfileByUsername, getGetPublicProfileByUsernameQueryKey } from "@workspace/api-client-react";
import { ArrowLeft, CalendarDays, Check, Clock3, MessageCircle, UserRound } from "lucide-react";
import { Avatar } from "@/components/Avatar";

export default function PublicProfilePage() {
  const params = useParams<{ username: string }>();
  const username = (params.username ?? "").replace(/^@/, "");
  const profileQuery = useGetPublicProfileByUsername(username, {
    query: { enabled: Boolean(username), queryKey: getGetPublicProfileByUsernameQueryKey(username), staleTime: 60_000 },
  });
  const profile = profileQuery.data;
  const online = profile?.last_seen ? Date.now() - new Date(profile.last_seen).getTime() < 5 * 60_000 : false;

  return (
    <main className="min-h-[100dvh] bg-[#e8f3f1] px-4 py-6 dark:bg-[#101b1c]" data-testid="public-profile-page">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="mb-5 inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-[#52706d] transition-colors hover:bg-white/60 dark:text-[#b0c8c4] dark:hover:bg-[#203334]" data-testid="link-back-to-chats"><ArrowLeft className="h-4 w-4" />Back to WhatsChat</Link>
        {profileQuery.isLoading ? (
          <section className="overflow-hidden rounded-2xl border border-[#d1e2df] bg-[#fbfefd] dark:border-[#294143] dark:bg-[#172526]" data-testid="loading-public-profile">
            <div className="h-44 animate-pulse bg-[#dcebe8] dark:bg-[#203334]" />
            <div className="px-6 pb-7"><div className="-mt-12 h-24 w-24 animate-pulse rounded-full border-4 border-[#fbfefd] bg-[#c9deda] dark:border-[#172526] dark:bg-[#294143]" /><div className="mt-4 h-5 w-40 animate-pulse rounded bg-[#e1eeeb] dark:bg-[#294143]" /><div className="mt-3 h-3 w-28 animate-pulse rounded bg-[#e1eeeb] dark:bg-[#294143]" /></div>
          </section>
        ) : profileQuery.isError ? (
          <section className="rounded-2xl border border-[#d1e2df] bg-[#fbfefd] p-10 text-center dark:border-[#294143] dark:bg-[#172526]" data-testid="status-profile-error"><UserRound className="mx-auto h-8 w-8 text-[#91aaa6]" /><h1 className="mt-3 font-semibold text-[#183332] dark:text-[#e3efed]">Profile unavailable</h1><p className="mt-1 text-sm text-[#78908d]">This profile could not be loaded right now.</p><button onClick={() => profileQuery.refetch()} className="mt-4 rounded-lg bg-[#128c7e] px-4 py-2 text-sm font-semibold text-white" data-testid="button-retry-profile">Try again</button></section>
        ) : !profile ? (
          <section className="rounded-2xl border border-[#d1e2df] bg-[#fbfefd] p-10 text-center dark:border-[#294143] dark:bg-[#172526]" data-testid="status-profile-empty"><UserRound className="mx-auto h-8 w-8 text-[#91aaa6]" /><h1 className="mt-3 font-semibold">No profile found</h1><p className="mt-1 text-sm text-[#78908d]">Check the username and try again.</p></section>
        ) : (
          <article className="overflow-hidden rounded-2xl border border-[#d1e2df] bg-[#fbfefd] shadow-sm shadow-[#075e54]/5 dark:border-[#294143] dark:bg-[#172526]" data-testid={`card-public-profile-${profile.id}`}>
            <div className="relative h-44 overflow-hidden bg-[#128c7e] sm:h-56" data-testid="profile-cover">
              {profile.cover_photo ? <img src={profile.cover_photo} alt="" className="h-full w-full object-cover" data-testid="img-profile-cover" /> : <div className="absolute inset-0 bg-[linear-gradient(135deg,#075e54_0%,#128c7e_60%,#73b9ad_100%)]"><div className="absolute -right-8 -top-20 h-64 w-64 rounded-full border border-white/15" /><div className="absolute -right-1 -top-12 h-48 w-48 rounded-full border border-white/15" /><div className="absolute bottom-4 left-6 text-xs font-semibold uppercase tracking-[0.25em] text-white/50">WhatsChat profile</div></div>}
            </div>
            <div className="px-5 pb-7 sm:px-8">
              <div className="-mt-12 flex items-end justify-between gap-4">
                <div className="rounded-full border-4 border-[#fbfefd] dark:border-[#172526]"><Avatar src={profile.profile_picture} name={profile.name} size="xl" online={online} className="[&>img]:h-24 [&>img]:w-24 [&>div]:h-24 [&>div]:w-24" /></div>
                <span className={`mb-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${online ? "bg-[#e2f4ee] text-[#16825e] dark:bg-[#203c34] dark:text-[#80d3b4]" : "bg-[#edf3f2] text-[#718a87] dark:bg-[#203334] dark:text-[#a4bbb8]"}`} data-testid="status-profile-presence"><span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-[#20a977]" : "bg-[#91a8a5]"}`} />{online ? "Online" : "Last seen recently"}</span>
              </div>
              <div className="mt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-[#183332] dark:text-[#e3efed]" data-testid="text-profile-name">{profile.name}</h1>
                  {profile.is_verified && <span className="inline-flex items-center gap-1 rounded-full bg-[#e7f4f1] px-2 py-1 text-xs font-semibold text-[#128c7e] dark:bg-[#203d3a]" data-testid="badge-profile-verified"><Check className="h-3.5 w-3.5" />Verified</span>}
                </div>
                <p className="mt-1 text-sm text-[#78908d]" data-testid="text-profile-username">@{profile.username}</p>
              </div>
              {profile.status && <div className="mt-6 rounded-xl bg-[#f0f7f5] px-4 py-4 dark:bg-[#203334]" data-testid="text-profile-status"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#78908d]">About</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#294846] dark:text-[#d1e3e0]">{profile.status}</p></div>}
              <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 border-t border-[#e5efed] pt-5 text-xs text-[#78908d] dark:border-[#294143]" data-testid="profile-details">
                <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4" />Joined {new Date(profile.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
                <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4" />{online ? "Available now" : "Not currently active"}</span>
              </div>
              <div className="mt-6 rounded-xl border border-[#dcebe8] px-4 py-3 text-sm text-[#617c78] dark:border-[#294143] dark:text-[#a7bfbb]" data-testid="profile-privacy-note"><MessageCircle className="mr-2 inline h-4 w-4 text-[#128c7e]" />This is the public profile for @{profile.username}.</div>
            </div>
          </article>
        )}
      </div>
    </main>
  );
}
