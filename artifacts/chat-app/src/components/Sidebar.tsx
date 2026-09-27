import { useState, useEffect, useRef } from "react";
import {
  MessageCircle, Users, Settings, Search, Plus, Moon, Sun, LogOut,
  X, Check, Trash2, AlertTriangle, UserSearch
} from "lucide-react";
import { Avatar } from "./Avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useConversations, type ConversationWithDetails } from "@/hooks/useConversations";
import { useContacts } from "@/hooks/useContacts";
import { updateUser } from "@/lib/storage";
import { useToast } from "@/hooks/use-toast";
import { format, isToday, isYesterday, isThisWeek } from "date-fns";
import type { DBUser } from "@/lib/database.types";

type Panel = "chats" | "contacts" | "settings";
type ContactTab = "my" | "find";

interface SidebarProps {
  selectedConversationId: string | null;
  onSelectConversation: (id: string) => void;
}

interface GlobalResults {
  chats: ConversationWithDetails[];
  contacts: DBUser[];
  others: DBUser[];
}

export function Sidebar({ selectedConversationId, onSelectConversation }: SidebarProps) {
  const { user, dbUser, signOut, deleteAccount, refreshUser } = useAuth();
  const { conversations, loading: convsLoading, markConversationRead } = useConversations();
  const { contacts, loading: contactsLoading, addContact, searchUsers, startConversation } = useContacts();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();

  const [panel, setPanel] = useState<Panel>("chats");
  const [contactTab, setContactTab] = useState<ContactTab>("find");

  const [search, setSearch] = useState("");
  const [globalResults, setGlobalResults] = useState<GlobalResults | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [findQuery, setFindQuery] = useState("");
  const [findResults, setFindResults] = useState<DBUser[]>([]);
  const [findLoading, setFindLoading] = useState(false);
  const findTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [addingId, setAddingId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [profileUsername, setProfileUsername] = useState("");
  const [profileStatus, setProfileStatus] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  useEffect(() => {
    if (!dbUser) return;
    setProfileUsername(dbUser.username);
    setProfileStatus(dbUser.status ?? "");
  }, [dbUser?.id]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = search.trim();
    if (!q) { setGlobalResults(null); setSearchLoading(false); return; }
    setSearchLoading(true);
    searchTimer.current = setTimeout(async () => {
      const matchedChats = conversations.filter(c => {
        const name = c.is_group ? c.group_name : c.other_user?.name;
        return name?.toLowerCase().includes(q.toLowerCase());
      });
      const allUsers = await searchUsers(q);
      const chatUserIds = new Set(matchedChats.map(c => c.other_user?.id).filter(Boolean));
      const matchedContacts = allUsers.filter(u => dbUser?.friends?.includes(u.id) && !chatUserIds.has(u.id));
      const matchedOthers = allUsers.filter(u => !dbUser?.friends?.includes(u.id) && !chatUserIds.has(u.id));
      setGlobalResults({ chats: matchedChats, contacts: matchedContacts, others: matchedOthers });
      setSearchLoading(false);
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search, conversations]);

  useEffect(() => {
    if (contactTab !== "find" || panel !== "contacts") return;
    if (findTimer.current) clearTimeout(findTimer.current);
    setFindLoading(true);
    const delay = findQuery.trim().length > 0 ? 350 : 0;
    findTimer.current = setTimeout(async () => {
      const results = await searchUsers(findQuery);
      setFindResults(results);
      setFindLoading(false);
    }, delay);
    return () => { if (findTimer.current) clearTimeout(findTimer.current); };
  }, [findQuery, contactTab, panel]);

  const handleAddContact = async (userId: string) => {
    setAddingId(userId);
    await addContact(userId);
    setAddingId(null);
    setContactTab("my");
  };

  const handleUserClick = async (userId: string) => {
    const convId = await startConversation(userId);
    if (convId) { markConversationRead(convId); onSelectConversation(convId); setPanel("chats"); setSearch(""); }
  };

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    setDeleteError("");
    const { error } = await deleteAccount();
    setDeleteLoading(false);
    if (error) setDeleteError(error);
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setProfileSaving(true);
    try {
      await updateUser(user.id, {
        username: profileUsername.trim().toLowerCase(),
        status: profileStatus.trim(),
      });
      await refreshUser();
      toast({ title: "Profile updated", description: "Your username and status were saved." });
    } catch (error) {
      toast({
        title: "Profile not saved",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setProfileSaving(false);
    }
  };

  const isOnline = (lastSeen?: string | null) => {
    if (!lastSeen) return false;
    return Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000;
  };

  const onlineProp = (lastSeen?: string | null): boolean | undefined =>
    lastSeen ? isOnline(lastSeen) : undefined;

  const isContact = (userId: string) => dbUser?.friends?.includes(userId) ?? false;

  const chatTime = (iso: string) => {
    const d = new Date(iso);
    if (isToday(d)) return format(d, "HH:mm");
    if (isYesterday(d)) return "Yesterday";
    if (isThisWeek(d, { weekStartsOn: 1 })) return format(d, "EEE");
    return format(d, "dd/MM/yy");
  };

  const totalSearchResults = globalResults
    ? globalResults.chats.length + globalResults.contacts.length + globalResults.others.length
    : 0;

  return (
    <div className="flex flex-col md:flex-row h-full min-h-0 w-full overflow-hidden">

      {/* ── MOBILE TOP BAR (hidden on md+) ── */}
      <div className="md:hidden flex-shrink-0 sticky top-0 z-20 bg-[#128C7E] dark:bg-gray-900 transition-colors">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Avatar src={dbUser?.profile_picture} name={dbUser?.name ?? "U"} size="sm" online />
            <span className="text-white font-bold text-lg tracking-tight">WhatsChat</span>
          </div>
          <div className="flex items-center gap-0.5">
            <button onClick={toggleTheme}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors">
              {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button onClick={signOut}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
        {/* Mobile tab bar */}
        <div className="flex border-t border-white/20">
          <MobileTabBtn label="CHATS" active={panel === "chats"} onClick={() => setPanel("chats")} />
          <MobileTabBtn label="PEOPLE" active={panel === "contacts"} onClick={() => setPanel("contacts")} />
          <MobileTabBtn label="SETTINGS" active={panel === "settings"} onClick={() => setPanel("settings")} />
        </div>
      </div>

      {/* ── DESKTOP ICON RAIL (hidden on mobile) ── */}
      <div className="hidden md:flex flex-col items-center w-14 bg-[#128C7E] dark:bg-gray-900 py-3 gap-1 flex-shrink-0 transition-colors duration-200">
        <div className="mb-3">
          <Avatar src={dbUser?.profile_picture} name={dbUser?.name ?? "U"} size="sm" online />
        </div>
        <NavBtn active={panel === "chats"} onClick={() => setPanel("chats")} title="Chats">
          <MessageCircle className="w-5 h-5" />
        </NavBtn>
        <NavBtn active={panel === "contacts"} onClick={() => setPanel("contacts")} title="People">
          <Users className="w-5 h-5" />
        </NavBtn>
        <div className="flex-1" />
        <NavBtn active={false} onClick={toggleTheme} title={theme === "dark" ? "Light mode" : "Dark mode"}>
          {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </NavBtn>
        <NavBtn active={panel === "settings"} onClick={() => setPanel("settings")} title="Settings">
          <Settings className="w-5 h-5" />
        </NavBtn>
        <NavBtn active={false} onClick={signOut} title="Sign out">
          <LogOut className="w-5 h-5" />
        </NavBtn>
      </div>

      {/* ── PANEL CONTENT ── */}
      <div className="flex flex-col flex-1 min-h-0 min-w-0 bg-white dark:bg-gray-900 md:border-r border-gray-200 dark:border-gray-800 transition-colors duration-200 overflow-hidden">

        {/* ── CHATS ── */}
        {panel === "chats" && (
          <>
            <div className="px-4 pt-4 pb-3">
              <h2 className="hidden md:block text-base font-bold text-gray-900 dark:text-white mb-3">Chats</h2>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search chats, contacts, people…"
                  className="w-full pl-9 pr-8 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-[#128C7E] border-none transition-colors duration-200"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {search.trim() ? (
                searchLoading ? <LoadingList /> :
                totalSearchResults === 0 ? (
                  <EmptyHint icon={<Search className="w-8 h-8" />} text="No results found" />
                ) : (
                  <>
                    {globalResults!.chats.length > 0 && (
                      <section>
                        <SectionLabel>Chats</SectionLabel>
                        {globalResults!.chats.map(conv => {
                          const name = conv.is_group ? (conv.group_name ?? "Group") : (conv.other_user?.name ?? "Unknown");
                          const pic = conv.is_group ? conv.group_photo : conv.other_user?.profile_picture;
                          const online = !conv.is_group ? onlineProp(conv.other_user?.last_seen) : undefined;
                          return (
                            <button key={conv.id} onClick={() => { markConversationRead(conv.id); onSelectConversation(conv.id); setSearch(""); }}
                              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left ${selectedConversationId === conv.id ? "bg-gray-100 dark:bg-gray-800" : ""}`}>
                              <Avatar src={pic} name={name} size="md" online={online} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-gray-900 dark:text-white text-sm truncate">{name}</span>
                                  {conv.last_message_at && (
                                    <span className="text-xs text-gray-400 ml-2 flex-shrink-0">{chatTime(conv.last_message_at)}</span>
                                  )}
                                </div>
                                <span className="text-xs text-gray-500 dark:text-gray-400 truncate block max-w-[180px]">
                                  {conv.last_message ?? "Start a conversation"}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </section>
                    )}
                    {globalResults!.contacts.length > 0 && (
                      <section>
                        <SectionLabel>Contacts</SectionLabel>
                        {globalResults!.contacts.map(u => (
                          <UserRow key={u.id} u={u} isContact isFriend
                            online={onlineProp(u.last_seen)}
                            onChat={() => handleUserClick(u.id)}
                            onAdd={() => handleAddContact(u.id)}
                            adding={addingId === u.id}
                          />
                        ))}
                      </section>
                    )}
                    {globalResults!.others.length > 0 && (
                      <section>
                        <SectionLabel>People on this app</SectionLabel>
                        {globalResults!.others.map(u => (
                          <UserRow key={u.id} u={u} isContact={false} isFriend={false}
                            online={onlineProp(u.last_seen)}
                            onChat={() => handleUserClick(u.id)}
                            onAdd={() => handleAddContact(u.id)}
                            adding={addingId === u.id}
                          />
                        ))}
                      </section>
                    )}
                  </>
                )
              ) : (
                convsLoading && conversations.length === 0 ? <LoadingList /> :
                conversations.length === 0 ? (
                  <EmptyHint icon={<MessageCircle className="w-8 h-8" />}
                    text="No chats yet — go to People to find someone" />
                ) : conversations.map(conv => {
                  const name = conv.is_group ? (conv.group_name ?? "Group") : (conv.other_user?.name ?? "Unknown");
                  const pic = conv.is_group ? conv.group_photo : conv.other_user?.profile_picture;
                  const online = !conv.is_group ? onlineProp(conv.other_user?.last_seen) : undefined;
                  return (
                    <button key={conv.id} onClick={() => { markConversationRead(conv.id); onSelectConversation(conv.id); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left ${selectedConversationId === conv.id ? "bg-gray-100 dark:bg-gray-800" : ""}`}>
                      <Avatar src={pic} name={name} size="md" online={online} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-gray-900 dark:text-white text-sm truncate">{name}</span>
                          {conv.last_message_at && (
                            <span className="text-xs text-gray-400 dark:text-gray-500 ml-2 flex-shrink-0">{chatTime(conv.last_message_at)}</span>
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[160px]">
                            {conv.last_message ?? "Start a conversation"}
                          </span>
                          {conv.unread_count > 0 && conv.id !== selectedConversationId && (
                            <span className="ml-2 flex-shrink-0 w-5 h-5 rounded-full bg-[#25D366] flex items-center justify-center text-white text-[10px] font-bold">
                              {conv.unread_count}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* ── PEOPLE / CONTACTS ── */}
        {panel === "contacts" && (
          <>
            <div className="px-4 pt-4 pb-3">
              <h2 className="hidden md:block text-base font-bold text-gray-900 dark:text-white mb-3">People</h2>
              <div className="flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5 mb-3 transition-colors duration-200">
                <button onClick={() => setContactTab("find")}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${contactTab === "find" ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}>
                  Find People
                </button>
                <button onClick={() => setContactTab("my")}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${contactTab === "my" ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}>
                  My Contacts ({contacts.length})
                </button>
              </div>
              {contactTab === "find" && (
                <div className="relative">
                  <UserSearch className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-400" />
                  <input value={findQuery} onChange={e => setFindQuery(e.target.value)}
                   placeholder="Search by name or username…"
                    className="w-full pl-9 pr-8 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-[#128C7E] border-none transition-colors duration-200"
                    autoFocus />
                  {findQuery && (
                    <button onClick={() => setFindQuery("")} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
              {contactTab === "my" && (
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-400" />
                  <input value={findQuery} onChange={e => setFindQuery(e.target.value)}
                    placeholder="Search your contacts…"
                    className="w-full pl-9 pr-8 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-[#128C7E] border-none transition-colors duration-200" />
                  {findQuery && (
                    <button onClick={() => setFindQuery("")} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {contactTab === "find" && (
                findLoading ? <LoadingList /> :
                findResults.length === 0 ? (
                  <EmptyHint icon={<UserSearch className="w-8 h-8" />} text={findQuery ? "No users found" : "No other users registered yet"} />
                ) : findResults.map(u => (
                  <div key={u.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <button onClick={() => handleUserClick(u.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                      <Avatar src={u.profile_picture} name={u.name} size="md" online={onlineProp(u.last_seen)} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{u.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs text-gray-400 dark:text-gray-500">@{u.username}</span>
                        </div>
                      </div>
                    </button>
                    {isContact(u.id) ? (
                      <span className="flex items-center gap-1 text-xs text-[#128C7E] flex-shrink-0">
                        <Check className="w-3.5 h-3.5" /> Added
                      </span>
                    ) : (
                      <button onClick={() => handleAddContact(u.id)} disabled={addingId === u.id}
                        className="flex items-center gap-1 text-xs bg-[#128C7E] hover:bg-[#0f7066] text-white px-2.5 py-1.5 rounded-lg font-medium disabled:opacity-50 flex-shrink-0 transition-colors">
                        {addingId === u.id ? "…" : <><Plus className="w-3 h-3" />Add</>}
                      </button>
                    )}
                  </div>
                ))
              )}
              {contactTab === "my" && (
                contactsLoading ? <LoadingList /> :
                contacts.filter(c =>
                   !findQuery || c.name.toLowerCase().includes(findQuery.toLowerCase()) || c.username.toLowerCase().includes(findQuery.toLowerCase())
                ).length === 0 ? (
                  <EmptyHint icon={<Users className="w-8 h-8" />}
                    text={findQuery ? "No matching contacts" : "No contacts yet — use Find People to add someone"} />
                ) : contacts.filter(c =>
                   !findQuery || c.name.toLowerCase().includes(findQuery.toLowerCase()) || c.username.toLowerCase().includes(findQuery.toLowerCase())
                ).map(contact => (
                  <button key={contact.id} onClick={() => handleUserClick(contact.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left">
                    <Avatar src={contact.profile_picture} name={contact.name} size="md" online={onlineProp(contact.last_seen)} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white text-sm">{contact.name}</p>
                       <p className="text-xs text-gray-500 dark:text-gray-400">@{contact.username}</p>
                    </div>
                    {contact.last_seen && isOnline(contact.last_seen) && (
                      <span className="text-xs text-green-500 flex-shrink-0">online</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </>
        )}

        {/* ── SETTINGS ── */}
        {panel === "settings" && (
          <div className="flex-1 overflow-y-auto">
            {dbUser && (
              <div className="p-4">
                <div className="flex flex-col items-center gap-3 py-5 border-b border-gray-100 dark:border-gray-800 mb-4">
                  <Avatar src={dbUser.profile_picture} name={dbUser.name} size="xl" online />
                  <div className="text-center">
                    <p className="font-bold text-gray-900 dark:text-white">{dbUser.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">@{dbUser.username}</p>
                    {dbUser.is_verified && (
                      <span className="inline-flex items-center gap-1 mt-1 text-xs text-[#128C7E]">
                        <Check className="w-3 h-3" /> Verified
                      </span>
                    )}
                  </div>
                </div>
                 <div className="space-y-3 mb-6">
                   <SettingRow label="Email" value={dbUser.email} />
                   <SettingRow label="Phone" value={dbUser.phone} />
                   <div>
                     <label className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">Username</label>
                     <input
                       value={profileUsername}
                       onChange={e => setProfileUsername(e.target.value)}
                       placeholder="your_username"
                       className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#128C7E]"
                     />
                   </div>
                   <div>
                     <label className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">Status</label>
                     <textarea
                       value={profileStatus}
                       onChange={e => setProfileStatus(e.target.value)}
                       maxLength={140}
                       rows={2}
                       placeholder="Hey there! I am using WhatsChat."
                       className="mt-1 w-full resize-none px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#128C7E]"
                     />
                   </div>
                   <button
                     onClick={handleSaveProfile}
                     disabled={profileSaving || !profileUsername.trim()}
                     className="w-full py-2.5 rounded-xl bg-[#128C7E] hover:bg-[#0f7066] text-white text-sm font-medium disabled:opacity-50 transition-colors"
                   >
                     {profileSaving ? "Saving…" : "Save profile"}
                   </button>
                   <SettingRow label="Contacts" value={`${dbUser.friends?.length ?? 0} people`} />
                 </div>
                {!showDeleteConfirm ? (
                  <button onClick={() => setShowDeleteConfirm(true)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 border border-red-200 dark:border-red-900 text-red-500 dark:text-red-400 rounded-xl text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                    <Trash2 className="w-4 h-4" />
                    Delete My Account
                  </button>
                ) : (
                  <div className="border border-red-200 dark:border-red-900 rounded-xl p-4 bg-red-50 dark:bg-red-950/20">
                    <div className="flex items-start gap-2 mb-3">
                      <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-red-700 dark:text-red-400">Delete account?</p>
                        <p className="text-xs text-red-600 dark:text-red-500 mt-0.5">This removes your profile and all your data permanently. This cannot be undone.</p>
                      </div>
                    </div>
                    {deleteError && <p className="text-xs text-red-500 mb-2">{deleteError}</p>}
                    <div className="flex gap-2">
                      <button onClick={() => { setShowDeleteConfirm(false); setDeleteError(""); }}
                        className="flex-1 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        Cancel
                      </button>
                      <button onClick={handleDeleteAccount} disabled={deleteLoading}
                        className="flex-1 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium disabled:opacity-60 transition-colors">
                        {deleteLoading ? "Deleting…" : "Yes, delete"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function MobileTabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`flex-1 py-2.5 text-[11px] font-bold tracking-widest transition-colors ${
        active ? "text-white border-b-2 border-white" : "text-white/50 hover:text-white/80"
      }`}>
      {label}
    </button>
  );
}

interface UserRowProps {
  u: DBUser;
  isContact: boolean;
  isFriend: boolean;
  online: boolean | undefined;
  onChat: () => void;
  onAdd: () => void;
  adding: boolean;
}

function UserRow({ u, isFriend, online, onChat, onAdd, adding }: UserRowProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
      <button onClick={onChat} className="flex items-center gap-3 flex-1 min-w-0 text-left">
        <Avatar src={u.profile_picture} name={u.name} size="md" online={online} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{u.name}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
            {u.username ? `@${u.username}` : ""}
          </p>
        </div>
      </button>
      {isFriend ? (
        <span className="flex items-center gap-1 text-xs text-[#128C7E] flex-shrink-0">
          <Check className="w-3.5 h-3.5" /> Contact
        </span>
      ) : (
        <button onClick={onAdd} disabled={adding}
          className="flex items-center gap-1 text-xs bg-[#128C7E] hover:bg-[#0f7066] text-white px-2.5 py-1.5 rounded-lg font-medium disabled:opacity-50 flex-shrink-0 transition-colors">
          {adding ? "…" : <><Plus className="w-3 h-3" />Add</>}
        </button>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-1.5 bg-gray-50 dark:bg-gray-800/50 border-y border-gray-100 dark:border-gray-800">
      <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">{children}</span>
    </div>
  );
}

function NavBtn({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title: string }) {
  return (
    <button onClick={onClick} title={title}
      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${active ? "bg-white/20 text-white" : "text-white/60 hover:bg-white/10 hover:text-white"}`}>
      {children}
    </button>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label}</span>
      <span className="text-sm text-gray-800 dark:text-gray-200 font-medium">{value}</span>
    </div>
  );
}

function EmptyHint({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 p-8 text-center">
      <div className="text-gray-300 dark:text-gray-600">{icon}</div>
      <p className="text-sm text-gray-400 dark:text-gray-500">{text}</p>
    </div>
  );
}

function LoadingList() {
  return (
    <div className="space-y-1 p-2">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-2.5 animate-pulse">
          <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
            <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
