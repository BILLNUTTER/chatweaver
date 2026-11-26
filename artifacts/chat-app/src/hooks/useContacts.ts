import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { DBUser } from "@/lib/database.types";
import {
  getMyContacts,
  getGetIncomingFriendRequestsQueryKey,
  useAcceptFriendRequest,
  useDeclineOrCancelFriendRequest,
  useGetIncomingFriendRequests,
  useSendFriendRequest,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { createConversation, getConversations, getUsers } from "@/lib/storage";
import type { PublicProfile } from "@workspace/api-client-react";

export function useContacts() {
  const { user, dbUser, refreshUser } = useAuth();
  const [contacts, setContacts] = useState<PublicProfile[]>([]);
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

  const fetchContacts = useCallback(async () => {
    if (!user || !dbUser) {
      setContacts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setContacts(await getMyContacts());
    } catch (error) {
      console.warn("Could not refresh mutual contacts", error);
    } finally {
      setLoading(false);
    }
  }, [user?.id, dbUser?.id]);

  const searchUsers = useCallback(async (
    query: string,
    options: { includeContacts?: boolean } = {},
  ): Promise<DBUser[]> => {
    const q = query.trim().replace(/^@/, "");
    const excludeIds = [
      user?.id ?? "",
      ...(options.includeContacts ? [] : contacts.map(contact => contact.id)),
    ];
    return getUsers({ query: q, exclude: excludeIds });
  }, [user?.id, contacts]);

  const addContact = async (userId: string): Promise<{ error?: string; status?: string }> => {
    if (!user || !dbUser) return { error: "Not authenticated" };
    if (userId === user.id) return { error: "Cannot add yourself" };
    if (contacts.some(contact => contact.id === userId)) return { status: "contact" };
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

  const startConversation = useCallback(async (contactId: string): Promise<string | null> => {
    if (!user || !contacts.some(contact => contact.id === contactId)) return null;

    const existing = await getConversations(user.id);

    if (existing) {
      const dm = existing.find(c =>
        c.participants.length === 2 &&
        c.participants.includes(user.id) &&
        c.participants.includes(contactId)
      );
      if (dm) return dm.id;
    }

    const now = new Date().toISOString();
    const conv = await createConversation({ participants: [user.id, contactId], is_group: false, last_message_at: now, updated_at: now });
    return conv.id;
  }, [user, contacts]);

  useEffect(() => {
    void fetchContacts();
  }, [fetchContacts]);

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
