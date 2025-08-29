import crypto from 'crypto';

/**
 * Creates a pseudonymous click_id for affiliates (no PII).
 * Do NOT pass email or names. Use userId or 'anon'.
 */
const SECRET = process.env.PSEUDONYM_SALT || 'rotate-me';

export function makeClickId(userId: string, ctx: Record<string, any> = {}) {
  // keep payload minimal; include timestamp to avoid reuse
  const payload = JSON.stringify({ u: userId, t: Date.now(), ...ctx });
  return crypto.createHmac('sha256', SECRET).update(payload).digest('hex').slice(0, 32);
}

