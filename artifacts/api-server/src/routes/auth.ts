import { Router, type IRouter } from "express";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { randomUUID } from "node:crypto";
import { getMongoDb, cleanDocument } from "../lib/mongo";

const router: IRouter = Router();
const sessionSecret = process.env.SESSION_SECRET ?? "chatweaver-development-secret";
const sessionLifetimeSeconds = 60 * 60 * 24 * 30;

function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string) {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

function createToken(userId: string) {
  const payload = Buffer.from(JSON.stringify({
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + sessionLifetimeSeconds,
  })).toString("base64url");
  const signature = createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function readToken(request: { headers: { authorization?: string } }) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString()) as { sub?: string; exp?: number };
    return decoded.sub && decoded.exp && decoded.exp > Math.floor(Date.now() / 1000) ? decoded.sub : null;
  } catch {
    return null;
  }
}

function publicUser(user: Record<string, unknown> | null) {
  if (!user) return null;
  const safe = cleanDocument(user);
  if (!safe) return null;
  const result = { ...(safe as Record<string, unknown>) };
  delete result.password;
  delete result.password_hash;
  return result;
}

function profileFromInput(input: Record<string, unknown>, id: string, passwordHash: string) {
  const timestamp = new Date().toISOString();
  return {
    id,
    name: String(input.name ?? ""),
    username: String(input.username ?? "").toLowerCase(),
    email: String(input.email ?? "").toLowerCase(),
    phone: String(input.phone ?? ""),
    password_hash: passwordHash,
    profile_picture: null,
    cover_photo: null,
    is_admin: false,
    status: "Hey there! I am using WhatsChat.",
    last_seen: timestamp,
    friends: [],
    friend_requests: [],
    sent_requests: [],
    created_at: timestamp,
    updated_at: timestamp,
    is_verified: false,
  };
}

router.post("/auth/register", async (req, res) => {
  const db = await getMongoDb();
  if (!db) return res.status(503).json({ error: "MongoDB unavailable" });
  const input = req.body as Record<string, unknown>;
  const email = String(input.email ?? "").toLowerCase();
  const username = String(input.username ?? "").toLowerCase();
  const phone = String(input.phone ?? "");
  const name = String(input.name ?? "").trim();
  const password = String(input.password ?? "");
  if (name.length < 2) return res.status(400).json({ error: "Name must be at least 2 characters." });
  if (!/^[a-z0-9_]{3,}$/.test(username)) {
    return res.status(400).json({ error: "Username must be at least 3 characters and use lowercase letters, numbers, or underscores." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Please enter a valid email address." });
  if (phone.length < 7) return res.status(400).json({ error: "Please enter a valid phone number." });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
  const duplicate = await db.collection("users").findOne({ $or: [{ email }, { username }, { phone }] });
  if (duplicate) return res.status(409).json({ error: "Email, phone, or username already taken." });

  const user = profileFromInput({ ...input, name, username, email, phone }, randomUUID(), hashPassword(password));
  try {
    await db.collection("users").insertOne(user);
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      return res.status(409).json({ error: "Email, phone, or username already taken." });
    }
    throw error;
  }
  return res.status(201).json({ token: createToken(user.id), user: publicUser(user) });
});

router.post("/auth/login", async (req, res) => {
  const db = await getMongoDb();
  if (!db) return res.status(503).json({ error: "MongoDB unavailable" });
  const input = req.body as Record<string, unknown>;
  const email = String(input.email ?? "").toLowerCase();
  const user = await db.collection("users").findOne({ email });
  if (!user || typeof user.password_hash !== "string" || !verifyPassword(String(input.password ?? ""), user.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password." });
  }
  await db.collection("users").updateOne({ id: user.id }, { $set: { last_seen: new Date().toISOString() } });
  return res.json({ token: createToken(String(user.id)), user: publicUser(user) });
});

router.get("/auth/me", async (req, res) => {
  const db = await getMongoDb();
  const userId = readToken(req);
  if (!db || !userId) return res.status(401).json({ error: "Invalid session" });
  return res.json(publicUser(await db.collection("users").findOne({ id: userId })));
});

export default router;