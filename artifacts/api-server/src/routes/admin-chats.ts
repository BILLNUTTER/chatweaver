import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import type { Document } from "mongodb";
import {
  GetAdminChatsResponse,
  GetAdminChatMessagesParams,
  GetAdminChatMessagesResponse,
  GetMyAdminChatsResponse,
  GetMyAdminChatMessagesParams,
  GetMyAdminChatMessagesResponse,
  MarkAdminChatReadParams,
  MarkAdminChatReadResponse,
  MarkMyAdminChatReadParams,
  MarkMyAdminChatReadResponse,
  SendAdminChatBody,
  SendAdminChatMessageParams,
  SendAdminChatMessageBody,
  SendMyAdminChatMessageParams,
  SendMyAdminChatMessageBody,
} from "@workspace/api-zod";
import { asDate, getMongoDb } from "../lib/mongo";
import { readSessionUserId } from "../lib/session";
import { verifyAdminToken } from "./admin";

const router: IRouter = Router();

function messageShape(message: Document) {
  return {
    id: String(message.id),
    thread_id: String(message.thread_id),
    sender_type: message.sender_type === "user" ? "user" as const : "admin" as const,
    content: String(message.content ?? ""),
    created_at: asDate(message.created_at).toISOString(),
  };
}

function adminThreadShape(thread: Document, recipient: Document | null) {
  return {
    id: String(thread.id),
    campaign_id: String(thread.campaign_id),
    recipient_id: String(thread.recipient_id),
    recipient_name: String(recipient?.name ?? "Unknown user"),
    recipient_username: String(recipient?.username ?? ""),
    recipient_profile_picture: (recipient?.profile_picture as string | null) ?? null,
    title: String(thread.title ?? ""),
    allow_replies: Boolean(thread.allow_replies),
    last_message: String(thread.last_message ?? ""),
    last_sender: thread.last_sender === "user" ? "user" as const : "admin" as const,
    last_message_at: asDate(thread.last_message_at ?? thread.created_at).toISOString(),
    unread_for_admin: Number(thread.unread_for_admin ?? 0),
    user_reply_count: Number(thread.user_reply_count ?? 0),
    created_at: asDate(thread.created_at).toISOString(),
  };
}

function userThreadShape(thread: Document) {
  return {
    id: String(thread.id),
    title: String(thread.title ?? ""),
    allow_replies: Boolean(thread.allow_replies),
    last_message: String(thread.last_message ?? ""),
    last_sender: thread.last_sender === "user" ? "user" as const : "admin" as const,
    last_message_at: asDate(thread.last_message_at ?? thread.created_at).toISOString(),
    unread_count: Number(thread.unread_for_user ?? 0),
    created_at: asDate(thread.created_at).toISOString(),
  };
}

function trimmedBody(value: unknown): string {
  return String(value ?? "").trim();
}

router.get("/admin/chats", async (req, res): Promise<void> => {
  if (!verifyAdminToken(req)) {
    res.status(401).json({ error: "Admin sign-in required." });
    return;
  }
  const db = await getMongoDb();
  if (!db) {
    res.status(503).json({ error: "MongoDB unavailable" });
    return;
  }

  const threads = await db.collection("admin_chat_threads")
    .find({})
    .sort({ last_message_at: -1 })
    .limit(500)
    .toArray();
  const recipientIds = [...new Set(threads.map(thread => String(thread.recipient_id)))];
  const recipients = recipientIds.length
    ? await db.collection("users").find({ id: { $in: recipientIds } })
      .project({ id: 1, name: 1, username: 1, profile_picture: 1 })
      .toArray()
    : [];
  const recipientsById = new Map(recipients.map(recipient => [String(recipient.id), recipient]));
  res.json(GetAdminChatsResponse.parse(
    threads.map(thread => adminThreadShape(thread, recipientsById.get(String(thread.recipient_id)) ?? null)),
  ));
});

