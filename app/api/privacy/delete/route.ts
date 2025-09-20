import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPA_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPA_URL || !SERVICE_ROLE) throw new Error("Missing SUPABASE envs");

function extractBearer(req: NextRequest) {
  const raw = req.headers.get("authorization") || "";
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

export async function DELETE(req: NextRequest) {
  const opId = `privacy-delete-${Date.now().toString(36)}`;
  try {
    const token = extractBearer(req);
    if (!token) return NextResponse.json({ ok: false, code: "AUTH_INVALID", message: "No token", operationId: opId }, { status: 401 });

    // verify user with anon client
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const sb = createClient(SUPA_URL, anon!, { global: { headers: { Authorization: `Bearer ${token}` } } });

    const { data: userData, error: userErr } = await sb.auth.getUser();
    if (userErr || !userData?.user) return NextResponse.json({ ok: false, code: "AUTH_INVALID", message: "User not found", operationId: opId }, { status: 401 });

    const uid = userData.user.id;

    // Use service-role client to delete PII-scoped rows
    const svc = createClient(SUPA_URL, SERVICE_ROLE);

    // Delete order_items (by order id)
    const orders = await svc.from("orders").select("id").eq("user_id", uid);
    const orderIds = (orders.data || []).map((r: any) => r.id);
    if (orderIds.length) {
      await svc.from("order_items").delete().in("order_id", orderIds).select("*");
    }

    // delete cart items, orders, trips, users
    await svc.from("cart_items").delete().eq("user_id", uid).select("*");
    await svc.from("orders").delete().eq("user_id", uid).select("*");
    await svc.from("trips").delete().eq("user_id", uid).select("*");
    await svc.from("users").delete().eq("id", uid).select("*");

    return NextResponse.json({ ok: true, deleted: { user: uid }, operationId: opId });
  } catch (err: any) {
    return NextResponse.json({ ok: false, code: err?.code ?? "SERVER_ERROR", message: err?.message ?? "Server error", operationId: opId }, { status: 500 });
  }
}
