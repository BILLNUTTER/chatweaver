import { Router, type IRouter } from "express";
import { GetMyNotificationsResponse, MarkNotificationReadParams, MarkNotificationReadResponse } from "@workspace/api-zod";
import { getMongoDb } from "../lib/mongo";
import { readSessionUserId } from "../lib/session";

const router: IRouter = Router();

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
  const notifications = await db.collection("notifications")
    .find({ recipient_id: userId })
    .sort({ created_at: -1 })
    .limit(100)
    .toArray();
  res.json(GetMyNotificationsResponse.parse(notifications));
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

  const updatedAt = new Date();
  const result = await db.collection("notifications").findOneAndUpdate(
    { id: params.data.id, recipient_id: userId },
    { $set: { read: true, updated_at: updatedAt } },
    { returnDocument: "after" },
  );
  if (!result) {
    res.status(404).json({ error: "Notification not found." });
    return;
  }
  res.json(MarkNotificationReadResponse.parse(result));
});

export default router;
