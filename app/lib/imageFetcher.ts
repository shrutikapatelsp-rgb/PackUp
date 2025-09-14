import supabaseServer from './supabaseServer';
import { randomUUID } from 'crypto';

const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY;
const PEXELS_KEY = process.env.PEXELS_API_KEY;
const BING_KEY = process.env.BING_API_KEY;
const BING_ENDPOINT = process.env.BING_ENDPOINT; // e.g. https://api.bing.microsoft.com
const GOOGLE_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_CX = process.env.GOOGLE_CX;

const SUPABASE_BUCKET = process.env.SUPABASE_IMAGE_BUCKET || 'packup-images';

type ProviderResult = {
  url: string;
  width?: number;
  height?: number;
  author?: string | null;
  license?: string | null;
  source: 'unsplash' | 'pexels' | 'bing' | 'google' | 'wikimedia';
  originalUrl?: string;
};

type FetchOpts = { timeoutMs?: number; operationId?: string };

const PROVIDERS: Array<'unsplash' | 'pexels' | 'bing' | 'google' | 'wikimedia'> = [
  'unsplash',
  'pexels',
  'bing',
  'google',
  'wikimedia',
];

/** fetch with timeout wrapper */
async function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** Unsplash search */
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

/** Pexels search */
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
    url: r.src?.large || r.src?.medium || r.src?.original,
    width: r.width,
    height: r.height,
    author: r.photographer,
    license: 'pexels',
    source: 'pexels',
    originalUrl: r.url,
  };
}

/** Bing Image Search via Azure Cognitive Services */
async function tryBing(query: string, timeoutMs: number): Promise<ProviderResult | null> {
  // needs BING_KEY and BING_ENDPOINT
  if (!BING_KEY || !BING_ENDPOINT) return null;
  // Construct request
  const qs = new URLSearchParams({ q: query, count: '1', safeSearch: 'Moderate' });
  const url = `${BING_ENDPOINT.replace(/\/$/, '')}/bing/v7.0/images/search?${qs.toString()}`;
  const res = await fetchWithTimeout(url, { headers: { 'Ocp-Apim-Subscription-Key': BING_KEY } }, timeoutMs);
  if (!res.ok) return null;
  const j = await res.json().catch(() => null);
  const r = j?.value?.[0];
  if (!r) return null;
  return {
    url: r.contentUrl || r.thumbnailUrl || r.hostPageUrl,
    width: r.image?.width,
    height: r.image?.height,
    author: r.creator || r.hostPageDisplayUrl || null,
    license: r.encodingFormat || 'unknown',
    source: 'bing',
    originalUrl: r.hostPageUrl || r.contentUrl,
  };
}

/** Google Custom Search Image */
async function tryGoogle(query: string, timeoutMs: number): Promise<ProviderResult | null> {
  if (!GOOGLE_KEY || !GOOGLE_CX) return null;
  const qs = new URLSearchParams({
    q: query,
    cx: GOOGLE_CX,
    key: GOOGLE_KEY,
    searchType: 'image',
    num: '1',
  });
  const url = `https://www.googleapis.com/customsearch/v1?${qs.toString()}`;
  const res = await fetchWithTimeout(url, {}, timeoutMs);
  if (!res.ok) return null;
  const j = await res.json().catch(() => null);
  const item = j?.items?.[0];
  if (!item) return null;
  // item has link (image URL), image.width/image.height, and image/thumbnail
  const image = item.image || {};
  return {
    url: item.link,
    width: image.width,
    height: image.height,
    author: item.displayLink || item.mime || null,
    license: item.mime || 'unknown',
    source: 'google',
    originalUrl: item.link,
  };
}

/** Wikimedia Commons */
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
  for (const k of Object.keys(pages)) {
    const p = pages[k];
    const info = p?.imageinfo?.[0];
    if (info?.url) {
      const author = info?.user || info?.extmetadata?.Artist?.value || null;
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

/** Download and buffer */
async function downloadToBuffer(url: string, timeoutMs = 3000): Promise<Buffer> {
  const res = await fetchWithTimeout(url, {}, timeoutMs);
  if (!res.ok) throw new Error(`download failed ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

/** Upload to Supabase storage */
async function uploadToSupabase(buffer: Buffer, keyPrefix: string, extension = '.jpg') {
  const safePrefix = keyPrefix.replace(/[^a-z0-9\-_.]/gi, '_').slice(0, 200);
  const filename = `${safePrefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}${extension}`;
  const path = `${filename}`;
  const { error } = await supabaseServer.storage.from(SUPABASE_BUCKET).upload(path, buffer, { upsert: true });
  if (error) {
    const e: any = new Error('UPLOAD_FAILED');
    e.code = 'UPLOAD_FAILED';
    e.details = error;
    throw e;
  }
  const { data: pub } = supabaseServer.storage.from(SUPABASE_BUCKET).getPublicUrl(path);
  if (pub?.publicUrl) return { path, url: pub.publicUrl };
  const signed = await supabaseServer.storage.from(SUPABASE_BUCKET).createSignedUrl(path, 60 * 60 * 24);
  if (signed?.data?.signedUrl) return { path, url: signed.data.signedUrl };
  throw new Error('UPLOAD_NO_URL');
}

/** Main exported function */
export async function fetchAndStoreImage(query: string, opts: FetchOpts = {}) {
  const operationId = opts.operationId || randomUUID();
  const timeoutMs = opts.timeoutMs ?? 3000;
  const diagnostics: any[] = [];

  async function tryProvider(provider: typeof PROVIDERS[number]) {
    const attempts: any[] = [];
    // up to 3 attempts with small backoff
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        let res: ProviderResult | null = null;
        if (provider === 'unsplash') res = await tryUnsplash(query, timeoutMs);
        else if (provider === 'pexels') res = await tryPexels(query, timeoutMs);
        else if (provider === 'bing') res = await tryBing(query, timeoutMs);
        else if (provider === 'google') res = await tryGoogle(query, timeoutMs);
        else if (provider === 'wikimedia') res = await tryWikimedia(query, timeoutMs);

        attempts.push({ attempt, ok: !!res });
        if (res && (res.width === undefined || res.width >= 360)) {
          // download and upload
          const buffer = await downloadToBuffer(res.url, timeoutMs);
          const ext = (res.url.split('.').pop() || 'jpg').split('?')[0].slice(0,6);
          const uploaded = await uploadToSupabase(buffer, `itinerary/${operationId}/${encodeURIComponent(query)}`, `.${ext}`);
          return {
            provider,
            author: res.author,
            license: res.license,
            originalUrl: res.originalUrl || res.url,
            url: uploaded.url,
            path: uploaded.path,
            width: res.width,
            height: res.height,
            attempts,
          };
        }
      } catch (err: any) {
        attempts.push({ attempt, error: String(err?.message || err) });
        // backoff
        const backoff = 200 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
    diagnostics.push({ provider, attempts });
    return null;
  }

  // Try providers sequentially according to priority
  for (const p of PROVIDERS) {
    const got = await tryProvider(p);
    if (got) return got;
  }

  const err: any = new Error('IMAGE_FETCH_FAILED');
  err.code = 'IMAGE_FETCH_FAILED';
  err.diag = diagnostics;
  throw err;
}

export default fetchAndStoreImage;
TS
