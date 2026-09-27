import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { type Document } from "mongodb";
import { asDate, cleanDocument, getMongoDb, getStorageMode, publicUser } from "../lib/mongo";

const router: IRouter = Router();

const now = () => new Date();
const iso = (value: unknown) => asDate(value).toISOString();
const phoneNumberPattern = /(?:\+?\d[\d\s().-]{5,}\d)/g;

function containsPhoneNumber(content: string) {
  return [...content.matchAll(phoneNumberPattern)]
    .some(match => match[0].replace(/\D/g, "").length >= 7);
}

function userShape(input: Record<string, unknown>, id: string) {
  const timestamp = iso(input.created_at ?? now());
  return {
    id,
    name: String(input.name ?? ""),
    username: String(input.username ?? ""),
    email: String(input.email ?? "").toLowerCase(),
    phone: String(input.phone ?? ""),
    profile_picture: (input.profile_picture as string | null) ?? null,
    cover_photo: (input.cover_photo as string | null) ?? null,
    is_admin: Boolean(input.is_admin ?? false),
    status: (input.status as string | null) ?? null,
    last_seen: iso(input.last_seen ?? now()),
    friends: Array.isArray(input.friends) ? input.friends.map(String) : [],
    friend_requests: Array.isArray(input.friend_requests) ? input.friend_requests.map(String) : [],
    sent_requests: Array.isArray(input.sent_requests) ? input.sent_requests.map(String) : [],
    created_at: timestamp,
    updated_at: iso(input.updated_at ?? timestamp),
    is_verified: Boolean(input.is_verified ?? false),
  };
}

router.get("/storage-health", async (_req, res) => {
  const mode = await getStorageMode();
  res.json({ mode, available: Boolean(await getMongoDb()) });
});

router.get("/users/:id", async (req, res) => {
  const db = await getMongoDb();
  if (!db) return res.status(503).json({ error: "MongoDB unavailable" });
  const user = await db.collection("users").findOne({ id: req.params.id });
  return res.json(publicUser(user));
});

router.get("/users", async (req, res) => {
  const db = await getMongoDb();
  if (!db) return res.status(503).json({ error: "MongoDB unavailable" });

  const ids = typeof req.query.ids === "string" ? req.query.ids.split(",").filter(Boolean) : [];
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const exclude = typeof req.query.exclude === "string" ? req.query.exclude.split(",").filter(Boolean) : [];
  const filter: Document = {};
  if (ids.length) filter.id = { $in: ids };
  if (exclude.length) filter.id = { ...(filter.id ?? {}), $nin: exclude };
  if (query.length >= 2) {
    filter.$or = [
      { name: { $regex: query, $options: "i" } },
      { username: { $regex: query, $options: "i" } },
    ];
  }
  const users = await db.collection("users").find(filter).sort({ name: 1 }).limit(60).toArray();
  return res.json(users.map(publicUser));
});

router.post("/users", async (req, res) => {
  const db = await getMongoDb();
  if (!db) return res.status(503).json({ error: "MongoDB unavailable" });
  const input = req.body as Record<string, unknown>;
  const id = String(input.id ?? randomUUID());
  const duplicate = await db.collection("users").findOne({
    $or: [
      { id },
      { email: String(input.email ?? "").toLowerCase() },
      { username: String(input.username ?? "").toLowerCase() },
      { phone: String(input.phone ?? "") },
    ],
  });
  if (duplicate && duplicate.id !== id) {
    return res.status(409).json({ error: "Email, phone, or username already taken." });
  }
  const user = userShape(input, id);
  await db.collection("users").replaceOne({ id }, user, { upsert: true });
  return res.status(201).json(publicUser(user));
});

router.patch("/users/:id", async (req, res) => {
  const db = await getMongoDb();
  if (!db) return res.status(503).json({ error: "MongoDB unavailable" });
  const input = req.body as Record<string, unknown>;
  const update: Record<string, unknown> = {};
  for (const field of ["name", "username", "status", "profile_picture", "cover_photo", "friends", "friend_requests", "sent_requests", "last_seen"]) {
    if (field in input) update[field] = input[field];
  }
  if ("username" in update) {
    const username = String(update.username ?? "").trim().toLowerCase();
    if (!/^[a-z0-9_]{3,}$/.test(username)) {
      return res.status(400).json({ error: "Username must be at least 3 characters and use lowercase letters, numbers, or underscores." });
    }
    const duplicate = await db.collection("users").findOne({ username, id: { $ne: req.params.id } });
    if (duplicate) return res.status(409).json({ error: "That username is already taken." });
    update.username = username;
  }
  if ("status" in update && String(update.status ?? "").length > 140) {
    return res.status(400).json({ error: "Status must be 140 characters or fewer." });
  }
  update.updated_at = now();
  await db.collection("users").updateOne({ id: req.params.id }, { $set: update }, { upsert: false });
  return res.json(publicUser(await db.collection("users").findOne({ id: req.params.id })));
});

