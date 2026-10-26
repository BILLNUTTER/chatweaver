import { createHmac, timingSafeEqual } from "node:crypto";

const sessionSecret = process.env.SESSION_SECRET;

export function readSessionUserId(request: { headers: { authorization?: string | string[] } }): string | null {
  if (!sessionSecret) return null;
  const authorization = Array.isArray(request.headers.authorization)
    ? request.headers.authorization[0]
    : request.headers.authorization;
  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString()) as { sub?: string; exp?: number };
    return decoded.sub && decoded.exp && decoded.exp > Math.floor(Date.now() / 1000)
      ? decoded.sub
      : null;
  } catch {
    return null;
  }
}
