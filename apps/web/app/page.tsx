'use client';
import { useEffect, useRef, useState } from 'react';
import {
  artists,
  defaults,
  settingsSchema,
  type Puzzle,
  type RoundResult,
  type Settings,
  type Song,
} from '@versetle/shared';
import { normalize, scoreRound } from '@versetle/game-core';
type Selection = {
  mode: 'random' | 'search';
  artist: string;
  song: Song | null;
};
type Played = { song: Song; result: RoundResult };
type Session = {
  version: 1;
  phase: 'round' | 'reveal' | 'results';
  puzzle: Puzzle;
  answers: Record<number, string>;
  endsAt: number;
  settings: Settings;
  selection: Selection;
  played: Played[];
  excluded: string[];
};
type History = {
  date: string;
  score: number;
  accuracy: number;
  rounds: number;
};
const initialSelection: Selection = { mode: 'random', artist: '', song: null };
const storageKey = 'versetle.session.v1';
const clock = (seconds: number) =>
  `${Math.floor(Math.max(0, Math.ceil(seconds)) / 60)}:${String(Math.max(0, Math.ceil(seconds)) % 60).padStart(2, '0')}`;
const songKey = (song: Song) =>
  `${normalize(song.artist)}|${normalize(song.title)}`;
function readHistory(): History[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem('versetle.history.v1') ?? '[]',
    );
    return Array.isArray(parsed)
      ? parsed
          .filter(
            (x): x is History =>
              x &&
              typeof x.score === 'number' &&
              typeof x.accuracy === 'number' &&
              typeof x.date === 'string' &&
              typeof x.rounds === 'number',
          )
          .slice(0, 20)
      : [];
  } catch {
    return [];
  }
}
async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? 'Something went wrong. Please try again.');
  return data as T;
}
function Mark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      v<span>·</span>
    </span>
  );
}
function Equalizer() {
  return (
    <span className="equalizer" aria-hidden="true">
      {[9, 17, 25, 13, 21].map((n, i) => (
        <i key={i} style={{ height: n }} />
      ))}
    </span>
  );
}
export default function Home() {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [selection, setSelection] = useState<Selection>(initialSelection);
  const [session, setSession] = useState<Session | null>(null);
  const [history, setHistory] = useState<History[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [songs, setSongs] = useState<Song[]>([]);
  const [searched, setSearched] = useState(false);
  const [now, setNow] = useState(0);
  const requestId = useRef(0);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem(storageKey) ?? 'null',
      ) as Session | null;
      if (
        stored?.version === 1 &&
        ['round', 'reveal', 'results'].includes(stored.phase) &&
        Array.isArray(stored.puzzle?.blanks) &&
        stored.puzzle.blanks.length &&
        Array.isArray(stored.puzzle?.lines) &&
        Array.isArray(stored.played) &&
        Number.isFinite(stored.endsAt) &&
        stored.settings?.rounds &&
        stored.selection &&
        Array.isArray(stored.excluded)
      )
        setSession(stored);
      const preferences = JSON.parse(
        localStorage.getItem('versetle.settings.v1') ?? 'null',
      );
      const parsedSettings = settingsSchema.safeParse(preferences);
      if (parsedSettings.success) setSettings(parsedSettings.data);
    } catch {
      // Invalid or unavailable browser storage must not block starting a game.
    }
    setHistory(readHistory());
    setNow(Date.now());
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      if (session) localStorage.setItem(storageKey, JSON.stringify(session));
      else localStorage.removeItem(storageKey);
    } catch {
      /* Private browsing and full storage must not block play. */
    }
  }, [session, ready]);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem('versetle.settings.v1', JSON.stringify(settings));
    } catch {}
  }, [settings, ready]);
  useEffect(() => {
    if (session?.phase !== 'round') return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [session?.phase, session?.endsAt]);
  useEffect(() => {
    if (session?.phase === 'round' && now >= session.endsAt) {
      setSession((current) =>
        current?.phase === 'round'
          ? finish(current, current.settings.seconds)
          : current,
      );
    }
  }, [now, session]);
  useEffect(() => {
    if (selection.mode !== 'search' || query.trim().length < 2) {
      setSongs([]);
      setSearching(false);
      setSearched(false);
      setSearchError('');
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    setSearchError('');
    setSearched(false);
    const timer = setTimeout(async () => {
      try {
        const data = await jsonRequest<{ songs: Song[] }>(
          `/api/search?q=${encodeURIComponent(query.trim())}`,
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) {
          setSongs(data.songs);
          setSearched(true);
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setSearchError(
            e instanceof Error ? e.message : 'Search unavailable.',
          );
          setSongs([]);
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, selection.mode]);
  useEffect(() => {
    if (session?.phase === 'round')
      panel.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, [session?.puzzle.seed, session?.phase]);
  function finish(current: Session, elapsed: number): Session {
    const result = scoreRound(
      current.puzzle,
      current.answers,
      elapsed,
      current.settings.seconds,
    );
    return {
      ...current,
      phase: 'reveal',
      played: [...current.played, { song: current.puzzle.song, result }],
    };
  }
  function lock() {
    setSession((current) =>
      current?.phase === 'round'
        ? finish(
            current,
            (Date.now() - (current.endsAt - current.settings.seconds * 1000)) /
              1000,
          )
        : current,
    );
  }
  async function prepare(previous?: Session) {
    if (loading) return;
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    const chosen = previous?.selection ?? selection;
    const config = previous?.settings ?? {
      ...settings,
      rounds: chosen.mode === 'search' ? 1 : settings.rounds,
    };
    try {
      const { puzzle } = await jsonRequest<{ puzzle: Puzzle }>('/api/puzzle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: config,
          seed: crypto.randomUUID(),
          exclude: previous?.excluded ?? [],
          ...(chosen.mode === 'search'
            ? { id: chosen.song?.id }
            : chosen.artist
              ? { artist: chosen.artist }
              : {}),
        }),
      });
      if (id !== requestId.current) return;
      setNow(Date.now());
      setSession({
        version: 1,
        phase: 'round',
        puzzle,
        answers: {},
        endsAt: Date.now() + config.seconds * 1000,
        settings: config,
        selection: chosen,
        played: previous?.played ?? [],
        excluded: [...(previous?.excluded ?? []), songKey(puzzle.song)],
      });
    } catch (e) {
      if (id === requestId.current)
        setError(
          e instanceof Error
            ? e.message
            : 'Could not start this round. Try again.',
        );
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }
  function endGame() {
    if (!session) return;
    const sum = session.played.reduce((n, r) => n + r.result.score, 0),
      total = session.played.reduce((n, r) => n + r.result.total, 0),
      earned = session.played.reduce((n, r) => n + r.result.earned, 0);
    const entry = {
      date: new Date().toISOString(),
      score: sum,
      accuracy: total ? earned / total : 0,
      rounds: session.played.length,
    };
    const updated = [entry, ...readHistory()].slice(0, 20);
    setHistory(updated);
    try {
      localStorage.setItem('versetle.history.v1', JSON.stringify(updated));
    } catch {}
    setSession({ ...session, phase: 'results' });
  }
  function reset() {
    requestId.current++;
    setLoading(false);
    setSession(null);
    setError('');
  }
  const remaining = session ? Math.max(0, (session.endsAt - now) / 1000) : 0;
  const filled = session
    ? session.puzzle.blanks.filter((b) => session.answers[b.id]?.trim()).length
    : 0;
  const currentResult =
    session?.phase === 'reveal' ? session.played.at(-1)?.result : undefined;
  const totalScore =
    session?.played.reduce((n, p) => n + p.result.score, 0) ?? 0;
  return (
    <div className="site-shell">
      <header className="site-header">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            if (session) {
              e.preventDefault();
              if (
                session.phase !== 'round' ||
                window.confirm(
                  'Leave this game? Your current round will be lost.',
                )
              )
                reset();
            }
          }}
        >
          <Mark />
          versetle<span className="brand-dot">.</span>
        </a>
        <nav aria-label="Main navigation">
          <span className="nav-current">Solo play</span>
          <span className="coming-soon">
            Made for music people <span>↗</span>
          </span>
        </nav>
      </header>
      {!session ? (
        <main className="setup-grid">
          <section className="intro">
            <div className="eyebrow">
              <span className="status-dot" />
              THE LYRICS ARE IN YOUR HEAD.
            </div>
            <h1>
              Let’s see if
              <br />
              you know
              <br />
              the{' '}
              <span className="accent-word">
                words
                <span className="underline" />.
              </span>
            </h1>
            <p className="intro-copy">
              Your favorite songs. A few missing words.
              <br />
              One ticking clock. Fill in the blanks and
              <br className="desktop-break" /> find out how well you really know
              them.
            </p>
            <div className="sample-card" aria-hidden="true">
              <div className="sample-top">
                <Equalizer />
                <span>YOUR NEXT OBSESSION</span>
                <span className="sample-index">01 / 05</span>
              </div>
              <p>
                A little{' '}
                <span className="sample-blank">
                  melody<span>↵</span>
                </span>
                <br />
                stays with you.
              </p>
              <div className="sample-bottom">
                <span className="tiny-dot" />
                Original demo text · real songs in game
              </div>
            </div>
            <div className="intro-meta">
              <span>NO ACCOUNT NEEDED</span>
              <span>JUST YOU + THE MUSIC</span>
            </div>
          </section>
          <section className="setup-card" aria-labelledby="setup-heading">
            <div className="card-heading">
              <div>
                <span className="eyebrow muted">THE STAGE IS YOURS</span>
                <h2 id="setup-heading">Make it your game.</h2>
              </div>
              <span className="outline-icon" aria-hidden="true">
                ♫
              </span>
            </div>
            <div className="section-label">
              01 <span>Pick your soundtrack</span>
            </div>
            <div className="segmented" aria-label="Song source">
              {(['random', 'search'] as const).map((mode) => (
                <button
                  key={mode}
                  className={selection.mode === mode ? 'selected' : ''}
                  aria-pressed={selection.mode === mode}
                  onClick={() =>
                    setSelection({ ...selection, mode, song: null })
                  }
                >
                  {mode === 'random' ? '↝  Surprise me' : '⌕  Find a song'}
                </button>
              ))}
            </div>
            {selection.mode === 'random' ? (
              <>
                <p className="field-help">
                  A familiar track, a fresh challenge. Choose your artists.
                </p>
                <div className="artist-grid">
                  <button
                    className={`artist-chip all ${!selection.artist ? 'active' : ''}`}
                    aria-pressed={!selection.artist}
                    onClick={() => setSelection({ ...selection, artist: '' })}
                  >
                    <span>✦</span> All six artists
                  </button>
                  {artists.map((artist, i) => (
                    <button
                      key={artist}
                      className={`artist-chip ${selection.artist === artist ? 'active' : ''}`}
                      aria-pressed={selection.artist === artist}
                      onClick={() => setSelection({ ...selection, artist })}
                    >
                      <span className={`avatar avatar-${i}`}>
                        {artist
                          .split(' ')
                          .map((s) => s[0])
                          .join('')}
                      </span>
                      {artist}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="search-area">
                <label className="sr-only" htmlFor="song-search">
                  Song or artist
                </label>
                <input
                  id="song-search"
                  className="search-input"
                  placeholder="Search a song or artist…"
                  value={query}
                  maxLength={120}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSelection({ ...selection, song: null });
                  }}
                  autoComplete="off"
                />
                <div className="search-results" aria-live="polite">
                  {searching ? (
                    <p className="field-help">Searching LRCLIB…</p>
                  ) : searchError ? (
                    <p className="error-text">{searchError}</p>
                  ) : songs.length ? (
                    songs.map((song) => (
                      <button
                        key={song.id}
                        aria-pressed={selection.song?.id === song.id}
                        className={`song-choice ${selection.song?.id === song.id ? 'picked' : ''}`}
                        onClick={() => setSelection({ ...selection, song })}
                      >
                        <span>
                          <strong>{song.title}</strong>
                          <small>
                            {song.artist}
                            {song.album ? ` · ${song.album}` : ''}
                          </small>
                        </span>
                        <span>
                          {selection.song?.id === song.id ? '✓' : '+'}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="field-help">
                      {searched
                        ? 'No lyrics found. Try adding the artist name.'
                        : 'Choose a recording for one focused round.'}
                    </p>
                  )}
                </div>
              </div>
            )}
            <div className="settings-divider" />
            <div className="section-label">
              02 <span>Set the challenge</span>
            </div>
            <div className="setting-row">
              <label htmlFor="difficulty">
                Words visible{' '}
                <strong>{Math.round(settings.visibility * 100)}%</strong>
              </label>
              <input
                id="difficulty"
                type="range"
                min="20"
                max="80"
                step="5"
                value={settings.visibility * 100}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    visibility: Number(e.target.value) / 100,
                  })
                }
              />
              <div className="range-labels">
                <span>More challenging</span>
                <span>More clues</span>
              </div>
            </div>
            <div className="settings-grid">
              <label>
                Blank style
                <select
                  value={settings.style}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      style: e.target.value as Settings['style'],
                    })
                  }
                >
                  <option value="words">Missing words</option>
                  <option value="lines">Whole lines</option>
                  <option value="mixed">A little of both</option>
                </select>
              </label>
              <label>
                Round timer
                <select
                  value={settings.seconds}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      seconds: Number(e.target.value),
                    })
                  }
                >
                  <option value={60}>60 seconds</option>
                  <option value={90}>90 seconds</option>
                  <option value={120}>120 seconds</option>
                  <option value={180}>180 seconds</option>
                </select>
              </label>
              <label>
                Rounds
                <select
                  value={selection.mode === 'search' ? 1 : settings.rounds}
                  disabled={selection.mode === 'search'}
                  onChange={(e) =>
                    setSettings({ ...settings, rounds: Number(e.target.value) })
                  }
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? 'round' : 'rounds'}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Missing-word limit
                <select
                  value={settings.maxWords}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      maxWords: Number(e.target.value),
                    })
                  }
                >
                  {[10, 20, 30, 40, 50].map((n) => (
                    <option key={n} value={n}>
                      {n} words
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="cap-note">
              The word limit keeps each puzzle manageable. Actual visibility may
              be higher.
            </p>
            {error && (
              <div className="error-box" role="alert">
                {error}
              </div>
            )}
            <button
              className="primary start-button"
              disabled={
                !ready ||
                loading ||
                (selection.mode === 'search' && !selection.song)
              }
              onClick={() => prepare()}
            >
              {loading ? (
                <>
                  <span className="spinner" /> Finding your next verse…
                </>
              ) : (
                <>
                  Let’s play <span>↗</span>
                </>
              )}
            </button>
            <p className="under-button">
              {loading
                ? 'Checking lyrics and preparing your puzzle. This may take a moment.'
                : 'No audio. No pressure. Okay, a little pressure.'}
            </p>
          </section>
        </main>
      ) : session.phase === 'results' ? (
        <main className="results-page">
          <div className="eyebrow">
            <span className="status-dot" />
            THAT’S A WRAP
          </div>
          <h1>
            You’ve got
            <br />
            <span className="lavender">good taste.</span>
          </h1>
          <p className="result-subtitle">
            Your soundtrack. Your score. Ready for an encore?
          </p>
          <div className="results-metrics">
            <div>
              <strong>{totalScore}</strong>
              <span>Total points / {session.played.length * 150}</span>
            </div>
            <div>
              <strong>
                {Math.round(
                  (session.played.reduce((n, p) => n + p.result.earned, 0) /
                    Math.max(
                      1,
                      session.played.reduce((n, p) => n + p.result.total, 0),
                    )) *
                    100,
                )}
                %
              </strong>
              <span>Words correct</span>
            </div>
            <div>
              <strong>{session.played.length}</strong>
              <span>Rounds played</span>
            </div>
          </div>
          <div className="results-list">
            {session.played.map((p, i) => (
              <div className="result-row" key={i}>
                <span className="round-number">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="result-track">
                  <strong>{p.song.title}</strong>
                  <small>{p.song.artist}</small>
                </span>
                <span className="result-accuracy">
                  {Math.round(p.result.accuracy * 100)}% accuracy
                </span>
                <strong>
                  {p.result.score}
                  <small> pts</small>
                </strong>
              </div>
            ))}
          </div>
          <button className="primary encore" onClick={reset}>
            Another round? <span>↗</span>
          </button>
          <p className="under-button">
            Saved on this device · Solo scores are for your own enjoyment.
          </p>
        </main>
      ) : (
        <main className="game-page">
          <div className="game-topline">
            <button
              className="text-button"
              onClick={() => {
                if (
                  session.phase !== 'round' ||
                  window.confirm(
                    'Leave this game? Your current round will be lost.',
                  )
                )
                  reset();
              }}
            >
              ← Back to setup
            </button>
            <span className="solo-badge">
              <span className="status-dot" />
              SOLO SESSION
            </span>
          </div>
          <div className="game-heading">
            <div>
              <div className="eyebrow muted">
                ROUND{' '}
                {session.played.length + (session.phase === 'round' ? 1 : 0)} OF{' '}
                {session.settings.rounds}
              </div>
              <h1>{session.puzzle.song.title}</h1>
              <p>
                {session.puzzle.song.artist}
                <span className="track-separator">/</span>
                {session.settings.style === 'words'
                  ? 'Missing words'
                  : session.settings.style === 'lines'
                    ? 'Whole lines'
                    : 'Mixed blanks'}
              </p>
            </div>
            <div className="score-pill">
              <span>YOUR SCORE</span>
              <strong>
                {totalScore}
                <small> pts</small>
              </strong>
            </div>
          </div>
          <div
            className={`game-timer ${remaining < 10 && session.phase === 'round' ? 'urgent' : ''}`}
          >
            <div className="timer-label">
              <span>
                {session.phase === 'round'
                  ? 'MAKE EVERY WORD COUNT'
                  : 'THE WORDS YOU WERE LOOKING FOR'}
              </span>
              <strong aria-label="Time remaining" role="timer">
                {session.phase === 'round'
                  ? clock(remaining)
                  : 'Round complete'}
              </strong>
            </div>
            <div className="timer-track">
              <div
                style={{
                  width: `${session.phase === 'round' ? (remaining / session.settings.seconds) * 100 : 100}%`,
                }}
              />
            </div>
          </div>
          <section className="lyric-card" aria-label="Lyric puzzle">
            <div className="lyric-card-header">
              <span>
                <Equalizer /> THE VERSE
              </span>
              <span>
                {Math.round(session.puzzle.visibleRatio * 100)}% visible ·{' '}
                {session.puzzle.blanks.reduce((n, b) => n + b.weight, 0)}{' '}
                missing words
              </span>
            </div>
            <div className="lyric-panel" ref={panel}>
              {session.puzzle.lines.map((line, i) => (
                <div className="lyric-line" key={i}>
                  <span className="line-number" aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    {line.map((token, j) => {
                      if (token.kind === 'text')
                        return <span key={j}>{token.text}</span>;
                      const blank = session.puzzle.blanks[token.id],
                        grade = currentResult?.grades.find(
                          (g) => g.id === token.id,
                        );
                      if (grade)
                        return (
                          <span
                            key={j}
                            className={`revealed-blank ${grade.credit === 1 ? 'correct' : grade.credit > 0 ? 'partial' : 'incorrect'} ${blank.line ? 'full-line' : ''}`}
                            title={`Your answer: ${grade.submitted || '(empty)'}`}
                          >
                            <span aria-hidden="true">
                              {grade.credit === 1
                                ? '✓'
                                : grade.credit > 0
                                  ? '◐'
                                  : '×'}{' '}
                            </span>
                            {grade.answer}
                            <span className="sr-only">
                              {' '}
                              —{' '}
                              {grade.credit === 1
                                ? 'correct'
                                : grade.credit > 0
                                  ? 'partly correct'
                                  : 'incorrect'}
                              . Your answer: {grade.submitted || 'empty'}.
                            </span>
                            {grade.credit < 1 && grade.submitted && (
                              <small className="submitted-answer">
                                you: {grade.submitted}
                              </small>
                            )}
                          </span>
                        );
                      return (
                        <input
                          key={j}
                          className={`blank-input ${blank.line ? 'full-line' : ''}`}
                          aria-label={`Blank ${blank.id + 1}, line ${i + 1}${blank.line ? `, ${blank.weight} words` : ''}`}
                          style={
                            blank.line
                              ? undefined
                              : {
                                  width: `${Math.min(18, Math.max(5, blank.answer.length + 2))}ch`,
                                }
                          }
                          placeholder={
                            blank.line ? `${blank.weight} words` : '···'
                          }
                          value={session.answers[blank.id] ?? ''}
                          maxLength={blank.line ? 500 : 80}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          onFocus={(e) =>
                            e.target.scrollIntoView({
                              block: 'nearest',
                              behavior: 'smooth',
                            })
                          }
                          onChange={(e) => {
                            const value = e.target.value;
                            setSession((current) =>
                              current?.phase === 'round'
                                ? {
                                    ...current,
                                    answers: {
                                      ...current.answers,
                                      [blank.id]: value,
                                    },
                                  }
                                : current,
                            );
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const inputs = Array.from(
                                panel.current?.querySelectorAll<HTMLInputElement>(
                                  'input',
                                ) ?? [],
                              );
                              const index = inputs.indexOf(e.currentTarget);
                              if (index < inputs.length - 1)
                                inputs[index + 1].focus();
                              else lock();
                            }
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="lyric-card-footer">
              <span>
                {session.phase === 'round'
                  ? `${filled} / ${session.puzzle.blanks.length} blanks filled`
                  : 'Answers revealed · hover to compare your guesses'}
              </span>
              <span className="keyboard-hint">
                <kbd>tab</kbd> next blank <kbd>enter</kbd> continue
              </span>
            </div>
          </section>
          {session.phase === 'reveal' && currentResult ? (
            <div className="reveal-summary" role="status">
              <div>
                <span className="eyebrow">
                  {currentResult.accuracy === 1
                    ? 'WORD PERFECT.'
                    : currentResult.accuracy >= 0.5
                      ? 'YOU KNOW THE VIBE.'
                      : 'A NEW ONE FOR YOUR PLAYLIST.'}
                </span>
                <p>
                  <strong>+{currentResult.score}</strong> points{' '}
                  <span>
                    · {Math.round(currentResult.accuracy * 100)}% accuracy ·{' '}
                    {Math.round(currentResult.bonus)} speed bonus
                  </span>
                </p>
              </div>
            </div>
          ) : (
            <p className="game-help">
              Punctuation doesn’t matter. Small typos are okay. Lock in early
              for a speed bonus.
            </p>
          )}
          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}
          <div className="game-actions">
            <span>
              {session.phase === 'round'
                ? 'Know it by heart? Trust yourself.'
                : 'Take a look. Let it sink in.'}
            </span>
            {session.phase === 'round' ? (
              <button className="primary" onClick={lock}>
                Lock in answers <span>↗</span>
              </button>
            ) : session.played.length >= session.settings.rounds ? (
              <button className="primary" onClick={endGame}>
                See my results <span>↗</span>
              </button>
            ) : (
              <button
                className="primary"
                disabled={loading}
                onClick={() => prepare(session)}
              >
                {loading ? (
                  <>
                    <span className="spinner" /> Preparing…
                  </>
                ) : (
                  <>
                    Next round <span>↗</span>
                  </>
                )}
              </button>
            )}
          </div>
        </main>
      )}
      {!session && history.length > 0 && (
        <section className="recent-games" aria-label="Recent games">
          <div className="section-label">
            YOUR RECENT SESSIONS <span>On this device</span>
          </div>
          {history.slice(0, 3).map((h, i) => (
            <div className="history-row" key={i}>
              <span>
                {new Date(h.date).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
              <span>
                {h.rounds} {h.rounds === 1 ? 'round' : 'rounds'}
              </span>
              <span>{Math.round(h.accuracy * 100)}% accuracy</span>
              <strong>{h.score} pts</strong>
            </div>
          ))}
        </section>
      )}
      <footer className="site-footer">
        <span>LESS SCROLLING. MORE SINGING IN YOUR HEAD.</span>
        <span>
          Lyrics from{' '}
          <a href="https://lrclib.net" target="_blank" rel="noreferrer">
            LRCLIB ↗
          </a>
          <span className="footer-dot">·</span>Solo edition v0.1
        </span>
      </footer>
    </div>
  );
}
