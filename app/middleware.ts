import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ALLOWED = [
  "http://localhost:3000",
  "https://pack-up-nine.vercel.app",            // your Vercel backend
  "https://preview--packup-ai.lovable.app",     // <— your Lovable preview
  // add prod lovable when you publish:
  // "https://packup-ai.lovable.app"
];

export function middleware(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  const isAllowed = ALLOWED.includes(origin);

  // Only apply CORS to /api/* routes
  if (req.nextUrl.pathname.startsWith("/api/")) {
    const res = NextResponse.next();

    if (isAllowed) {
      res.headers.set("Access-Control-Allow-Origin", origin);
      res.headers.set("Vary", "Origin");
    }
    res.headers.set("Access-Control-Allow-Credentials", "true");
    res.headers.set("Access-Control-Allow-Headers", "authorization, x-requested-with, content-type");
    res.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");

    // Preflight
    if (req.method === "OPTIONS") return res;

    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};

