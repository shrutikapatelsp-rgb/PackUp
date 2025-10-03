import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getEnv() {
  const url = process.env.SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !service) {
    return { ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE" as const };
  }
  return { ok: true, url, service };
}

export async function POST(req: NextRequest) {
  const env = getEnv();
  if (!env.ok) {
    return NextResponse.json({ ok: false, error: env.error }, { status: 500 });
  }

  const { title } = await req.json();

  // TODO: parse Authorization: Bearer to get real auth uid; hardcode for now so you can see rows
  const user_id = "31ca9576-095b-486d-b76c-8557d19ceff8";

  const supabase = createClient(env.url, env.service);

  // Minimal insert: only columns that surely exist (user_id, title)
  const { data, error } = await supabase
    .from("trips")
    .insert({ user_id, title: title ?? "Saved Trip" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, trip: data }, { status: 200 });
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
