// app/lib/pseudo.ts
import crypto from 'crypto';

const KEY = process.env.CLICK_ID_SECRET ?? '<CLICK_ID_SECRET_PLACEHOLDER>';

export function pseudonymizeClickId(raw: string) {
  // use HMAC-SHA256 of raw using CLICK_ID_SECRET and return hex
  const h = crypto.createHmac('sha256', KEY);
  h.update(raw);
  return h.digest('hex');
}

