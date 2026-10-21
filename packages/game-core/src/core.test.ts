import { describe, expect, it } from 'vitest';
import { defaults, type Settings } from '@versetle/shared';
import {
  cleanLyrics,
  createPuzzle,
  lineCredit,
  matches,
  normalize,
  scoreRound,
  selectSnippet,
} from './index';
// Original test text, not song lyrics.
const fixture = Array.from(
  { length: 16 },
  (_, i) =>
    `Walking through the garden number ${i} brings another bright morning`,
);
const song = {
  id: 1,
  title: 'Test garden',
  artist: 'Test author',
  album: '',
  duration: 100,
};
describe('matching', () => {
  it('normalizes Unicode, contractions and numerals', () => {
    expect(normalize('I’m gonna find 2!')).toBe('i am going to find two');
    expect(matches("can't", 'cannot')).toBe(true);
    expect(matches('tryna', 'trying to')).toBe(true);
  });
  it('uses conservative length thresholds', () => {
    expect(matches('ca', 'cat')).toBe(false);
    expect(matches('gardne', 'garden')).toBe(false);
    expect(matches('garde', 'garden')).toBe(true);
    expect(matches('', 'a')).toBe(false);
  });
  it('aligns line words in order and never duplicates credit', () => {
    expect(lineCredit('the bright garden', 'the garden is bright')).toBe(0.5);
    expect(lineCredit('garden garden garden', 'a garden')).toBe(0.5);
    expect(lineCredit('gonna go', 'going to go')).toBe(1);
  });
});
describe('puzzles', () => {
  it('cleans LRC metadata and timestamps', () =>
    expect(
      cleanLyrics('[ti: Test]\n[00:01.20]Hello world\n[Chorus]\n\nNext line'),
    ).toEqual(['Hello world', 'Next line']));
  it('requires enough usable lines', () =>
    expect(() => selectSnippet(['tiny song'], 'seed')).toThrow('12'));
  for (const style of ['words', 'lines', 'mixed'] as const)
    it(`${style}: deterministic and capped across seeds`, () => {
      for (let i = 0; i < 50; i++) {
        const settings: Settings = { ...defaults, style };
        const a = createPuzzle(song, fixture, settings, String(i));
        expect(a).toEqual(createPuzzle(song, fixture, settings, String(i)));
        expect(a.blanks.length).toBeGreaterThan(0);
        expect(a.blanks.reduce((n, b) => n + b.weight, 0)).toBeLessThanOrEqual(
          settings.maxWords,
        );
        expect(a.visibleRatio).toBeGreaterThan(0);
        expect(a.lines.flat().filter((t) => t.kind === 'blank').length).toBe(
          a.blanks.length,
        );
      }
    });
});
describe('scoring', () => {
  const puzzle = createPuzzle(song, fixture, defaults, 'score');
  const answers = Object.fromEntries(
    puzzle.blanks.map((b) => [b.id, b.answer]),
  );
  it('awards 100 at deadline and 150 instantly', () => {
    expect(scoreRound(puzzle, answers, 90, 90).score).toBe(100);
    expect(scoreRound(puzzle, answers, 0, 90).score).toBe(150);
  });
  it('gives no speed points for no correct answers', () =>
    expect(scoreRound(puzzle, {}, 0, 90).score).toBe(0));
  it('clamps elapsed time', () => {
    expect(scoreRound(puzzle, answers, -20, 90).score).toBe(150);
    expect(scoreRound(puzzle, answers, 200, 90).score).toBe(100);
  });
});
