import type { DBConversation, DBMessage, DBUser } from "./database.types";

export type StorageMode = "mongodb";

let modeCache: { expiresAt: number } | null = null;
const MONGO_TOKEN_KEY = "chatweaver_mongo_token";

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
    throw new Error(body.error ?? `MongoDB request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function getStorageMode(force = false): Promise<StorageMode> {
  if (!force && modeCache && modeCache.expiresAt > Date.now()) return "mongodb";
  await api<{ mode: "mongodb"; available: boolean }>("/storage-health");
  modeCache = { expiresAt: Date.now() + 10_000 };
  return "mongodb";
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

export function getUser(id: string): Promise<DBUser | null> {
  return api<DBUser | null>(`/users/${encodeURIComponent(id)}`);
}

export function getUsers(options: { ids?: string[]; query?: string; exclude?: string[] } = {}): Promise<DBUser[]> {
  const params = new URLSearchParams();
  if (options.ids?.length) params.set("ids", options.ids.join(","));
  if (options.query) params.set("q", options.query);
  if (options.exclude?.length) params.set("exclude", options.exclude.join(","));
  return api<DBUser[]>(`/users?${params.toString()}`);
}

export function createUser(user: Partial<DBUser> & Pick<DBUser, "id" | "name" | "username" | "email" | "phone">): Promise<DBUser> {
  return api<DBUser>("/users", { method: "POST", body: JSON.stringify(user) });
}

export function updateUser(id: string, update: Partial<DBUser>): Promise<DBUser | null> {
  return api<DBUser | null>(`/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(update),
  });
}

export function deleteUser(id: string): Promise<void> {
  return api<void>(`/users/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function getConversations(userId: string): Promise<DBConversation[]> {
  return api<DBConversation[]>(`/conversations?userId=${encodeURIComponent(userId)}`);
}

export function createConversation(input: Partial<DBConversation> & Pick<DBConversation, "participants">): Promise<DBConversation> {
  return api<DBConversation>("/conversations", { method: "POST", body: JSON.stringify(input) });
}

export function updateConversation(id: string, update: Partial<DBConversation>): Promise<DBConversation | null> {
  return api<DBConversation | null>(`/conversations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(update),
  });
}

export function getMessages(conversationId: string): Promise<DBMessage[]> {
  return api<DBMessage[]>(`/messages?conversationId=${encodeURIComponent(conversationId)}`);
}

export function createMessage(input: Partial<DBMessage> & Pick<DBMessage, "conversation_id" | "sender_id">): Promise<DBMessage> {
  return api<DBMessage>("/messages", { method: "POST", body: JSON.stringify(input) });
}

export function updateMessage(id: string, update: Partial<DBMessage>): Promise<DBMessage | null> {
  return api<DBMessage | null>(`/messages/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(update),
  });
}