router.post("/admin/chats", async (req, res): Promise<void> => {
  if (!verifyAdminToken(req)) {
    res.status(401).json({ error: "Admin sign-in required." });
    return;
  }
  const parsed = SendAdminChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const title = trimmedBody(parsed.data.title);
  const content = trimmedBody(parsed.data.content);
  if (!title || !content) {
    res.status(400).json({ error: "A title and message are required." });
    return;
  }
  if (parsed.data.audience === "user" && !parsed.data.recipient_id) {
    res.status(400).json({ error: "Choose a recipient." });
    return;
  }

  const db = await getMongoDb();
  if (!db) {
    res.status(503).json({ error: "MongoDB unavailable" });
    return;
  }
  const recipients = parsed.data.audience === "all"
    ? await db.collection("users").find({}, { projection: { id: 1 } }).toArray()
    : [await db.collection("users").findOne(
        { id: parsed.data.recipient_id },
        { projection: { id: 1 } },
      )].filter(Boolean);
  if (parsed.data.audience === "user" && recipients.length === 0) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  const campaignId = randomUUID();
  const timestamp = new Date();
  const threads = recipients.map(recipient => ({
    id: randomUUID(),
    campaign_id: campaignId,
    recipient_id: String(recipient!.id),
    title,
    allow_replies: parsed.data.allow_replies,
    last_message: content,
    last_sender: "admin",
    last_message_at: timestamp,
    unread_for_user: 1,
    unread_for_admin: 0,
    user_reply_count: 0,
    created_at: timestamp,
  }));

  if (threads.length) {
    await db.collection("admin_chat_threads").insertMany(threads);
    await db.collection("admin_chat_messages").insertMany(threads.map(thread => ({
      id: randomUUID(),
      thread_id: thread.id,
      sender_type: "admin",
      content,
      created_at: timestamp,
    })));
  }
  res.status(201).json({ campaign_id: campaignId, sent: threads.length });
});

router.get("/admin/chats/:id/messages", async (req, res): Promise<void> => {
  if (!verifyAdminToken(req)) {
    res.status(401).json({ error: "Admin sign-in required." });
    return;
  }
  const params = GetAdminChatMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid thread." });
    return;
  }
  const db = await getMongoDb();
  if (!db) {
    res.status(503).json({ error: "MongoDB unavailable" });
    return;
  }
  const thread = await db.collection("admin_chat_threads").findOne({ id: params.data.id });
  if (!thread) {
    res.status(404).json({ error: "Admin chat not found." });
    return;
  }
  const messages = await db.collection("admin_chat_messages")
    .find({ thread_id: params.data.id })
    .sort({ created_at: 1 })
    .toArray();
  res.json(GetAdminChatMessagesResponse.parse(messages.map(messageShape)));
});

router.post("/admin/chats/:id/messages", async (req, res): Promise<void> => {
  if (!verifyAdminToken(req)) {
    res.status(401).json({ error: "Admin sign-in required." });
    return;
  }
  const params = SendAdminChatMessageParams.safeParse(req.params);
  const body = SendAdminChatMessageBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Enter a message of up to 2,000 characters." });
    return;
  }
  const content = trimmedBody(body.data.content);
  if (!content) {
    res.status(400).json({ error: "Enter a message." });
    return;
  }
  const db = await getMongoDb();
  if (!db) {
    res.status(503).json({ error: "MongoDB unavailable" });
    return;
  }
  const thread = await db.collection("admin_chat_threads").findOne({ id: params.data.id });
  if (!thread) {
    res.status(404).json({ error: "Admin chat not found." });
    return;
  }
  const timestamp = new Date();
  const message = {
    id: randomUUID(),
    thread_id: params.data.id,
    sender_type: "admin",
    content,
    created_at: timestamp,
  };
  await db.collection("admin_chat_messages").insertOne(message);
  await db.collection("admin_chat_threads").updateOne(
    { id: params.data.id },
    {
      $set: { last_message: content, last_sender: "admin", last_message_at: timestamp },
      $inc: { unread_for_user: 1 },
    },
  );
  res.status(201).json(messageShape(message));
});

