import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export const runtime = 'nodejs';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.AWS_S3_BUCKET_LOGS!;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json(); // { type, message, ip?, user_id?, ctx? }
    const key = `app/${new Date().toISOString().slice(0,10)}/${Date.now()}-${Math.random()
      .toString(36).slice(2)}.json`;

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: Buffer.from(JSON.stringify({ ...body, ts: new Date().toISOString() })),
      ContentType: 'application/json'
    }));

    return NextResponse.json({ ok: true, source: 'live', key });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, source: 'live', error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
