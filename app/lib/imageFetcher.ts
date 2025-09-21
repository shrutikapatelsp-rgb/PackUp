import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";
import { URL } from "url";
import crypto from "crypto";

type ProviderName = "unsplash" | "pexels" | "bing" | "google" | "wikimedia";

export type FetchImageResult = {
  provider: ProviderName;
  author?: string | null;
  license?: string | null;
  originalUrl: string;
  url: string; // uploaded Supabase URL
  path: string; // object path in bucket
  width?: number;
  height?: number;
  attempts?: any[];
  diag?: any;
};

const SUPA_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_ROLE;
const BUCKET = process.env.SUPABASE_IMAGE_BUCKET || "packup-images";

if (!SUPA_URL || !SUPA_SERVICE) {
  // throw at import time to avoid silent failures in production
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE env for imageFetcher");
}

const supaSvc = createClient(SUPA_URL, SUPA_SERVICE);

/** small helper to sleep */
function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

/** safe fetch with timeout */
async function timedFetch(url: string, opts: any = {}, timeoutMs = 3000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

/** download a url to a Buffer with retries */
async function downloadBuffer(url: string, attempts = 2, timeoutMs = 5000) {
  let lastErr: any = null;
  for (let i = 0; i <= attempts; i++) {
    try {
      const r = await timedFetch(url, { headers: { "User-Agent": "PackUpImageFetcher/1.0" } }, timeoutMs * (1 + i));
      if (!r.ok) throw new Error(`http ${r.status}`);
      const buf = await r.arrayBuffer();
      return Buffer.from(buf);
    } catch (err: any) {
      lastErr = err;
      await sleep(200 * Math.pow(2, i));
    }
  }
  throw lastErr;
}

/** simple filename sanitizer */
function safeFilename(base: string) {
  return base.replace(/[^a-zA-Z0-9_\-\.]/g, "_").slice(0, 220);
}

/** upload Buffer to Supabase Storage and return public path */
async function uploadToSupabase(buf: Buffer, keyPrefix: string, originalUrl: string) {
  const id = crypto.randomUUID();
  const ext = (() => {
    try {
      const u = new URL(originalUrl);
      const p = u.pathname;
      const m = p.match(/\.(jpg|jpeg|png|webp|gif|bmp|tiff|svg)$/i);
      return m ? m[0] : ".jpg";
    } catch {
      return ".jpg";
    }
  })();
  const name = safeFilename(`${keyPrefix}_${id}${ext}`);
  const path = `itineraries/${name}`;
  const res = await supaSvc.storage.from(BUCKET).upload(path, buf, {
    contentType: undefined,
    upsert: false,
  });

  if (res.error) throw new Error(`upload_failed: ${res.error.message}`);
  // Build public URL (Supabase storage public URL)
  // Use storage/v1/object/public/<bucket>/<path>
  const publicUrl = `${SUPA_URL.replace(/\/$/, "")}/storage/v1/object/public/${encodeURIComponent(BUCKET)}/${encodeURIComponent(path)}`;
  return { url: publicUrl, path };
}

/** Provider implementations — return first usable candidate or null */
/* UNSPLASH */
async function searchUnsplash(query: string, opts: { timeoutMs: number }) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=3`;
  const r = await timedFetch(url, { headers: { Authorization: `Client-ID ${key}` } }, opts.timeoutMs);
  if (!r.ok) return null;
  const j = await r.json();
  const first = j.results?.[0];
  if (!first) return null;
  return {
    provider: "unsplash" as ProviderName,
    author: first.user?.name ?? null,
    license: "unsplash",
    originalUrl: first.urls?.full ?? first.urls?.raw ?? first.urls?.regular,
  };
}

/* PEXELS */
async function searchPexels(query: string, opts: { timeoutMs: number }) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=3`;
  const r = await timedFetch(url, { headers: { Authorization: key } }, opts.timeoutMs);
  if (!r.ok) return null;
  const j = await r.json();
  const first = j.photos?.[0];
  if (!first) return null;
  return {
    provider: "pexels" as ProviderName,
    author: (first.photographer as string) ?? null,
    license: "pexels",
    originalUrl: first.src?.original ?? first.src?.large,
  };
}

/* BING Image Search (optional) */
async function searchBing(query: string, opts: { timeoutMs: number }) {
  const key = process.env.BING_API_KEY;
  const endpoint = process.env.BING_ENDPOINT; // e.g., https://api.bing.microsoft.com/v7.0/images/search
  if (!key || !endpoint) return null;
  const url = `${endpoint}?q=${encodeURIComponent(query)}&count=3`;
  const r = await timedFetch(url, { headers: { "Ocp-Apim-Subscription-Key": key } }, opts.timeoutMs);
  if (!r.ok) return null;
  const j = await r.json();
  const first = j.value?.[0];
  if (!first) return null;
  return {
    provider: "bing" as ProviderName,
    author: first.hostPageDisplayUrl ?? null,
    license: null,
    originalUrl: first.contentUrl,
  };
}

