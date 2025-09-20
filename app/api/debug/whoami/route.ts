import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Debug route: verifies incoming Bearer token with Supabase and returns user info.
 * IMPORTANT: uses the public anon key to call auth.getUser() while providing
 * the incoming JWT in the Authorization header.
 */

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPA_URL || !SUPA_ANON) {
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

    // NON-NULL assertion (!) — we validated SUPA_ANON above.
    const sb = createClient(SUPA_URL, SUPA_ANON!, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    });

    const { data: userData, error: userErr } = await sb.auth.getUser();
    if (userErr || !userData?.user) {
      const details = userErr ? { message: userErr.message, status: (userErr as any).status } : undefined;
      return NextResponse.json({ ok: false, code: "AUTH_INVALID", message: "Token parsed but user not found or invalid", details, operationId }, { status: 401 });
    }

    return NextResponse.json({ ok: true, source: "auth", user: userData.user, operationId });
  } catch (err: any) {
    return NextResponse.json({ ok: false, code: "SERVER_ERROR", message: err?.message ?? "Unknown error", operationId }, { status: 500 });
  }
}
