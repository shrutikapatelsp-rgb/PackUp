import crypto from "crypto";

/**
 * makeClickId: HMAC-based pseudonymization for click tracking.
 * secret optional: if not provided, read from CLICK_ID_SECRET env.
 */
export function makeClickId(userId: string, meta: Record<string, any> = {}, secret?: string) {
  const key = secret || process.env.CLICK_ID_SECRET || "";
  const payload = JSON.stringify({ u: userId, m: meta, ts: Date.now() });
  return crypto.createHmac("sha256", key).update(payload).digest("hex");
}
