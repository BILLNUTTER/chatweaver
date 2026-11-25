import { Router, type IRouter } from "express";
import type { Document } from "mongodb";
import {
  AcceptFriendRequestParams,
  AcceptFriendRequestResponse,
  DeclineOrCancelFriendRequestParams,
  DeclineOrCancelFriendRequestResponse,
  GetIncomingFriendRequestsResponse,
  SendFriendRequestParams,
  SendFriendRequestResponse,
  UpdateMyProfileBody,
  UpdateMyProfileResponse,
} from "@workspace/api-zod";
import { getMongoDb, publicUser } from "../lib/mongo";
import { readSessionUserId } from "../lib/session";

const router: IRouter = Router();
type ContactUser = Document & {
  id: string;
  friends?: string[];
  friend_requests?: string[];
  sent_requests?: string[];
  username?: string;
  status?: string | null;
  profile_picture?: string | null;
};

const systemAvatars = new Set([
  "avatar:wave",
  "avatar:sun",
  "avatar:flower",
  "avatar:leaf",
  "avatar:moon",
  "avatar:star",
  "avatar:cat",
  "avatar:dog",
  "avatar:panda",
  "avatar:lion",
  "avatar:football",
  "avatar:heart",
]);

function withoutEntry(field: string, value: string): Document {
  return {
    $filter: {
      input: { $ifNull: [`$${field}`, []] },
      as: "entry",
      cond: { $ne: ["$$entry", value] },
    },
  };
}

function validProfilePicture(value: string): boolean {
  if (systemAvatars.has(value)) return true;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && value.length <= 2048;
  } catch {
    return false;
  }
}

router.get("/friend-requests", async (req, res): Promise<void> => {
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
  const currentUser = await db.collection<ContactUser>("users").findOne({ id: userId });
  const requestIds = Array.isArray(currentUser?.friend_requests)
    ? currentUser.friend_requests.map(String)
    : [];
  const requesters = requestIds.length
    ? await db.collection<ContactUser>("users").find({ id: { $in: requestIds } }).toArray()
    : [];
  res.json(GetIncomingFriendRequestsResponse.parse(requesters.map(user => {
    const profile = publicUser(user)!;
    return {
      ...profile,
      last_seen: profile.last_seen ?? user.created_at ?? new Date(),
      created_at: user.created_at ?? new Date(),
    };
  })));
});

router.post("/friend-requests/:userId", async (req, res): Promise<void> => {
  const userId = readSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign-in required." });
    return;
  }
  const params = SendFriendRequestParams.safeParse(req.params);
  if (!params.success || params.data.userId === userId) {
    res.status(400).json({ error: "Choose another registered user." });
    return;
  }
  const db = await getMongoDb();
  if (!db) {
    res.status(503).json({ error: "MongoDB unavailable" });
    return;
  }
  const [sender, recipient] = await Promise.all([
    db.collection<ContactUser>("users").findOne({ id: userId }),
    db.collection<ContactUser>("users").findOne({ id: params.data.userId }),
  ]);
  if (!sender || !recipient) {
    res.status(404).json({ error: "User not found." });
    return;
  }
  if (
    (Array.isArray(sender.friends) && sender.friends.includes(params.data.userId)) ||
    (Array.isArray(recipient.friends) && recipient.friends.includes(userId))
  ) {
    res.json(SendFriendRequestResponse.parse({ status: "contact" }));
    return;
  }
  if (Array.isArray(sender.sent_requests) && sender.sent_requests.includes(params.data.userId)) {
    res.json(SendFriendRequestResponse.parse({ status: "sent" }));
    return;
  }
  await Promise.all([
      db.collection<ContactUser>("users").updateOne(
      { id: userId },
      { $addToSet: { sent_requests: params.data.userId } },
    ),
      db.collection<ContactUser>("users").updateOne(
      { id: params.data.userId },
      { $addToSet: { friend_requests: userId } },
    ),
  ]);
  res.json(SendFriendRequestResponse.parse({ status: "sent" }));
});

