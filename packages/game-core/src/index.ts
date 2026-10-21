import type {
  Blank,
  Puzzle,
  RoundResult,
  Settings,
  Song,
  Token,
} from '@versetle/shared';
const stop = new Set(
  'a an the and or but i you me my your we us our it its is am are was were be been to of in on at for with as that this'.split(
    ' ',
  ),
);
export function random(seed: string) {
  let s = 2166136261;
  for (const c of seed) s = Math.imul(s ^ c.charCodeAt(0), 16777619);
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const numbers: Record<string, string> = {
  '0': 'zero',
  '1': 'one',
  '2': 'two',
  '3': 'three',
  '4': 'four',
  '5': 'five',
  '6': 'six',
  '7': 'seven',
  '8': 'eight',
  '9': 'nine',
  '10': 'ten',
};
export function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/\b(can't|cannot)\b/g, 'can not')
    .replace(/\bwon't\b/g, 'will not')
    .replace(/\bain't\b/g, 'is not')
    .replace(/\bgonna\b/g, 'going to')
    .replace(/\bwanna\b/g, 'want to')
    .replace(/\bgotta\b/g, 'got to')
    .replace(/\btryna\b/g, 'trying to')
    .replace(/(?:\b|')cause\b/g, 'because')
    .replace(/\b([\p{L}]+)n't\b/gu, '$1 not')
    .replace(/\b([\p{L}]+)'re\b/gu, '$1 are')
    .replace(/\bi'm\b/g, 'i am')
    .replace(/\b([\p{L}]+)'ll\b/gu, '$1 will')
    .replace(/\b([\p{L}]+)'ve\b/gu, '$1 have')
    .replace(/\b(it|that|there|he|she|what)'s\b/g, '$1 is')
    .replace(/[\p{P}\p{S}]/gu, '')
    .trim()
    .split(/\s+/)
    .map((w) => numbers[w] ?? w)
    .join(' ');
}
export function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(
        row[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    prev = row;
  }
  return prev[b.length];
}
export function matches(input: string, answer: string): boolean {
  const a = normalize(input),
    b = normalize(answer);
  if (!a || !b) return false;
  if (a === b) return true;
  // Expanded phrases must match as phrases; fuzzy matching is word-by-word.
  const aw = a.split(' '),
    bw = b.split(' ');
  if (aw.length !== bw.length) return false;
  return bw.every(
    (w, i) => distance(aw[i], w) <= (w.length <= 3 ? 0 : w.length <= 7 ? 1 : 2),
  );
}
export function lineCredit(input: string, answer: string): number {
  const a = normalize(input).split(' ').filter(Boolean),
    b = normalize(answer).split(' ').filter(Boolean);
  if (!b.length) return 0;
  let prev = Array(b.length + 1).fill(0) as number[];
  for (const w of a) {
    const row = [0];
    for (let j = 1; j <= b.length; j++)
      row[j] = matches(w, b[j - 1])
        ? prev[j - 1] + 1
        : Math.max(prev[j], row[j - 1]);
    prev = row;
  }
  return prev[b.length] / b.length;
}
export function cleanLyrics(text: string): string[] {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) =>
      l.replace(/\[(?:\d{1,3}:\d{2}(?:[.:]\d+)?|offset:[^\]]*)\]/gi, '').trim(),
    )
    .filter(
      (l) =>
        l &&
        !/^\[[^\]]*\]$/.test(l) &&
        !/^\[(ti|ar|al|by|length|re|ve):/i.test(l),
    );
}
const words = (s: string) =>
  s.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];
export function selectSnippet(lines: string[], seed: string): string[] {
  if (lines.length < 12)
    throw new Error(
      'This recording needs at least 12 usable lyric lines. Choose another version.',
    );
  const rng = random(seed),
    count = Math.min(14, lines.length);
  const candidates = Array.from(
    { length: lines.length - count + 1 },
    (_, start) => {
      const chunk = lines.slice(start, start + count);
      const all = words(chunk.join(' '));
      const unique = new Set(all.map((w) => w.toLowerCase())).size;
      const distinct = new Set(chunk.map((l) => normalize(l))).size / count;
      return {
        chunk,
        score: unique / Math.max(1, all.length) + distinct + rng() * 0.3,
        unique,
      };
    },
  )
    .filter((c) => c.unique >= 12)
    .sort((a, b) => b.score - a.score);
  if (!candidates.length)
    throw new Error(
      'These lyrics are too repetitive for a good puzzle. Choose another recording.',
    );
  return candidates[0].chunk;
}
export function createPuzzle(
  song: Song,
  source: string[],
  settings: Settings,
  seed: string,
): Puzzle {
  const rng = random(seed),
    blanks: Blank[] = [],
    lines: Token[][] = [];
  const counts = source.map((l) => words(l).length),
    total = counts.reduce((a, b) => a + b, 0);
  let budget = Math.min(
    settings.maxWords,
    Math.max(1, Math.round(total * (1 - settings.visibility))),
    total - 1,
  );
  const fullyBlanked = new Set<number>();
  if (settings.style !== 'words') {
    const count = Math.min(
      source.length - 1,
      Math.max(
        1,
        Math.round(
          source.length *
            (1 - settings.visibility) *
            (settings.style === 'mixed' ? 0.5 : 1),
        ),
      ),
    );
    for (const { i } of source
      .map((_, i) => ({ i, r: rng() }))
      .sort((a, b) => a.r - b.r)) {
      if (fullyBlanked.size >= count) break;
      if (
        counts[i] > 0 &&
        counts[i] <= budget &&
        !fullyBlanked.has(i - 1) &&
        !fullyBlanked.has(i + 1)
      ) {
        fullyBlanked.add(i);
        budget -= counts[i];
      }
    }
  }
  const picks = new Set<string>();
  if (settings.style !== 'lines') {
    const candidates = source
      .flatMap((line, i) =>
        fullyBlanked.has(i)
          ? []
          : words(line).map((word, j, list) => ({
              i,
              j,
              rank:
                rng() +
                (stop.has(word.toLowerCase()) ? 0 : 1) +
                (j === list.length - 1 ? 0.3 : 0),
            })),
      )
      .sort((a, b) => b.rank - a.rank);
    for (const { i, j } of candidates) {
      if (budget <= 0) break;
      if (
        (picks.has(`${i}:${j - 1}`) && picks.has(`${i}:${j - 2}`)) ||
        (picks.has(`${i}:${j - 1}`) && picks.has(`${i}:${j + 1}`)) ||
        (picks.has(`${i}:${j + 1}`) && picks.has(`${i}:${j + 2}`))
      )
        continue;
      picks.add(`${i}:${j}`);
      budget--;
    }
  }
  source.forEach((line, i) => {
    if (fullyBlanked.has(i)) {
      const id = blanks.length;
      blanks.push({ id, answer: line, weight: counts[i], line: true });
      lines.push([{ kind: 'blank', id }]);
      return;
    }
    const tokens: Token[] = [];
    let end = 0,
      j = 0;
    for (const match of line.matchAll(
      /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu,
    )) {
      const start = match.index!;
      if (start > end)
        tokens.push({ kind: 'text', text: line.slice(end, start) });
      if (picks.has(`${i}:${j}`)) {
        const id = blanks.length;
        blanks.push({ id, answer: match[0], weight: 1, line: false });
        tokens.push({ kind: 'blank', id });
      } else tokens.push({ kind: 'text', text: match[0] });
      end = start + match[0].length;
      j++;
    }
    if (end < line.length) tokens.push({ kind: 'text', text: line.slice(end) });
    lines.push(tokens);
  });
  if (!blanks.length)
    throw new Error(
      'No blanks fit the word limit. Increase the missing-word limit or choose word blanks.',
    );
  const hidden = blanks.reduce((n, b) => n + b.weight, 0);
  return { song, lines, blanks, seed, visibleRatio: 1 - hidden / total };
}
export function scoreRound(
  puzzle: Puzzle,
  answers: Record<number, string>,
  elapsed: number,
  seconds: number,
): RoundResult {
  const grades = puzzle.blanks.map((b) => ({
    id: b.id,
    credit: b.line
      ? lineCredit(answers[b.id] ?? '', b.answer)
      : Number(matches(answers[b.id] ?? '', b.answer)),
    answer: b.answer,
    submitted: answers[b.id] ?? '',
  }));
  const total = puzzle.blanks.reduce((n, b) => n + b.weight, 0);
  const earned = grades.reduce(
    (n, g, i) => n + g.credit * puzzle.blanks[i].weight,
    0,
  );
  const accuracy = total ? earned / total : 0,
    base = 100 * accuracy;
  const safeElapsed = Math.max(0, Math.min(seconds, elapsed));
  const bonus = base * (1 - safeElapsed / seconds) * 0.5;
  return {
    score: Math.round(base + bonus),
    accuracy,
    earned,
    total,
    bonus,
    elapsed: safeElapsed,
    grades,
  };
}
