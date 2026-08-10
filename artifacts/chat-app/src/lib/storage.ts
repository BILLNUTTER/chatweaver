import { supabase } from "./supabase";
import type { DBConversation, DBMessage, DBUser } from "./database.types";

export type StorageMode = "mongodb" | "supabase";

let modeCache: { mode: StorageMode; expiresAt: number } | null = null;
const MONGO_TOKEN_KEY = "chatweaver_mongo_token";
const legacySupabase = supabase as any;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 1800);
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } finally {
    window.clearTimeout(timeout);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Storage request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function getStorageMode(force = false): Promise<StorageMode> {
  if (!force && modeCache && modeCache.expiresAt > Date.now()) return modeCache.mode;
  try {
    const result = await api<{ mode: StorageMode }>("/storage-health");
    modeCache = { mode: result.mode, expiresAt: Date.now() + 10_000 };
    return result.mode;
  } catch {
    modeCache = { mode: "supabase", expiresAt: Date.now() + 2_000 };
    return "supabase";
  }
}

export type AuthResult = { token: string; user: DBUser };

export function getMongoToken() {
  return window.localStorage.getItem(MONGO_TOKEN_KEY);
}

export function setMongoToken(token: string) {
  window.localStorage.setItem(MONGO_TOKEN_KEY, token);
}

export function clearMongoToken() {
  window.localStorage.removeItem(MONGO_TOKEN_KEY);
}

export function mongoLogin(email: string, password: string): Promise<AuthResult> {
  return api<AuthResult>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function mongoRegister(input: {
  name: string;
  username: string;
  email: string;
  phone: string;
  password: string;
}): Promise<AuthResult> {
  return api<AuthResult>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function mongoMe(token: string): Promise<DBUser> {
  return api<DBUser>("/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function useMongo<T>(request: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  if (await getStorageMode() === "mongodb") {
    try {
      return await request();
    } catch {
      modeCache = null;
    }
  }
  return fallback();
}

const supabaseUser = async (id: string) => {
  const { data, error } = await legacySupabase.from("users").select("*").eq("id", id).single();
  if (error && error.code !== "PGRST116") throw new Error(error.message);
  return data ?? null;
};

export function getUser(id: string): Promise<DBUser | null> {
  return useMongo(
    () => api<DBUser | null>(`/users/${encodeURIComponent(id)}`),
    () => supabaseUser(id),
  );
}

export function getUsers(options: { ids?: string[]; query?: string; exclude?: string[] } = {}): Promise<DBUser[]> {
  const params = new URLSearchParams();
  if (options.ids?.length) params.set("ids", options.ids.join(","));
  if (options.query) params.set("q", options.query);
  if (options.exclude?.length) params.set("exclude", options.exclude.join(","));
  return useMongo(
    () => api<DBUser[]>(`/users?${params.toString()}`),
    async () => {
      let query = legacySupabase.from("users").select("*").limit(60);
      if (options.ids?.length) query = query.in("id", options.ids);
      if (options.exclude?.length) query = query.not("id", "in", `(${options.exclude.join(",")})`);
      if (options.query && options.query.length >= 2) {
        const q = options.query.replace(/[,()]/g, " ");
        query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%,username.ilike.%${q}%,email.ilike.%${q}%`);
      }
      const { data, error } = await query.order("name", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  );
}

export function createUser(user: Partial<DBUser> & Pick<DBUser, "id" | "name" | "username" | "email" | "phone">): Promise<DBUser> {
  return useMongo(
    () => api<DBUser>("/users", { method: "POST", body: JSON.stringify(user) }),
    async () => {
      const { data, error } = await legacySupabase.from("users").upsert(user).select().single();
      if (error) throw new Error(error.message);
      return data;
    },
  );
}

export function updateUser(id: string, update: Partial<DBUser>): Promise<DBUser | null> {
  return useMongo(
    () => api<DBUser | null>(`/users/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(update) }),
    async () => {
      const { data, error } = await legacySupabase.from("users").update(update).eq("id", id).select().single();
      if (error) throw new Error(error.message);
      return data;
    },
  );
}

export function deleteUser(id: string): Promise<void> {
  return useMongo(
    () => api<void>(`/users/${encodeURIComponent(id)}`, { method: "DELETE" }),
    async () => {
      const { error } = await legacySupabase.from("users").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
  );
}

export function getConversations(userId: string): Promise<DBConversation[]> {
  return useMongo(
    () => api<DBConversation[]>(`/conversations?userId=${encodeURIComponent(userId)}`),
    async () => {
      const { data, error } = await legacySupabase.from("conversations").select("*").contains("participants", [userId]).order("last_message_at", { ascending: false, nullsFirst: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  );
}

export function createConversation(input: Partial<DBConversation> & Pick<DBConversation, "participants">): Promise<DBConversation> {
  return useMongo(
    () => api<DBConversation>("/conversations", { method: "POST", body: JSON.stringify(input) }),
    async () => {
      const { data, error } = await legacySupabase.from("conversations").insert(input).select().single();
      if (error) throw new Error(error.message);
      return data;
    },
  );
}

export function updateConversation(id: string, update: Partial<DBConversation>): Promise<DBConversation | null> {
  return useMongo(
    () => api<DBConversation | null>(`/conversations/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(update) }),
    async () => {
      const { data, error } = await legacySupabase.from("conversations").update(update).eq("id", id).select().single();
      if (error) throw new Error(error.message);
      return data;
    },
  );
}

export function getMessages(conversationId: string): Promise<DBMessage[]> {
  return useMongo(
    () => api<DBMessage[]>(`/messages?conversationId=${encodeURIComponent(conversationId)}`),
    async () => {
      const { data, error } = await legacySupabase.from("messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  );
}

export function createMessage(input: Partial<DBMessage> & Pick<DBMessage, "conversation_id" | "sender_id">): Promise<DBMessage> {
  return useMongo(
    () => api<DBMessage>("/messages", { method: "POST", body: JSON.stringify(input) }),
    async () => {
      const { data, error } = await legacySupabase.from("messages").insert(input).select().single();
      if (error) throw new Error(error.message);
      return data;
    },
  );
}

export function updateMessage(id: string, update: Partial<DBMessage>): Promise<DBMessage | null> {
  return useMongo(
    () => api<DBMessage | null>(`/messages/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(update) }),
    async () => {
      const { data, error } = await legacySupabase.from("messages").update(update).eq("id", id).select().single();
      if (error) throw new Error(error.message);
      return data;
    },
  );
}