router.post("/friend-requests/:userId/accept", async (req, res): Promise<void> => {
  const userId = readSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign-in required." });
    return;
  }
  const params = AcceptFriendRequestParams.safeParse(req.params);
  if (!params.success || params.data.userId === userId) {
    res.status(400).json({ error: "Invalid friend request." });
    return;
  }
  const db = await getMongoDb();
  if (!db) {
    res.status(503).json({ error: "MongoDB unavailable" });
    return;
  }
  const recipient = await db.collection<ContactUser>("users").findOne({
    id: userId,
    friend_requests: params.data.userId,
  });
  if (!recipient) {
    res.status(404).json({ error: "Incoming request not found." });
    return;
  }
  const requester = await db.collection<ContactUser>("users").findOne({ id: params.data.userId });
  if (!requester) {
    res.status(404).json({ error: "Requesting user not found." });
    return;
  }
  await Promise.all([
    db.collection<ContactUser>("users").updateOne(
      { id: userId },
      [{
        $set: {
          friends: { $setUnion: [{ $ifNull: ["$friends", []] }, [params.data.userId]] },
          friend_requests: withoutEntry("friend_requests", params.data.userId),
        },
      }],
    ),
    db.collection<ContactUser>("users").updateOne(
      { id: params.data.userId },
      [{
        $set: {
          friends: { $setUnion: [{ $ifNull: ["$friends", []] }, [userId]] },
          sent_requests: withoutEntry("sent_requests", userId),
        },
      }],
    ),
  ]);
  res.json(AcceptFriendRequestResponse.parse({ status: "accepted" }));
});

router.delete("/friend-requests/:userId", async (req, res): Promise<void> => {
  const userId = readSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign-in required." });
    return;
  }
  const params = DeclineOrCancelFriendRequestParams.safeParse(req.params);
  if (!params.success || params.data.userId === userId) {
    res.status(400).json({ error: "Invalid friend request." });
    return;
  }
  const db = await getMongoDb();
  if (!db) {
    res.status(503).json({ error: "MongoDB unavailable" });
    return;
  }
  const otherId = params.data.userId;
  const current = await db.collection<ContactUser>("users").findOne({ id: userId });
  const hasIncoming = Array.isArray(current?.friend_requests) && current.friend_requests.includes(otherId);
  const hasOutgoing = Array.isArray(current?.sent_requests) && current.sent_requests.includes(otherId);
  if (!hasIncoming && !hasOutgoing) {
    res.status(404).json({ error: "Friend request not found." });
    return;
  }
  if (hasIncoming) {
    await Promise.all([
      db.collection<ContactUser>("users").updateOne(
        { id: userId },
        [{ $set: { friend_requests: withoutEntry("friend_requests", otherId) } }],
      ),
      db.collection<ContactUser>("users").updateOne(
        { id: otherId },
        [{ $set: { sent_requests: withoutEntry("sent_requests", userId) } }],
      ),
    ]);
  } else {
    await Promise.all([
      db.collection<ContactUser>("users").updateOne(
        { id: userId },
        [{ $set: { sent_requests: withoutEntry("sent_requests", otherId) } }],
      ),
      db.collection<ContactUser>("users").updateOne(
        { id: otherId },
        [{ $set: { friend_requests: withoutEntry("friend_requests", userId) } }],
      ),
    ]);
  }
  res.json(DeclineOrCancelFriendRequestResponse.parse({ status: "removed" }));
});

router.patch("/profile", async (req, res): Promise<void> => {
  const userId = readSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign-in required." });
    return;
  }
  const body = UpdateMyProfileBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const db = await getMongoDb();
  if (!db) {
    res.status(503).json({ error: "MongoDB unavailable" });
    return;
  }
  const updates: Record<string, unknown> = {};
  if (body.data.username !== undefined) {
    const username = body.data.username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,32}$/.test(username)) {
      res.status(400).json({ error: "Username must be 3 to 32 lowercase letters, numbers, or underscores." });
      return;
    }
    const duplicate = await db.collection<ContactUser>("users").findOne({
      username,
      id: { $ne: userId },
    });
    if (duplicate) {
      res.status(409).json({ error: "That username is already taken." });
      return;
    }
    updates.username = username;
  }
  if (body.data.status !== undefined) updates.status = body.data.status?.trim() || null;
  if (body.data.profile_picture !== undefined) {
    const picture = body.data.profile_picture?.trim() || null;
    if (picture && !validProfilePicture(picture)) {
      res.status(400).json({ error: "Use a system avatar or a valid HTTP(S) image URL." });
      return;
    }
    updates.profile_picture = picture;
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Choose at least one profile field to update." });
    return;
  }
  const result = await db.collection<ContactUser>("users").findOneAndUpdate(
    { id: userId },
    { $set: { ...updates, updated_at: new Date().toISOString() } },
    { returnDocument: "after" },
  );
  if (!result) {
    res.status(404).json({ error: "Profile not found." });
    return;
  }
  res.json(UpdateMyProfileResponse.parse({
    id: result.id,
    username: result.username,
    status: result.status ?? null,
    profile_picture: result.profile_picture ?? null,
  }));
});

export default router;