/* Google Custom Search (CSE) */
async function searchGoogleCSE(query: string, opts: { timeoutMs: number }) {
  const key = process.env.GOOGLE_API_KEY;
  const cx = process.env.GOOGLE_CX;
  if (!key || !cx) return null;
  const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(key)}&cx=${encodeURIComponent(cx)}&searchType=image&q=${encodeURIComponent(query)}&num=3`;
  const r = await timedFetch(url, {}, opts.timeoutMs);
  if (!r.ok) {
    // Google sometimes returns 403/429; bubble up
    const text = await r.text().catch(() => "");
    throw new Error(`google_cse_error ${r.status} ${text}`);
  }
  const j = await r.json();
  const first = j.items?.[0];
  if (!first) return null;
  return {
    provider: "google" as ProviderName,
    author: first.displayLink ?? null,
    license: null,
    originalUrl: first.link,
  };
}

/* Wikimedia Commons search */
async function searchWikimedia(query: string, opts: { timeoutMs: number }) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=3`;
  const r = await timedFetch(url, {}, opts.timeoutMs);
  if (!r.ok) return null;
  const j = await r.json();
  const pages = j.query?.pages;
  if (!pages) return null;
  const firstKey = Object.keys(pages)[0];
  if (!firstKey) return null;
  const imageinfo = pages[firstKey]?.imageinfo?.[0];
  if (!imageinfo) return null;
  return {
    provider: "wikimedia" as ProviderName,
    author: imageinfo?.user ?? null,
    license: imageinfo?.extmetadata?.LicenseShortName?.value ?? null,
    originalUrl: imageinfo?.url,
  };
}

/** Main exported function:
 *  fetchAndStoreImage(query, options)
 *  options: { timeoutMs?: number, attempts?: number, operationId?: string, keyPrefix?: string }
 */
export async function fetchAndStoreImage(query: string, options: any = {}): Promise<FetchImageResult> {
  const op = options.operationId || `img_${Date.now().toString(36)}`;
  const timeoutMs = options.timeoutMs ?? 3000;
  const maxAttempts = options.attempts ?? 2;

  // providers in priority order (we will attempt them, but we fetch candidates in parallel)
  const providerFns: Array<() => Promise<any>> = [
    () => searchUnsplash(query, { timeoutMs }),
    () => searchPexels(query, { timeoutMs }),
    () => searchBing(query, { timeoutMs }).catch((e) => null),
    () => searchGoogleCSE(query, { timeoutMs }).catch((e) => null),
    () => searchWikimedia(query, { timeoutMs }).catch((e) => null),
  ];

  const diag: any[] = [];

  // we'll call each provider in sequence but allow each to retry internally.
  for (let pi = 0; pi < providerFns.length; pi++) {
    const pname = ["unsplash", "pexels", "bing", "google", "wikimedia"][pi] as ProviderName;
    let providerResult: any = null;
    let attempts: any[] = [];
    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
      try {
        providerResult = await providerFns[pi]();
        attempts.push({ attempt, ok: !!providerResult });
        if (providerResult) break;
      } catch (err: any) {
        attempts.push({ attempt, ok: false, error: String(err?.message ?? err) });
      }
      // exponential backoff
      await sleep(200 * Math.pow(2, attempt));
    }
    diag.push({ provider: pname, attempts });
    if (!providerResult) continue;

    // We have an originalUrl — download it and upload to supabase
    try {
      const buf = await downloadBuffer(providerResult.originalUrl, 2, timeoutMs * 2);
      // optional: validate minimal size by checking buffer length (approx)
      if (buf.length < 5_000) {
        // too small; try next provider
        diag.push({ note: "skipping tiny buffer", provider: pname, size: buf.length });
        continue;
      }
      const upl = await uploadToSupabase(buf, op + "_" + pname, providerResult.originalUrl);
      const result: FetchImageResult = {
        provider: pname,
        author: providerResult.author ?? null,
        license: providerResult.license ?? null,
        originalUrl: providerResult.originalUrl,
        url: upl.url,
        path: upl.path,
        width: undefined,
        height: undefined,
        attempts,
        diag
      };
      return result;
    } catch (err: any) {
      diag.push({ provider: pname, uploadError: String(err?.message ?? err) });
      // try next provider
      continue;
    }
  }

  // if we reached here, all providers failed
  const err: any = new Error("IMAGE_FETCH_FAILED");
  (err as any).code = "IMAGE_FETCH_FAILED";
  (err as any).diag = diag;
  throw err;
}
