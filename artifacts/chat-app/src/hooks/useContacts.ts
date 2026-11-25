import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { DBUser } from "@/lib/database.types";
import {
  getGetIncomingFriendRequestsQueryKey,
  useAcceptFriendRequest,
  useDeclineOrCancelFriendRequest,
  useGetIncomingFriendRequests,
  useSendFriendRequest,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { createConversation, getConversations, getUsers } from "@/lib/storage";

export function useContacts() {
  const { user, dbUser, refreshUser } = useAuth();
  const [contacts, setContacts] = useState<DBUser[]>([]);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();
  const incomingRequestsQuery = useGetIncomingFriendRequests({
    query: {
      queryKey: getGetIncomingFriendRequestsQueryKey(),
      enabled: Boolean(user),
      staleTime: 10_000,
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    },
  });
  const sendRequest = useSendFriendRequest();
  const acceptRequest = useAcceptFriendRequest();
  const removeRequest = useDeclineOrCancelFriendRequest();

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

  const addContact = async (userId: string): Promise<{ error?: string; status?: string }> => {
    if (!user || !dbUser) return { error: "Not authenticated" };
    if (userId === user.id) return { error: "Cannot add yourself" };
    if (dbUser.friends?.includes(userId)) return { status: "contact" };
    try {
      const result = await sendRequest.mutateAsync({ userId });
      await refreshUser();
      void queryClient.invalidateQueries({ queryKey: getGetIncomingFriendRequestsQueryKey() });
      await fetchContacts();
      return { status: result.status };
    } catch {
      return { error: "Failed to add contact" };
    }
  };

  const acceptContact = async (userId: string): Promise<{ error?: string }> => {
    try {
      await acceptRequest.mutateAsync({ userId });
      await refreshUser();
      void queryClient.invalidateQueries({ queryKey: getGetIncomingFriendRequestsQueryKey() });
      await fetchContacts();
      return {};
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Could not accept request" };
    }
  };

  const removeFriendRequest = async (userId: string): Promise<{ error?: string }> => {
    try {
      await removeRequest.mutateAsync({ userId });
      await refreshUser();
      void queryClient.invalidateQueries({ queryKey: getGetIncomingFriendRequestsQueryKey() });
      return {};
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Could not remove request" };
    }
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

  return {
    contacts,
    loading,
    incomingRequests: incomingRequestsQuery.data ?? [],
    requestsLoading: incomingRequestsQuery.isLoading,
    addContact,
    acceptContact,
    removeFriendRequest,
    searchUsers,
    startConversation,
    refetch: fetchContacts,
  };
}
