/* app/api/debug/tokeninfo/route.ts
   TEMP DEBUG ROUTE - remove after use.
   - Decodes incoming Bearer token payload locally.
   - Reports server SUPABASE_URL and presence of anon key (boolean).
   - Calls sb.auth.getUser() and returns any error details.
*/
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function extractBearer(req: NextRequest): string | null {
  const raw = req.headers.get("authorization") || "";
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function safeDecodePayload(token: string) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return { error: "token_malformed", parts: parts.length };
    const payload = parts[1];
    // pad for base64 url
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const decoded = Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    try {
      return { payload: JSON.parse(decoded) };
    } catch (e) {
      return { error: "json_parse_failed", decoded };
    }
  } catch (e: any) {
    return { error: "decode_failed", message: e?.message ?? String(e) };
  }
}

export async function GET(req: NextRequest) {
  const op = `tokeninfo-${Date.now().toString(36)}`;
  try {
    const token = extractBearer(req);
    if (!token) {
      return NextResponse.json({ ok: false, code: "NO_TOKEN", message: "No Authorization Bearer token found", operationId: op }, { status: 400 });
    }

    // decode token locally
    const decoded = safeDecodePayload(token);

    const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || null;
    const ANON_PRESENT = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY);

    // Build a supabase client using anon (if present) and attach incoming token
    let sb;
    let authGetUserResult: any = null;
    try {
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
      if (anonKey) {
        sb = createClient(SUPA_URL || "", anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
        const res = await sb.auth.getUser();
        authGetUserResult = { data: res.data ?? null, error: res.error ?? null };
      } else {
        authGetUserResult = { data: null, error: { message: "anon key missing in process.env" } };
      }
    } catch (e: any) {
      authGetUserResult = { data: null, error: { message: e?.message ?? String(e) } };
    }

    // return structured debug info (no secret values)
    return NextResponse.json({
      ok: true,
      operationId: op,
      server: {
        SUPABASE_URL: SUPA_URL,
        ANON_PRESENT: ANON_PRESENT
      },
      tokenDecoded: decoded,
      authGetUserResult
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, code: "SERVER_ERROR", message: err?.message ?? "unknown", operationId: op }, { status: 500 });
  }
}
