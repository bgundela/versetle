import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { artists, seeds, settingsSchema, type Song } from '@versetle/shared';
import { lrclib, ProviderError } from '@versetle/lyrics-provider';
import {
  cleanLyrics,
  createPuzzle,
  normalize,
  selectSnippet,
} from '@versetle/game-core';
import { apiError } from '../../../lib/api';
const bodySchema = z.object({
  settings: settingsSchema,
  id: z.number().int().positive().optional(),
  artist: z.enum(artists).optional(),
  exclude: z.array(z.string().max(200)).max(25).default([]),
  seed: z.string().min(1).max(100),
});
function key(s: Song) {
  return `${normalize(s.artist)}|${normalize(s.title)}`;
}
export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Expected a JSON request.' },
        { status: 400 },
      );
    }
    const { settings, id, artist, exclude, seed } = bodySchema.parse(body);
    const prepare = async (songId: number) => {
      const { song, lyrics } = await lrclib.get(songId);
      const snippet = selectSnippet(cleanLyrics(lyrics), seed);
      return createPuzzle(song, snippet, settings, seed);
    };
    if (id)
      return NextResponse.json(
        { puzzle: await prepare(id) },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    const pool = seeds.filter(
      ([a, t]) =>
        (!artist || a === artist) &&
        !exclude.includes(`${normalize(a)}|${normalize(t)}`),
    );
    // Shuffle once: no duplicate title/artist within a game, regardless of recording ID.
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    for (const [a, t] of pool.slice(0, 5)) {
      const candidates = await lrclib.search(t, a);
      const exact = candidates.filter(
        (s) =>
          normalize(s.artist) === normalize(a) &&
          normalize(s.title) === normalize(t) &&
          !exclude.includes(key(s)),
      );
      for (const candidate of exact.slice(0, 2)) {
        try {
          return NextResponse.json(
            { puzzle: await prepare(candidate.id) },
            { headers: { 'Cache-Control': 'no-store' } },
          );
        } catch (error) {
          if (
            error instanceof ProviderError &&
            error.status !== 404 &&
            error.status !== 422
          )
            throw error;
        }
      }
    }
    throw new ProviderError(
      'No playable songs found in this selection. Try all artists or search for a song.',
      422,
    );
  } catch (error) {
    return apiError(error);
  }
}
