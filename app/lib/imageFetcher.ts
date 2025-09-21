import { supabaseService } from './supabaseServer';
import { v4 as uuidv4 } from 'uuid';

const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY;
const PEXELS_KEY = process.env.PEXELS_API_KEY;
const BING_KEY = process.env.BING_API_KEY;
const BING_ENDPOINT = process.env.BING_ENDPOINT;
const GOOGLE_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_CX = process.env.GOOGLE_CX;

const BUCKET = process.env.SUPABASE_IMAGE_BUCKET ?? 'packup-images';

// helper for timeout
function timeoutPromise<T>(ms: number, p: Promise<T>) {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]);
}

// small helper to fetch binary and return buffer & content-type
async function fetchBuffer(url: string, maxMs = 7000) {
  const res = await timeoutPromise(maxMs, fetch(url));
  if (!res.ok) throw new Error(`fetch failed ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
  return { buffer: Buffer.from(arrayBuffer), contentType };
}

type ImageResult = {
  ok: true;
  storagePath: string;
  publicUrl: string;
  provider: string;
  originalUrl: string;
  author?: string;
  license?: string;
  width?: number;
  height?: number;
};

type ImageFetchError = {
  ok: false;
  code: 'IMAGE_FETCH_FAILED' | 'NO_PROVIDERS' | 'UPLOAD_FAILED';
  reason?: string;
};

export async function fetchImageAndUpload(query: string, operationId?: string): Promise<ImageResult | ImageFetchError> {
  const attemptProviders = [];

  if (UNSPLASH_KEY) attemptProviders.push('unsplash');
  if (PEXELS_KEY) attemptProviders.push('pexels');
  if (BING_KEY && BING_ENDPOINT) attemptProviders.push('bing');
  if (GOOGLE_KEY && GOOGLE_CX) attemptProviders.push('google');
  attemptProviders.push('wikimedia');
  // If nothing configured, still try Wikimedia as it is open

  if (attemptProviders.length === 0) {
    return { ok: false, code: 'NO_PROVIDERS', reason: 'No image provider keys configured' };
  }

  // try each provider with timeouts and up to 2 retries
  for (const p of attemptProviders) {
    try {
      let imageUrl: string | undefined;
      let meta: any = {};
      if (p === 'unsplash') {
        // simple search endpoint
        const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1`;
        const res = await timeoutPromise(3000, fetch(url, { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` } }));
        if (res.ok) {
          const json = await res.json();
          const first = json.results?.[0];
          if (first?.urls?.raw) {
            imageUrl = first.urls.raw + '&w=1200&q=80&fm=jpg';
            meta.author = first.user?.name;
            meta.originalUrl = first.links?.html;
            meta.license = 'Unsplash License';
            meta.width = first.width;
            meta.height = first.height;
          }
        }
      } else if (p === 'pexels') {
        const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1`;
        const res = await timeoutPromise(3000, fetch(url, { headers: { Authorization: PEXELS_KEY! } }));
        if (res.ok) {
          const json = await res.json();
          const first = json.photos?.[0];
          if (first?.src?.original) {
            imageUrl = first.src.original;
            meta.author = first.photographer;
            meta.originalUrl = first.url;
            meta.license = 'Pexels License';
            meta.width = first.width;
            meta.height = first.height;
          }
        }
      } else if (p === 'bing') {
        // Bing Image Search (v7) requires endpoint e.g. https://api.bing.microsoft.com/v7.0/images/search
        const url = `${BING_ENDPOINT}?q=${encodeURIComponent(query)}&count=1`;
        const res = await timeoutPromise(3000, fetch(url, { headers: { 'Ocp-Apim-Subscription-Key': BING_KEY! } }));
        if (res.ok) {
          const json = await res.json();
          const first = json.value?.[0];
          if (first?.contentUrl) {
            imageUrl = first.contentUrl;
            meta.author = first.hostPageDisplayUrl;
            meta.originalUrl = first.hostPageUrl;
            meta.license = 'Bing Image Search';
            meta.width = first.width;
            meta.height = first.height;
          }
        }
      } else if (p === 'google') {
        const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_KEY}&cx=${GOOGLE_CX}&searchType=image&q=${encodeURIComponent(query)}&num=1`;
        const res = await timeoutPromise(3000, fetch(url));
        if (res.ok) {
          const json = await res.json();
          const first = json.items?.[0];
          if (first?.link) {
            imageUrl = first.link;
            meta.author = first.image?.contextLink;
            meta.originalUrl = first.link;
            meta.license = 'Google CSE';
            meta.width = first.image?.width;
            meta.height = first.image?.height;
          }
        }
      } else if (p === 'wikimedia') {
        // quick wikimedia search
        const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=imageinfo&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=1&iiprop=url|width|height|extmetadata`;
        const res = await timeoutPromise(3000, fetch(url));
        if (res.ok) {
          const json = await res.json();
          const pages = json?.query?.pages;
          const firstKey = pages && Object.keys(pages)[0];
          const ii = firstKey ? pages[firstKey].imageinfo?.[0] : undefined;
          if (ii?.thumburl || ii?.url) {
            imageUrl = ii.thumburl || ii.url;
            meta.author = ii?.user;
            meta.originalUrl = ii?.descriptionurl;
            meta.license = ii?.extmetadata?.LicenseShortName?.value || 'Wikimedia';
            meta.width = ii?.width;
            meta.height = ii?.height;
          }
        }
      }

      if (!imageUrl) {
        // provider didn't return result; try next
        continue;
      }

      // Download the image
      const { buffer, contentType } = await fetchBuffer(imageUrl, 7000);

      const filename = `itinerary/${operationId ?? 'op'}/${encodeURIComponent(query).slice(0, 120)}-${Date.now()}.jpg`;
      // upload to supabase storage using service role
      const uploadRes = await supabaseService.storage.from(BUCKET).upload(filename, buffer, {
        contentType,
        upsert: false,
      });

      if (uploadRes.error) {
        // If upload error, try to continue to next provider
        continue;
      }

      // build public URL
      const publicUrlData = supabaseService.storage.from(BUCKET).getPublicUrl(filename);
      const publicUrl = publicUrlData?.data?.publicUrl ?? '';

      return {
        ok: true,
        storagePath: filename,
        publicUrl,
        provider: p,
        originalUrl: meta.originalUrl ?? imageUrl,
        author: meta.author,
        license: meta.license,
        width: meta.width,
        height: meta.height,
      } as const;

    } catch (err: any) {
      // on error, try next provider
      continue;
    }
  } // end for providers

  return { ok: false, code: 'IMAGE_FETCH_FAILED', reason: 'All providers failed or timeouts exceeded' };
}

