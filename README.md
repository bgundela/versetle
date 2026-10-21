# Versetle

A timed solo lyric puzzle built with Next.js, React and TypeScript. Fill missing words or whole lines, lock in early for a speed bonus, and play through a full session.

## Run locally

Requires Node.js 22+ and Corepack (bundled with many Node installations). No API keys or accounts are needed.

```sh
corepack pnpm install
corepack pnpm dev
```

Open http://127.0.0.1:3000. If pnpm is already installed, `pnpm dev` works too. To install Corepack on a machine without it, follow https://pnpm.io/installation.

```sh
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm exec playwright install chromium
corepack pnpm test:e2e
```

`corepack pnpm start` serves a production build. GitHub Actions runs type checking, unit tests, production build, and desktop/mobile browser tests.

## This milestone

- Random games with 36 curated song choices across Taylor Swift, Ariana Grande, Katy Perry, Drake, The Weeknd and Bruno Mars; optionally focus on one artist.
- Search LRCLIB for a specific recording, then play a single-song round. Search can find artists beyond the starter pool.
- Word, whole-line and mixed blanks; 20–80% target visibility, 60–180 seconds, 1–5 rounds and a missing-word cap.
- 14-line excerpts (12–13 lines for shorter records), deterministic masking, conservative typo tolerance, contraction/numeral normalization and word-weighted line partial credit.
- Base score up to 100 plus a speed bonus up to 50. Empty or wrong answers earn no points. The timer continues across refreshes.
- Answer reveals, session recovery and a device-local history of the latest 20 completed games. Browser storage being unavailable does not prevent play.
- Responsive layout, keyboard controls, labeled inputs, reduced-motion support and distinct reveal icons.

## Structure

```text
apps/web/                  Next.js UI and server endpoints
packages/game-core/        Pure masking, matching and scoring
packages/shared/           Settings schemas, contracts and starter metadata
packages/lyrics-provider/  LRCLIB adapter and provider interface
tests/                    Desktop and mobile Playwright flows
```

`GET /api/search?q=...` returns metadata only. `POST /api/puzzle` resolves one recording, cleans lyrics, selects a snippet, and creates a puzzle. LRCLIB requests identify Versetle, run sequentially with a 250 ms interval, have a 12-second timeout, honor `Retry-After`, and use a bounded five-minute in-memory response cache. Missing and unsuitable recordings are skipped during random selection. A round loads before its clock starts; a failed next-round request preserves the reveal and scores for retry.

The repository contains song titles/artists, code, and original test text; no downloaded lyrics. LRCLIB IDs are resolved at runtime to allow unavailable recordings to be replaced. Only the current puzzle excerpt is saved in browser session recovery; the score history contains no lyrics. No full-lyrics endpoint is exposed. LRCLIB access does not grant rights to lyrics; snippets remain subject to rightsholder permissions.

## Scope and limits

This is the agreed local, unranked prototype. Answers and scoring are in the browser, so scores are client-trusted and are not suitable for competitive use. Local history is device/browser specific; there is no cloud sync. A browser refresh recovers the last saved answers; the clock keeps running, including while the tab is closed.

The starter pool uses English-language selections. LRCLIB does not supply reliable popularity, genre, language or explicit-content metadata. There is no guaranteed language/explicit filter for free-text search. Actual popularity enforcement, genre discovery, persistent catalog ingestion, accounts, Supabase, server-authoritative rooms, party play and ranked are deferred. Whole-line visibility is an approximate target constrained by the missing-word budget and readable spacing; the displayed actual visibility is word-based.

The shared packages are ready for the later Fastify/Socket.IO server. This milestone deliberately uses Next.js endpoints, so local development needs only one process. Tailwind, Zustand, TanStack Query and Turborepo are unnecessary for this small first slice: styles use CSS and client state uses React hooks.

## Verification

Unit tests cover seeded masks across styles/seeds, word caps, normalization, fuzzy matching, line alignment, deadlines, scoring, LRCLIB errors, caching and rate limits. Playwright uses original synthetic text to check five-round play, refresh recovery, reveal/results, local history, song search, retry behavior, expired sessions and API input validation on desktop and mobile. Live LRCLIB smoke checks are separate from deterministic CI tests.

Lyrics provider docs: https://lrclib.net/docs.
