import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Debug route: verifies incoming Bearer token with Supabase and returns user info.
 * IMPORTANT: This route uses the public anon key to call auth.getUser() while providing
 * the incoming JWT in the Authorization header.
 *
 * Do NOT expose your SERVICE_ROLE here.
 */

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPA_URL || !SUPA_ANON) {
  // We throw earliest so developer sees missing envs on build / startup.
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in env");
}

function extractBearer(req: NextRequest): string | null {
  const raw = req.headers.get("authorization") || "";
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

export async function GET(req: NextRequest) {
  const operationId = `whoami-${Date.now().toString(36)}`;
  try {
    const token = extractBearer(req);
    if (!token) {
      return NextResponse.json({ ok: false, code: "AUTH_INVALID", message: "Missing Authorization Bearer token", operationId }, { status: 401 });
    }

    // Create a Supabase client using the anon key (public key).
    // Attach Authorization header with the incoming user JWT so auth.getUser() can resolve it.
    const sb = createClient(SUPA_URL, SUPA_ANON, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    });

    // Call getUser() — this will verify the token and return the user when client is configured correctly.
    const { data: userData, error: userErr } = await sb.auth.getUser();
    if (userErr || !userData?.user) {
      // provide helpful debug info without leaking secrets
      const details = userErr ? { message: userErr.message, status: (userErr as any).status } : undefined;
      return NextResponse.json({ ok: false, code: "AUTH_INVALID", message: "Token parsed but user not found or invalid", details, operationId }, { status: 401 });
    }

    // Optionally fetch the users table profile (if you keep a separate profile table)
    // but for debug we return core auth.user object only.
    return NextResponse.json({ ok: true, source: "auth", user: userData.user, operationId });
  } catch (err: any) {
    // Log server error
    // avoid leaking env values or tokens in the response
    return NextResponse.json({ ok: false, code: "SERVER_ERROR", message: err?.message ?? "Unknown error", operationId }, { status: 500 });
  }
}
