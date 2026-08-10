import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { DBUser } from "@/lib/database.types";
import { createConversation, getConversations, getUsers, updateUser } from "@/lib/storage";

export function useContacts() {
  const { user, dbUser, refreshUser } = useAuth();
  const [contacts, setContacts] = useState<DBUser[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchContacts = async () => {
    if (!dbUser) { setLoading(false); return; }
    if (!dbUser.friends?.length) { setContacts([]); setLoading(false); return; }

    const data = await getUsers({ ids: dbUser.friends });
    setContacts(data ?? []);
    setLoading(false);
  };

  // Search platform users — excludes self and already-added friends
  const searchUsers = async (query: string): Promise<DBUser[]> => {
    const q = query.trim();
    const excludeIds = [user?.id ?? "", ...(dbUser?.friends ?? [])];

    return getUsers({ query: q, exclude: excludeIds });
  };

  const addContact = async (userId: string): Promise<{ error?: string; user?: DBUser }> => {
    if (!user || !dbUser) return { error: "Not authenticated" };
    if (userId === user.id) return { error: "Cannot add yourself" };
    if (dbUser.friends?.includes(userId)) return { error: "Already in contacts" };

    const found = (await getUsers({ ids: [userId] }))[0] ?? null;
    if (!found) return { error: "User not found" };

    const newFriends = [...(dbUser.friends ?? []), userId];
    try {
      await updateUser(user.id, { friends: newFriends });
    } catch {
      return { error: "Failed to add contact" };
    }

    await refreshUser();
    await fetchContacts();
    return { user: found };
  };

  const startConversation = async (contactId: string): Promise<string | null> => {
    if (!user) return null;

    const existing = await getConversations(user.id);

    if (existing) {
      const dm = existing.find(c =>
        c.participants.length === 2 && c.participants.includes(contactId)
      );
      if (dm) return dm.id;
    }

    const now = new Date().toISOString();
    const conv = await createConversation({ participants: [user.id, contactId], is_group: false, last_message_at: now, updated_at: now });
    return conv.id;
  };

  useEffect(() => {
    fetchContacts();
  }, [dbUser]);

  return { contacts, loading, addContact, searchUsers, startConversation, refetch: fetchContacts };
}