router.patch("/admin/chats/:id/read", async (req, res): Promise<void> => {
  if (!verifyAdminToken(req)) {
    res.status(401).json({ error: "Admin sign-in required." });
    return;
  }
  const params = MarkAdminChatReadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid thread." });
    return;
  }
  const db = await getMongoDb();
  if (!db) {
    res.status(503).json({ error: "MongoDB unavailable" });
    return;
  }
  const result = await db.collection("admin_chat_threads").updateOne(
    { id: params.data.id },
    { $set: { unread_for_admin: 0 } },
  );
  if (!result.matchedCount) {
    res.status(404).json({ error: "Admin chat not found." });
    return;
  }
  res.json(MarkAdminChatReadResponse.parse({ ok: true }));
});

router.get("/admin-chats", async (req, res): Promise<void> => {
  const userId = readSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign-in required." });
    return;
  }
  const db = await getMongoDb();
  if (!db) {
    res.status(503).json({ error: "MongoDB unavailable" });
    return;
  }
  const threads = await db.collection("admin_chat_threads")
    .find({ recipient_id: userId })
    .sort({ last_message_at: -1 })
    .limit(100)
    .toArray();
  res.json(GetMyAdminChatsResponse.parse(threads.map(userThreadShape)));
});

router.get("/admin-chats/:id/messages", async (req, res): Promise<void> => {
  const userId = readSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign-in required." });
    return;
  }
  const params = GetMyAdminChatMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid thread." });
    return;
  }
  const db = await getMongoDb();
  if (!db) {
    res.status(503).json({ error: "MongoDB unavailable" });
    return;
  }
  const thread = await db.collection("admin_chat_threads").findOne({
    id: params.data.id,
    recipient_id: userId,
  });
  if (!thread) {
    res.status(404).json({ error: "Admin chat not found." });
    return;
  }
  const messages = await db.collection("admin_chat_messages")
    .find({ thread_id: params.data.id })
    .sort({ created_at: 1 })
    .toArray();
  res.json(GetMyAdminChatMessagesResponse.parse(messages.map(messageShape)));
});

router.post("/admin-chats/:id/messages", async (req, res): Promise<void> => {
  const userId = readSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign-in required." });
    return;
  }
  const params = SendMyAdminChatMessageParams.safeParse(req.params);
  const body = SendMyAdminChatMessageBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Enter a message of up to 2,000 characters." });
    return;
  }
  const content = trimmedBody(body.data.content);
  if (!content) {
    res.status(400).json({ error: "Enter a message." });
    return;
  }
  const db = await getMongoDb();
  if (!db) {
    res.status(503).json({ error: "MongoDB unavailable" });
    return;
  }
  const thread = await db.collection("admin_chat_threads").findOne({
    id: params.data.id,
    recipient_id: userId,
  });
  if (!thread) {
    res.status(404).json({ error: "Admin chat not found." });
    return;
  }
  if (!thread.allow_replies) {
    res.status(403).json({ error: "Replies are turned off for this admin chat." });
    return;
  }
  const timestamp = new Date();
  const message = {
    id: randomUUID(),
    thread_id: params.data.id,
    sender_type: "user",
    content,
    created_at: timestamp,
  };
  await db.collection("admin_chat_messages").insertOne(message);
  await db.collection("admin_chat_threads").updateOne(
    { id: params.data.id, recipient_id: userId },
    {
      $set: { last_message: content, last_sender: "user", last_message_at: timestamp },
      $inc: { unread_for_admin: 1, user_reply_count: 1 },
    },
  );
  res.status(201).json(messageShape(message));
});

router.patch("/admin-chats/:id/read", async (req, res): Promise<void> => {
  const userId = readSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign-in required." });
    return;
  }
  const params = MarkMyAdminChatReadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid thread." });
    return;
  }
  const db = await getMongoDb();
  if (!db) {
    res.status(503).json({ error: "MongoDB unavailable" });
    return;
  }
  const result = await db.collection("admin_chat_threads").updateOne(
    { id: params.data.id, recipient_id: userId },
    { $set: { unread_for_user: 0 } },
  );
  if (!result.matchedCount) {
    res.status(404).json({ error: "Admin chat not found." });
    return;
  }
  res.json(MarkMyAdminChatReadResponse.parse({ ok: true }));
});

export default router;
