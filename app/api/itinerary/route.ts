import { NextRequest, NextResponse } from "next/server";
import { generateItineraryJSON } from "../../lib/openai";
import { fetchAndStoreImage } from "../../lib/imageFetcher";
import { createClient } from "@supabase/supabase-js";

const SUPA_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_ROLE;
const SUPA_IMAGE_BUCKET = process.env.SUPABASE_IMAGE_BUCKET || "packup-images";

if (!SUPA_URL || !SUPA_SERVICE) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE");
}

function extractBearer(req: NextRequest): string | null {
  const raw = req.headers.get("authorization") || "";
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

export async function POST(req: NextRequest) {
  const opId = `itinerary_${crypto.randomUUID()}`;
  try {
    const token = extractBearer(req);
    if (!token) return NextResponse.json({ code: "AUTH_INVALID", message: "Missing token", operationId: opId }, { status: 401 });

    const body = await req.json().catch(() => null);
    if (!body || !body.destination || !body.startDate || !body.endDate) {
      return NextResponse.json({ code: "BAD_REQUEST", message: "Missing required fields", operationId: opId }, { status: 400 });
    }

    // generate itinerary JSON (may use mock fallback)
    const itinerary = await generateItineraryJSON(JSON.stringify(body), opId);

    // for each day image, fetch & upload using SUPABASE_SERVICE_ROLE client
    const sb = createClient(SUPA_URL, SUPA_SERVICE);
    for (const day of itinerary.days || []) {
      if (!Array.isArray(day.images)) continue;
      for (const img of day.images) {
        // fetch via providers and upload to supabase storage
        const fetched = await fetchAndStoreImage(String(img.query), { operationId: opId, timeoutMs: 7000 });
        if (!fetched || !fetched.url) {
          return NextResponse.json({
            code: "IMAGE_FETCH_FAILED",
            message: `Failed to fetch image for day ${day.day}`,
            details: { query: img.query, diag: fetched?.diag ?? null },
            operationId: opId
          }, { status: 500 });
        }

        // NOTE: fetched.provider is used (imageFetcher returns provider property)
        img.source = fetched.provider as any;
        img.author = fetched.author ?? null;
        img.license = fetched.license ?? null;
        img.originalUrl = fetched.originalUrl;
        img.url = fetched.url;
        img.path = fetched.path;
        img.width = fetched.width;
        img.height = fetched.height;
      }
    }

    // create markdown (simple)
    const markdown = `# ${itinerary.title}\n\n` + (itinerary.days || []).map((d: any) => `## Day ${d.day}: ${d.theme}\n\n${d.details}\n`).join("\n");

    return NextResponse.json({ itineraryJson: itinerary, markdown, operationId: opId });
  } catch (err: any) {
    return NextResponse.json({ code: err?.code ?? "SERVER_ERROR", message: err?.message ?? "Server failure", operationId: opId }, { status: 500 });
  }
}
