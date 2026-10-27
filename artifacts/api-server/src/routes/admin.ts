import { Router, type IRouter } from "express";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  AdminLoginBody,
  AdminLoginResponse,
  GetAdminUsersResponse,
  SendAdminNotificationBody,
} from "@workspace/api-zod";
import { getMongoDb } from "../lib/mongo";

const router: IRouter = Router();
const adminTokenLifetimeSeconds = 60 * 60 * 8;
const loginWindowMs = 15 * 60 * 1000;
const maxLoginAttempts = 5;
const loginAttempts = new Map<string, { startedAt: number; count: number }>();

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function issueAdminToken(username: string): { token: string; expiresAt: Date } | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  const expiresAt = new Date(Date.now() + adminTokenLifetimeSeconds * 1000);
  const payload = Buffer.from(JSON.stringify({
    sub: "whatschat-admin",
    role: "admin",
    username,
    exp: Math.floor(expiresAt.getTime() / 1000),
  })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return { token: `${payload}.${signature}`, expiresAt };
}

function verifyAdminToken(request: { headers: { authorization?: string | string[] } }): string | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  const authorization = Array.isArray(request.headers.authorization)
    ? request.headers.authorization[0]
    : request.headers.authorization;
  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      sub?: string;
      role?: string;
      username?: string;
      exp?: number;
    };
    if (
      decoded.sub !== "whatschat-admin" ||
      decoded.role !== "admin" ||
      !decoded.username ||
      !decoded.exp ||
      decoded.exp <= Math.floor(Date.now() / 1000)
    ) return null;
    return decoded.username;
  } catch {
    return null;
  }
}

function requestIsRateLimited(key: string): boolean {
  const current = Date.now();
  const existing = loginAttempts.get(key);
  if (!existing || current - existing.startedAt >= loginWindowMs) {
    loginAttempts.set(key, { startedAt: current, count: 1 });
    return false;
  }
  existing.count += 1;
  return existing.count > maxLoginAttempts;
}

router.post("/admin/auth/login", async (req, res): Promise<void> => {
  const input = AdminLoginBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Enter an admin username and password." });
    return;
  }

  const configuredUsername = process.env.ADMIN_USERNAME;
  const configuredPassword = process.env.ADMIN_PASSWORD;
  if (!configuredUsername || !configuredPassword || !process.env.SESSION_SECRET) {
    res.status(503).json({ error: "Admin access is not configured yet." });
    return;
  }

  const rateLimitKey = req.ip || "unknown";
  if (requestIsRateLimited(rateLimitKey)) {
    res.status(429).json({ error: "Too many sign-in attempts. Please wait and try again." });
    return;
  }

  const valid = safeEqual(input.data.username, configuredUsername) &&
    safeEqual(input.data.password, configuredPassword);
  if (!valid) {
    res.status(401).json({ error: "Invalid admin username or password." });
    return;
  }

  loginAttempts.delete(rateLimitKey);
  const session = issueAdminToken(configuredUsername);
  if (!session) {
    res.status(503).json({ error: "Admin access is not configured yet." });
    return;
  }

  res.json(AdminLoginResponse.parse({
    token: session.token,
    username: configuredUsername,
    expires_at: session.expiresAt,
  }));
});

router.get("/admin/users", async (req, res): Promise<void> => {
  if (!verifyAdminToken(req)) {
    res.status(401).json({ error: "Admin sign-in required." });
    return;
  }
  const db = await getMongoDb();
  if (!db) {
    res.status(503).json({ error: "MongoDB unavailable" });
    return;
  }

  const users = await db.collection("users").find({})
    .project({
      id: 1,
      name: 1,
      username: 1,
      profile_picture: 1,
      status: 1,
      last_seen: 1,
      created_at: 1,
      is_admin: 1,
    })
    .sort({ created_at: -1 })
    .toArray();
  res.json(GetAdminUsersResponse.parse(users.map(user => ({
    id: String(user.id),
    name: String(user.name ?? ""),
    username: String(user.username ?? ""),
    profile_picture: (user.profile_picture as string | null) ?? null,
    status: (user.status as string | null) ?? null,
    last_seen: user.last_seen ?? new Date(0),
    created_at: user.created_at ?? new Date(0),
    is_admin: Boolean(user.is_admin),
  }))));
});

router.post("/admin/notifications", async (req, res): Promise<void> => {
  if (!verifyAdminToken(req)) {
    res.status(401).json({ error: "Admin sign-in required." });
    return;
  }
  const input = SendAdminNotificationBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: input.error.message });
    return;
  }
  const db = await getMongoDb();
  if (!db) {
    res.status(503).json({ error: "MongoDB unavailable" });
    return;
  }
  const recipients = input.data.audience === "all"
    ? await db.collection("users").find({}, { projection: { id: 1 } }).toArray()
    : input.data.recipient_id
      ? [await db.collection("users").findOne(
          { id: input.data.recipient_id },
          { projection: { id: 1 } },
        )].filter(Boolean)
      : [];
  if (input.data.audience === "user" && recipients.length === 0) {
    res.status(input.data.recipient_id ? 404 : 400).json({
      error: input.data.recipient_id ? "User not found." : "Choose a recipient.",
    });
    return;
  }
  const timestamp = new Date();
  const notifications = recipients.map(recipient => ({
    id: randomUUID(),
    recipient_id: String(recipient!.id),
    type: input.data.type,
    title: input.data.title.trim(),
    content: input.data.content.trim(),
    read: false,
    created_at: timestamp,
    updated_at: timestamp,
  }));
  if (notifications.length) await db.collection("notifications").insertMany(notifications);
  res.status(201).json({ sent: notifications.length });
});

export { verifyAdminToken };
export default router;
