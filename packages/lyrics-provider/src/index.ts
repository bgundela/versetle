import { z } from 'zod';
import type { Song } from '@versetle/shared';
const recordSchema = z.object({
  id: z.number().int().positive(),
  trackName: z.string(),
  artistName: z.string(),
  albumName: z.string().nullable().optional(),
  duration: z.number().nullable().optional(),
  instrumental: z.boolean(),
  plainLyrics: z.string().nullable(),
  syncedLyrics: z.string().nullable(),
});
type RecordData = z.infer<typeof recordSchema>;
export class ProviderError extends Error {
  constructor(
    message: string,
    public status = 502,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
export interface LyricsProvider {
  search(query: string, artist?: string): Promise<Song[]>;
  get(id: number): Promise<{ song: Song; lyrics: string }>;
}
const song = (r: RecordData): Song => ({
  id: r.id,
  title: r.trackName,
  artist: r.artistName,
  album: r.albumName ?? '',
  duration: r.duration ?? 0,
});
const cache = new Map<string, { expires: number; value: unknown }>();
let queue = Promise.resolve();
let blockedUntil = 0;
function retrySeconds(header: string | null) {
  if (!header) return 30;
  const seconds = Number(header);
  return Number.isFinite(seconds)
    ? Math.max(1, seconds)
    : Math.max(1, Math.ceil((Date.parse(header) - Date.now()) / 1000) || 30);
}
async function request(path: string): Promise<unknown> {
  const hit = cache.get(path);
  if (hit && hit.expires > Date.now()) return hit.value;
  const task = queue.then(async () => {
    const cached = cache.get(path);
    if (cached && cached.expires > Date.now()) return cached.value;
    if (Date.now() < blockedUntil)
      throw new ProviderError(
        'LRCLIB is busy. Please try again shortly.',
        429,
        Math.ceil((blockedUntil - Date.now()) / 1000),
      );
    try {
      const response = await fetch(`https://lrclib.net/api${path}`, {
        headers: {
          'User-Agent': 'Versetle/0.1 (https://github.com/bgundela/versetle)',
        },
        signal: AbortSignal.timeout(12000),
        cache: 'no-store',
      });
      if (response.status === 429 || response.status === 503) {
        const seconds = retrySeconds(response.headers.get('retry-after'));
        blockedUntil = Date.now() + seconds * 1000;
        throw new ProviderError(
          'LRCLIB is busy. Please try again shortly.',
          response.status,
          seconds,
        );
      }
      if (response.status === 404)
        throw new ProviderError(
          'Lyrics for this recording are unavailable. Choose another version.',
          404,
        );
      if (!response.ok)
        throw new ProviderError(
          'LRCLIB is temporarily unavailable. Please try again.',
        );
      const value: unknown = await response.json();
      // Short-lived, bounded process cache; never written to disk or committed.
      if (cache.size >= 40) cache.delete(cache.keys().next().value!);
      cache.set(path, { expires: Date.now() + 5 * 60_000, value });
      return value;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(
        'Could not reach LRCLIB. Check your connection and try again.',
      );
    } finally {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  });
  queue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}
export const lrclib: LyricsProvider = {
  async search(query, artist) {
    const params = artist
      ? new URLSearchParams({ track_name: query, artist_name: artist })
      : new URLSearchParams({ q: query });
    const result = z
      .array(recordSchema)
      .safeParse(await request(`/search?${params}`));
    if (!result.success)
      throw new ProviderError(
        'LRCLIB returned an unexpected response. Please try again.',
      );
    const seen = new Set<string>();
    return result.data
      .filter((r) => {
        const key = `${r.trackName.toLowerCase()}|${r.artistName.toLowerCase()}|${r.albumName?.toLowerCase()}`;
        if (
          r.instrumental ||
          !(r.plainLyrics?.trim() || r.syncedLyrics?.trim()) ||
          seen.has(key)
        )
          return false;
        seen.add(key);
        return true;
      })
      .slice(0, 20)
      .map(song);
  },
  async get(id) {
    const result = recordSchema.safeParse(await request(`/get/${id}`));
    if (!result.success)
      throw new ProviderError(
        'LRCLIB returned an unexpected recording. Please try another.',
      );
    const record = result.data,
      lyrics = record.plainLyrics?.trim() || record.syncedLyrics?.trim();
    if (record.instrumental || !lyrics)
      throw new ProviderError(
        'This recording has no usable lyrics. Choose another version.',
        422,
      );
    return { song: song(record), lyrics };
  },
};