router.delete("/users/:id", async (req, res) => {
  const db = await getMongoDb();
  if (!db) return res.status(503).json({ error: "MongoDB unavailable" });
  await db.collection("users").deleteOne({ id: req.params.id });
  const conversations = await db.collection("conversations").find({ participants: req.params.id }).toArray();
  for (const conversation of conversations) {
    const participants = (conversation.participants as string[]).filter((id) => id !== req.params.id);
    if (participants.length === 0) await db.collection("conversations").deleteOne({ id: conversation.id });
    else await db.collection("conversations").updateOne({ id: conversation.id }, { $set: { participants, updated_at: now() } });
  }
  await db.collection("messages").deleteMany({ sender_id: req.params.id });
  return res.status(204).send();
});

router.get("/conversations", async (req, res) => {
  const db = await getMongoDb();
  if (!db) return res.status(503).json({ error: "MongoDB unavailable" });
  const userId = String(req.query.userId ?? "");
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000);
  const cutoffIso = cutoff.toISOString();
  const conversations = await db.collection("conversations").find({
    participants: userId,
    $or: [
      { updated_at: { $gt: cutoff } },
      { updated_at: { $gt: cutoffIso } },
      { last_message_at: { $gt: cutoff } },
      { last_message_at: { $gt: cutoffIso } },
    ],
  }).sort({ last_message_at: -1, updated_at: -1 }).toArray();
  return res.json(conversations.map(cleanDocument));
});

router.post("/conversations", async (req, res) => {
  const db = await getMongoDb();
  if (!db) return res.status(503).json({ error: "MongoDB unavailable" });
  const input = req.body as Record<string, unknown>;
  const conversation = {
    id: String(input.id ?? randomUUID()),
    participants: Array.isArray(input.participants) ? input.participants.map(String) : [],
    last_message: (input.last_message as string | null) ?? null,
    last_message_at: iso(input.last_message_at ?? now()),
    unread_by: Array.isArray(input.unread_by) ? input.unread_by.map(String) : [],
    is_admin_chat: Boolean(input.is_admin_chat ?? false),
    is_group: Boolean(input.is_group ?? false),
    group_name: (input.group_name as string | null) ?? null,
    group_photo: (input.group_photo as string | null) ?? null,
    admin_id: (input.admin_id as string | null) ?? null,
    invite_token: (input.invite_token as string | null) ?? null,
    created_at: iso(input.created_at ?? now()),
    updated_at: iso(input.updated_at ?? now()),
    disappearing_messages: input.disappearing_messages ?? null,
  };
  await db.collection("conversations").insertOne(conversation);
  return res.status(201).json(conversation);
});

router.patch("/conversations/:id", async (req, res) => {
  const db = await getMongoDb();
  if (!db) return res.status(503).json({ error: "MongoDB unavailable" });
  const update: Record<string, unknown> = { ...(req.body as Record<string, unknown>), updated_at: now() };
  delete update.id;
  await db.collection("conversations").updateOne({ id: req.params.id }, { $set: update });
  return res.json(cleanDocument(await db.collection("conversations").findOne({ id: req.params.id })));
});

router.get("/messages", async (req, res) => {
  const db = await getMongoDb();
  if (!db) return res.status(503).json({ error: "MongoDB unavailable" });
  const conversationId = String(req.query.conversationId ?? "");
  const nowDate = new Date();
  const nowIso = nowDate.toISOString();
  const messages = await db.collection("messages").find({
    conversation_id: conversationId,
    $or: [
      { expires_at: { $gt: nowDate } },
      { expires_at: { $gt: nowIso } },
      { expires_at: { $exists: false } },
    ],
  }).sort({ created_at: 1 }).toArray();
  return res.json(messages.map(cleanDocument));
});

router.post("/messages", async (req, res) => {
  const db = await getMongoDb();
  if (!db) return res.status(503).json({ error: "MongoDB unavailable" });
  const input = req.body as Record<string, unknown>;
  const content = input.content == null ? "" : String(input.content);
  if (containsPhoneNumber(content)) {
    return res.status(400).json({ error: "Not Sent: this message data is not allowed in this app." });
  }
  const createdAt = asDate(input.created_at ?? now());
  const message = {
    id: String(input.id ?? randomUUID()),
    conversation_id: String(input.conversation_id ?? ""),
    sender_id: String(input.sender_id ?? ""),
    content: (input.content as string | null) ?? null,
    is_system: Boolean(input.is_system ?? false),
    reply_to: (input.reply_to as string | null) ?? null,
    read_by: Array.isArray(input.read_by) ? input.read_by.map(String) : [],
    created_at: createdAt.toISOString(),
    updated_at: iso(input.updated_at ?? createdAt),
    expires_at: new Date(createdAt.getTime() + 72 * 60 * 60 * 1000).toISOString(),
    audio_url: (input.audio_url as string | null) ?? null,
    is_edited: Boolean(input.is_edited ?? false),
    is_personal_chat: true,
  };
  await db.collection("messages").insertOne(message);
  return res.status(201).json(message);
});

router.patch("/messages/:id", async (req, res) => {
  const db = await getMongoDb();
  if (!db) return res.status(503).json({ error: "MongoDB unavailable" });
  const update: Record<string, unknown> = { ...(req.body as Record<string, unknown>), updated_at: now() };
  delete update.id;
  if (typeof update.content === "string" && containsPhoneNumber(update.content)) {
    return res.status(400).json({ error: "Not Sent: this message data is not allowed in this app." });
  }
  await db.collection("messages").updateOne({ id: req.params.id }, { $set: update });
  return res.json(cleanDocument(await db.collection("messages").findOne({ id: req.params.id })));
});

export default router;