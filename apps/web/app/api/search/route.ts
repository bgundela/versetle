import { NextRequest, NextResponse } from 'next/server';
import { lrclib } from '@versetle/lyrics-provider';
import { apiError } from '../../../lib/api';
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2 || q.length > 120)
    return NextResponse.json(
      { error: 'Search with 2–120 characters.' },
      { status: 400 },
    );
  try {
    return NextResponse.json(
      { songs: await lrclib.search(q) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
