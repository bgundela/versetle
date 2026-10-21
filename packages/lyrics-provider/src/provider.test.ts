import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const record = {
  id: 10,
  trackName: 'Test title',
  artistName: 'Test author',
  albumName: 'Test album',
  duration: 180,
  instrumental: false,
  plainLyrics: 'Original testing words',
  syncedLyrics: null,
};
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());
it('filters instrumental records and duplicates and exposes only metadata', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify([
          record,
          record,
          { ...record, id: 11, instrumental: true },
        ]),
      ),
    );
  vi.stubGlobal('fetch', fetcher);
  const { lrclib } = await import('./index');
  const results = await lrclib.search('Test title');
  expect(results).toHaveLength(1);
  expect(results[0]).not.toHaveProperty('plainLyrics');
  expect(fetcher.mock.calls[0][1].headers['User-Agent']).toContain('Versetle');
  await lrclib.search('Test title');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('falls back to synchronized lyrics when plain text is empty', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...record,
          plainLyrics: '',
          syncedLyrics: '[00:01.00]Test words',
        }),
      ),
    ),
  );
  const { lrclib } = await import('./index');
  expect((await lrclib.get(10)).lyrics).toBe('[00:01.00]Test words');
});
it('honors non-JSON rate limit responses and blocks premature retries', async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response('Slow down', {
      status: 429,
      headers: { 'Retry-After': '60' },
    }),
  );
  vi.stubGlobal('fetch', fetcher);
  const { lrclib } = await import('./index');
  await expect(lrclib.search('test')).rejects.toMatchObject({
    status: 429,
    retryAfter: 60,
  });
  await expect(lrclib.search('another')).rejects.toMatchObject({ status: 429 });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('turns missing records into a usable error', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('Missing', { status: 404 })),
  );
  const { lrclib } = await import('./index');
  await expect(lrclib.get(99)).rejects.toMatchObject({ status: 404 });
});
it('rejects malformed provider data', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ unexpected: true }))),
  );
  const { lrclib } = await import('./index');
  await expect(lrclib.search('test')).rejects.toThrow('unexpected response');
});

it('uses structured title/artist search for curated tracks', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify([record])));
  vi.stubGlobal('fetch', fetcher);
  const { lrclib } = await import('./index');
  await lrclib.search('Test title', 'Test author');
  const url = new URL(fetcher.mock.calls[0][0]);
  expect(url.searchParams.get('track_name')).toBe('Test title');
  expect(url.searchParams.get('artist_name')).toBe('Test author');
  expect(url.searchParams.has('q')).toBe(false);
});
