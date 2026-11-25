import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import type { Document } from "mongodb";
import {
  GetAdminNotificationRepliesResponse,
  GetMyNotificationsResponse,
  MarkNotificationReadParams,
  MarkNotificationReadResponse,
  ReplyToNotificationBody,
  ReplyToNotificationParams,
} from "@workspace/api-zod";
import { asDate, getMongoDb } from "../lib/mongo";
import { readSessionUserId } from "../lib/session";
import { verifyAdminToken } from "./admin";

const router: IRouter = Router();
const notificationReadLifetimeMs = 2 * 60 * 60 * 1000;

router.get("/notifications", async (req, res): Promise<void> => {
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
  const cutoff = new Date(Date.now() - notificationReadLifetimeMs);
  const cutoffIso = cutoff.toISOString();
  const notifications = await db.collection("notifications")
    .find({
      recipient_id: userId,
      $or: [
        { read: { $ne: true } },
        { read_at: { $gte: cutoff } },
        { read_at: { $gte: cutoffIso } },
        { read_at: { $exists: false }, updated_at: { $gte: cutoff } },
        { read_at: { $exists: false }, updated_at: { $gte: cutoffIso } },
      ],
    })
    .sort({ created_at: -1 })
    .limit(200)
    .toArray();
  const notificationIds = notifications.map(notification => String(notification.id));
  const replies = notificationIds.length
    ? await db.collection("notification_replies")
      .find({ recipient_id: userId, notification_id: { $in: notificationIds } })
      .sort({ created_at: 1 })
      .toArray()
    : [];
  const repliesByNotification = new Map<string, Document[]>();
  for (const reply of replies) {
    const key = String(reply.notification_id);
    const group = repliesByNotification.get(key) ?? [];
    group.push(reply);
    repliesByNotification.set(key, group);
  }
  res.json(GetMyNotificationsResponse.parse(notifications.map(notification => ({
    id: String(notification.id),
    recipient_id: String(notification.recipient_id),
    type: notification.type === "warning" ? "warning" : "update",
    title: String(notification.title ?? ""),
    content: String(notification.content ?? ""),
    read: Boolean(notification.read),
    allow_replies: Boolean(notification.allow_replies),
    replies: (repliesByNotification.get(String(notification.id)) ?? []).map(reply => ({
      id: String(reply.id),
      notification_id: String(reply.notification_id),
      content: String(reply.content ?? ""),
      created_at: asDate(reply.created_at).toISOString(),
    })),
    created_at: asDate(notification.created_at).toISOString(),
    updated_at: asDate(notification.updated_at ?? notification.created_at).toISOString(),
  }))));
});

router.patch("/notifications/:id/read", async (req, res): Promise<void> => {
  const userId = readSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign-in required." });
    return;
  }
  const params = MarkNotificationReadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid notification." });
    return;
  }
  const db = await getMongoDb();
  if (!db) {
    res.status(503).json({ error: "MongoDB unavailable" });
    return;
  }

  let result = await db.collection("notifications").findOne({
    id: params.data.id,
    recipient_id: userId,
  });
  if (!result) {
    res.status(404).json({ error: "Notification not found." });
    return;
  }
  if (result.read) {
    const firstReadAt = result.read_at ?? result.updated_at ?? result.created_at;
    if (Date.now() - asDate(firstReadAt).getTime() >= notificationReadLifetimeMs) {
      res.status(404).json({ error: "This notification has expired." });
      return;
    }
  } else {
    const updatedAt = new Date();
    result = await db.collection("notifications").findOneAndUpdate(
      { id: params.data.id, recipient_id: userId, read: { $ne: true } },
      { $set: { read: true, read_at: updatedAt, updated_at: updatedAt } },
      { returnDocument: "after" },
    );
    if (!result) {
      res.status(404).json({ error: "Notification not found." });
      return;
    }
  }
  const replies = await db.collection("notification_replies")
    .find({ recipient_id: userId, notification_id: params.data.id })
    .sort({ created_at: 1 })
    .toArray();
  res.json(MarkNotificationReadResponse.parse({
    id: String(result.id),
    recipient_id: String(result.recipient_id),
    type: result.type === "warning" ? "warning" : "update",
    title: String(result.title ?? ""),
    content: String(result.content ?? ""),
    read: true,
    allow_replies: Boolean(result.allow_replies),
    replies: replies.map(reply => ({
      id: String(reply.id),
      notification_id: String(reply.notification_id),
      content: String(reply.content ?? ""),
      created_at: asDate(reply.created_at).toISOString(),
    })),
    created_at: asDate(result.created_at).toISOString(),
    updated_at: asDate(result.updated_at).toISOString(),
  }));
});

