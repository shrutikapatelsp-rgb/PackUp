import crypto from 'crypto';

const SECRET = process.env.PSEUDONYM_SALT || 'rotate-me';

export function makeClickId(userId: string, ctx: Record<string, any> = {}) {
  const payload = JSON.stringify({ u: userId, t: Date.now(), ...ctx });
  return crypto.createHmac('sha256', SECRET).update(payload).digest('hex').slice(0, 32);
}

