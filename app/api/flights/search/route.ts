// src/app/api/flights/search/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    ok: true,
    source: 'test',
    message: 'Flights API is working!',
  });
}

