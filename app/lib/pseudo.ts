/**
 * app/lib/pseudo.ts
 * Utilities for pseudonymizing identifiers for affiliate click IDs
 */
import crypto from 'crypto';

export function makeClickId(userId: string, meta: Record<string, any> = {}, secret: string) {
  if (!secret) {
    // Fallback deterministic pseudonym (not cryptographically secure) for dev only
    return `dev-${userId}-${Date.now()}`;
  }
  const payload = JSON.stringify({ u: userId, m: meta, ts: Date.now() });
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}
