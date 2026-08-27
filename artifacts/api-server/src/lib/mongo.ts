import { MongoClient, type Db, type Document } from "mongodb";
import { logger } from "./logger";

const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DATABASE ?? "chatweaver";

let client: MongoClient | null = null;
let databasePromise: Promise<Db | null> | null = null;

export function isMongoConfigured(): boolean {
  return Boolean(uri);
}

export async function getMongoDb(): Promise<Db | null> {
  if (!uri) return null;
  if (databasePromise) return databasePromise;

  databasePromise = (async () => {
    try {
      client = new MongoClient(uri, {
        serverSelectionTimeoutMS: 1200,
        connectTimeoutMS: 1200,
        maxPoolSize: 20,
      });
      await client.connect();
      const db = client.db(databaseName);
      await db.command({ ping: 1 });
      await Promise.all([
        db.collection("messages").createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
        db.collection("users").createIndex({ email: 1 }, { unique: true, sparse: true }),
        db.collection("users").createIndex({ username: 1 }, { unique: true, sparse: true }),
      ]);
      logger.info({ database: databaseName }, "MongoDB is available");
      return db;
    } catch (error) {
      logger.warn({ err: error }, "MongoDB is unavailable; keeping the existing database path active");
      if (client) await client.close().catch(() => undefined);
      client = null;
      databasePromise = null;
      return null;
    }
  })();

  return databasePromise;
}

export async function getStorageMode(): Promise<"mongodb"> {
  await getMongoDb();
  return "mongodb";
}

export async function cleanupExpiredMessages(): Promise<void> {
  const db = await getMongoDb();
  if (!db) return;
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000);
  const messageResult = await db.collection("messages").deleteMany({
    $or: [
      { expires_at: { $lte: cutoff } },
      { created_at: { $lte: cutoff }, is_personal_chat: true },
    ],
  });
  const staleConversations = await db.collection("conversations").find({
    is_group: false,
    $or: [
      { last_message_at: { $lte: cutoff } },
      { last_message_at: null, created_at: { $lte: cutoff } },
    ],
  }).project({ id: 1 }).toArray();
  const conversationIds = staleConversations.map((conversation) => conversation.id);
  const conversationResult = conversationIds.length
    ? await db.collection("conversations").deleteMany({ id: { $in: conversationIds } })
    : { deletedCount: 0 };
  if (conversationIds.length) {
    await db.collection("messages").deleteMany({ conversation_id: { $in: conversationIds } });
  }
  const deletedCount = messageResult.deletedCount + conversationResult.deletedCount;
  if (deletedCount > 0) {
    logger.info({ deletedCount }, "Removed expired personal chat data");
  }
}

export function asDate(value: unknown): Date {
  if (value instanceof Date) return value;
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function cleanDocument<T extends Document>(document: T | null): Omit<T, "_id"> | null {
  if (!document) return null;
  const { _id: _, ...rest } = document;
  return rest as Omit<T, "_id">;
}