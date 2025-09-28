type ProviderImage = {
  url: string; width?: number; height?: number;
  author?: string; license?: string; originalUrl?: string;
};

async function googleSearch(query: string): Promise<ProviderImage | null> {
  const key = process.env.GOOGLE_API_KEY;
  const cx = process.env.GOOGLE_CX;
  if (!key || !cx) return null;
  const u = new URL('https://www.googleapis.com/customsearch/v1');
  u.searchParams.set('alt', 'json');
  u.searchParams.set('searchType', 'image');
  u.searchParams.set('num', '1');
  u.searchParams.set('q', query);
  u.searchParams.set('key', key);
  u.searchParams.set('cx', cx);
  const res = await fetch(u.toString(), { method: 'GET', cache: 'no-store' });
  if (!res.ok) return null;
  const json = await res.json();
  const item = json?.items?.[0];
  if (!item?.link) return null;
  return {
    url: item.link,
    width: item?.image?.width,
    height: item?.image?.height,
    author: new URL(item?.image?.contextLink || item.link).hostname,
    license: 'GoogleCSE',
    originalUrl: item.link,
  };
}

async function downloadToBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  return await res.arrayBuffer();
}

async function uploadToSupabase(buf: ArrayBuffer, ext = 'jpg', pathPrefix = 'itinerary'): Promise<string> {
  const { createClient } = await import('@supabase/supabase-js');
  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE!;
  const BUCKET = process.env.SUPABASE_IMAGE_BUCKET || 'packup-images';
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const filePath = `${pathPrefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(filePath, buf, {
    contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
    upsert: false,
  });
  if (error) throw new Error(`upload failed: ${error.message}`);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}

export async function fetchOneImage(query: string, _opts?: { prefer?: string[] }) {
  // Try Google; you can add Unsplash/Pexels/Bing here similarly
  const found = await googleSearch(query);
  if (!found) return null;
  const buf = await downloadToBuffer(found.url);
  // crude extension guess
  const ext = found.url.includes('.png') ? 'png' : 'jpg';
  const publicUrl = await uploadToSupabase(buf, ext, 'itinerary');
  return {
    publicUrl,
    author: found.author,
    license: found.license,
    originalUrl: found.originalUrl,
    width: found.width,
    height: found.height,
  };
}

export async function fetchImagesForItinerary(itin: any, opts: { bucket?: string; operationId: string }) {
  const out = { ...itin, days: [...itin.days] };
  for (let i = 0; i < out.days.length; i++) {
    const day = out.days[i];
    const imgs = (day.images || []).slice(0, 2); // fetch up to 2 per day
    const fetched: any[] = [];
    for (const img of imgs) {
      const got = await fetchOneImage(img.query);
      if (got) fetched.push(got);
    }
    // If no images resolved for a day, we can decide to treat it as failure:
    if (imgs.length > 0 && fetched.length === 0) {
      const e: any = new Error('IMAGE_FETCH_FAILED');
      e.code = 'IMAGE_FETCH_FAILED';
      throw e;
    }
    day._fetchedImages = fetched;
  }
  return out;
}
