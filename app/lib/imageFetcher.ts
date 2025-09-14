import supabaseServer from './supabaseServer';
import { randomUUID } from 'crypto';

const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY;
const PEXELS_KEY = process.env.PEXELS_API_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_IMAGE_BUCKET || 'packup-images';

type ProviderResult = {
  url: string;
  width?: number;
  height?: number;
  author?: string;
  license?: string;
  source: 'unsplash' | 'pexels' | 'wikimedia';
  originalUrl?: string;
};

type FetchOpts = { timeoutMs?: number; operationId?: string };

const PROVIDERS: Array<'unsplash' | 'pexels' | 'wikimedia'> = ['unsplash', 'pexels', 'wikimedia'];

/** helper: fetch with timeout + retries */
async function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = 3000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

/** Search Unsplash */
async function tryUnsplash(query: string, timeoutMs: number): Promise<ProviderResult | null> {
  if (!UNSPLASH_KEY) return null;
  const qs = new URLSearchParams({ query, per_page: '1', orientation: 'landscape' });
  const url = `https://api.unsplash.com/search/photos?${qs.toString()}`;
  const res = await fetchWithTimeout(url, { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` } }, timeoutMs);
  if (!res.ok) return null;
  const j = await res.json().catch(() => null);
  const r = j?.results?.[0];
  if (!r) return null;
  return {
    url: r.urls?.regular || r.urls?.full || r.urls?.raw,
    width: r.width,
    height: r.height,
    author: r.user?.name,
    license: 'unsplash',
    source: 'unsplash',
    originalUrl: r.links?.html,
  };
}

/** Search Pexels */
async function tryPexels(query: string, timeoutMs: number): Promise<ProviderResult | null> {
  if (!PEXELS_KEY) return null;
  const qs = new URLSearchParams({ query, per_page: '1', orientation: 'landscape' });
  const url = `https://api.pexels.com/v1/search?${qs.toString()}`;
  const res = await fetchWithTimeout(url, { headers: { Authorization: PEXELS_KEY } }, timeoutMs);
  if (!res.ok) return null;
  const j = await res.json().catch(() => null);
  const r = j?.photos?.[0];
  if (!r) return null;
  return {
    url: r.src?.medium || r.src?.large,
    width: r.width,
    height: r.height,
    author: r.photographer,
    license: 'pexels',
    source: 'pexels',
    originalUrl: r.url,
  };
}

/** Search Wikimedia Commons - tries to find an image page */
async function tryWikimedia(query: string, timeoutMs: number): Promise<ProviderResult | null> {
  const qs = new URLSearchParams({
    action: 'query',
    format: 'json',
    prop: 'imageinfo|pageimages|info',
    generator: 'search',
    gsrlimit: '5',
    gsrsearch: query,
    iiprop: 'url|user|extmetadata',
    piprop: 'original',
  });
  const url = `https://commons.wikimedia.org/w/api.php?origin=*&${qs.toString()}`;
  const res = await fetchWithTimeout(url, {}, timeoutMs);
  if (!res.ok) return null;
  const j = await res.json().catch(() => null);
  const pages = j?.query?.pages;
  if (!pages) return null;
  // pick first page that has imageinfo
  for (const k of Object.keys(pages)) {
    const p = pages[k];
    const info = p?.imageinfo?.[0];
    if (info?.url) {
      const author = info?.user || info?.extmetadata?.Artist?.value;
      const license = info?.extmetadata?.LicenseShortName?.value || 'cc';
      return {
        url: info.url,
        width: info.width,
        height: info.height,
        author,
        license,
        source: 'wikimedia',
        originalUrl: p?.canonicalurl || info.descriptionurl || info.url,
      };
    }
  }
  return null;
}

/** Download binary and return buffer */
async function downloadToBuffer(url: string, timeoutMs: number): Promise<Buffer> {
  const res = await fetchWithTimeout(url, {}, timeoutMs);
  if (!res.ok) throw new Error(`download failed ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

/** Upload to Supabase storage - returns public URL + path */
async function uploadToSupabase(buffer: Buffer, keyPrefix: string, extension = '.jpg') {
  const filename = `${keyPrefix.replace(/[^a-z0-9\-]/gi, '_')}_${Date.now()}_${Math.random().toString(36).slice(2,8)}${extension}`;
  const path = `${filename}`;
  const { error } = await supabaseServer.storage.from(SUPABASE_BUCKET).upload(path, buffer, { upsert: true });
  if (error) {
    const e: any = new Error('UPLOAD_FAILED');
    e.code = 'UPLOAD_FAILED';
    e.details = error;
    throw e;
  }
  // Try get public url (public bucket recommended); fallback to signed url
  const { data: pub } = supabaseServer.storage.from(SUPABASE_BUCKET).getPublicUrl(path);
  if (pub?.publicUrl) {
    return { path, url: pub.publicUrl };
  }
  // fallback signed url (expires 24h)
  const signed = await supabaseServer.storage.from(SUPABASE_BUCKET).createSignedUrl(path, 60 * 60 * 24);
  if (signed?.data?.signedUrl) return { path, url: signed.data.signedUrl };
  throw new Error('UPLOAD_NO_URL');
}

/** High-level fetch+upload with provider priority, retries, timeout */
export async function fetchAndStoreImage(query: string, opts: FetchOpts = {}) {
  const operationId = opts.operationId || randomUUID();
  const timeoutMs = opts.timeoutMs ?? 3000;
  const diagnostics: any[] = [];

  // helper to try provider with retries
  async function tryProvider(provider: 'unsplash' | 'pexels' | 'wikimedia') {
    const attemptResults: any[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        let res: ProviderResult | null = null;
        if (provider === 'unsplash') res = await tryUnsplash(query, timeoutMs);
        if (provider === 'pexels') res = await tryPexels(query, timeoutMs);
        if (provider === 'wikimedia') res = await tryWikimedia(query, timeoutMs);

        attemptResults.push({ attempt, ok: !!res, res });
        if (res && (res.width === undefined || res.width >= 360)) {
          // download
          const buffer = await downloadToBuffer(res.url, timeoutMs);
          const ext = res.url.split('.').pop()?.split('?')[0] || 'jpg';
          const uploaded = await uploadToSupabase(buffer, `itinerary/${operationId}/${encodeURIComponent(query)}`, `.${ext}`);
          return {
            provider,
            author: res.author,
            license: res.license,
            originalUrl: res.originalUrl || res.url,
            width: res.width,
            height: res.height,
            url: uploaded.url,
            path: uploaded.path,
            attempts: attemptResults,
          };
        }
      } catch (err: any) {
        attemptResults.push({ attempt, error: String(err?.message || err) });
        // exponential backoff before retry
        const backoff = 200 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
    diagnostics.push({ provider, attempts: attemptResults });
    return null;
  }

  // Try providers in parallel but prefer by order. We'll start queries concurrently and resolve in order.
  // Simple approach: sequential by priority but each provider call internally has retries/timeouts.
  for (const p of PROVIDERS) {
    const got = await tryProvider(p);
    if (got) return got;
  }

  // If reached here, nothing worked
  const err: any = new Error('IMAGE_FETCH_FAILED');
  err.code = 'IMAGE_FETCH_FAILED';
  err.diag = diagnostics;
  throw err;
}