router.post("/notifications/:id/replies", async (req, res): Promise<void> => {
  const userId = readSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign-in required." });
    return;
  }
  const params = ReplyToNotificationParams.safeParse(req.params);
  const body = ReplyToNotificationBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Enter a response of up to 2,000 characters." });
    return;
  }
  const content = body.data.content.trim();
  if (!content) {
    res.status(400).json({ error: "Enter a response." });
    return;
  }
  const db = await getMongoDb();
  if (!db) {
    res.status(503).json({ error: "MongoDB unavailable" });
    return;
  }
  const notice = await db.collection("notifications").findOne({
    id: params.data.id,
    recipient_id: userId,
  });
  if (!notice) {
    res.status(404).json({ error: "Notification not found." });
    return;
  }
  if (!notice.allow_replies) {
    res.status(403).json({ error: "Replies are turned off for this notification." });
    return;
  }
  const readAt = notice.read_at ?? notice.updated_at ?? notice.created_at;
  if (notice.read && Date.now() - asDate(readAt).getTime() >= notificationReadLifetimeMs) {
    res.status(404).json({ error: "This notification has expired." });
    return;
  }
  const reply = {
    id: randomUUID(),
    notification_id: params.data.id,
    recipient_id: userId,
    notification_title: String(notice.title ?? ""),
    notification_type: notice.type === "warning" ? "warning" : "update",
    content,
    created_at: new Date(),
  };
  await db.collection("notification_replies").insertOne(reply);
  const now = new Date();
  const readUpdate: Record<string, unknown> = { read: true, updated_at: now };
  if (!notice.read) readUpdate.read_at = now;
  await db.collection("notifications").updateOne(
    { id: params.data.id, recipient_id: userId },
    { $set: readUpdate },
  );
  res.status(201).json({
    id: reply.id,
    notification_id: reply.notification_id,
    content: reply.content,
    created_at: reply.created_at.toISOString(),
  });
});

router.get("/admin/notification-replies", async (req, res): Promise<void> => {
  if (!verifyAdminToken(req)) {
    res.status(401).json({ error: "Admin sign-in required." });
    return;
  }
  const db = await getMongoDb();
  if (!db) {
    res.status(503).json({ error: "MongoDB unavailable" });
    return;
  }
  const replies = await db.collection("notification_replies")
    .find({})
    .sort({ created_at: -1 })
    .limit(500)
    .toArray();
  const recipientIds = [...new Set(replies.map(reply => String(reply.recipient_id)))];
  const users = recipientIds.length
    ? await db.collection("users")
      .find({ id: { $in: recipientIds } })
      .project({ id: 1, name: 1, username: 1 })
      .toArray()
    : [];
  const userById = new Map(users.map(user => [String(user.id), user]));
  res.json(GetAdminNotificationRepliesResponse.parse(replies.map(reply => {
    const recipient = userById.get(String(reply.recipient_id));
    return {
      id: String(reply.id),
      notification_id: String(reply.notification_id),
      notification_title: String(reply.notification_title ?? "App notification"),
      notification_type: reply.notification_type === "warning" ? "warning" : "update",
      recipient_id: String(reply.recipient_id),
      recipient_name: String(recipient?.name ?? "Unknown user"),
      recipient_username: String(recipient?.username ?? ""),
      content: String(reply.content ?? ""),
      created_at: asDate(reply.created_at).toISOString(),
    };
  })));
});

export default router;
