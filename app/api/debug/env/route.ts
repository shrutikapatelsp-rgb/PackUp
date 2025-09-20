import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    SUPABASE_IMAGE_BUCKET: process.env.SUPABASE_IMAGE_BUCKET || "MISSING",
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY ? "SET" : "MISSING",
    GOOGLE_CX: process.env.GOOGLE_CX ? "SET" : "MISSING",
    UNSPLASH_ACCESS_KEY: process.env.UNSPLASH_ACCESS_KEY ? "SET" : "MISSING",
    PEXELS_API_KEY: process.env.PEXELS_API_KEY ? "SET" : "MISSING",
    BING_API_KEY: process.env.BING_API_KEY ? "SET" : "MISSING",
    BING_ENDPOINT: process.env.BING_ENDPOINT ? "SET" : "MISSING",
  });
}
