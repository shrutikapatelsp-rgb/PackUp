import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function envOrError() {
  const url = process.env.SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !service) {
    return { ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE" as const };
  }
  return { ok: true, url, service };
}

export async function POST(req: NextRequest) {
  const env = envOrError();
  if (!env.ok) {
    return NextResponse.json({ ok: false, error: env.error }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const title = (body?.title || "Saved Trip") as string;

  // TODO: parse Authorization: Bearer to resolve the real user id.
  // For now, use your uid so results are visible in export/tests.
  const user_id = "31ca9576-095b-486d-b76c-8557d19ceff8";

  const supabase = createClient(env.url, env.service);

  // Insert the minimum columns your live schema surely has.
  const { data, error } = await supabase
    .from("trips")
    .insert({ user_id, title })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, trip: data }, { status: 200 });
}

export async function GET() {
  // Helpful: 405 means the route exists and matched
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
