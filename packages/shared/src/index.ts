import { z } from 'zod';
export const settingsSchema = z.object({
  style: z.enum(['words', 'lines', 'mixed']).default('words'),
  visibility: z.number().min(0.2).max(0.8).default(0.5),
  seconds: z.number().int().min(60).max(180).default(90),
  maxWords: z.number().int().min(5).max(50).default(30),
  rounds: z.number().int().min(1).max(5).default(5),
});
export type Settings = z.infer<typeof settingsSchema>;
export const defaults: Settings = settingsSchema.parse({});
export type Song = {
  id: number;
  title: string;
  artist: string;
  album: string;
  duration: number;
};
export type Blank = {
  id: number;
  answer: string;
  weight: number;
  line: boolean;
};
export type Token =
  { kind: 'text'; text: string } | { kind: 'blank'; id: number };
export type Puzzle = {
  song: Song;
  lines: Token[][];
  blanks: Blank[];
  seed: string;
  visibleRatio: number;
};
export type RoundResult = {
  score: number;
  accuracy: number;
  earned: number;
  total: number;
  bonus: number;
  elapsed: number;
  grades: { id: number; credit: number; answer: string; submitted: string }[];
};
export const artists = [
  'Taylor Swift',
  'Ariana Grande',
  'Katy Perry',
  'Drake',
  'The Weeknd',
  'Bruno Mars',
] as const;
export const seeds = [
  ['Taylor Swift', 'Cruel Summer'],
  ['Taylor Swift', 'Blank Space'],
  ['Taylor Swift', 'Love Story'],
  ['Taylor Swift', 'Style'],
  ['Taylor Swift', 'Shake It Off'],
  ['Taylor Swift', 'Anti-Hero'],
  ['Ariana Grande', 'thank u, next'],
  ['Ariana Grande', 'Into You'],
  ['Ariana Grande', '7 rings'],
  ['Ariana Grande', 'positions'],
  ['Ariana Grande', 'no tears left to cry'],
  ['Ariana Grande', 'One Last Time'],
  ['Katy Perry', 'Teenage Dream'],
  ['Katy Perry', 'Firework'],
  ['Katy Perry', 'Roar'],
  ['Katy Perry', 'The One That Got Away'],
  ['Katy Perry', 'Dark Horse'],
  ['Katy Perry', 'Hot N Cold'],
  ['Drake', 'Hotline Bling'],
  ['Drake', "God's Plan"],
  ['Drake', 'Hold On, We’re Going Home'],
  ['Drake', 'Passionfruit'],
  ['Drake', 'One Dance'],
  ['Drake', 'Nice For What'],
  ['The Weeknd', 'Blinding Lights'],
  ['The Weeknd', 'Save Your Tears'],
  ['The Weeknd', 'Starboy'],
  ['The Weeknd', "Can't Feel My Face"],
  ['The Weeknd', 'The Hills'],
  ['The Weeknd', 'In Your Eyes'],
  ['Bruno Mars', 'Just the Way You Are'],
  ['Bruno Mars', 'Locked out of Heaven'],
  ['Bruno Mars', 'Grenade'],
  ['Bruno Mars', 'When I Was Your Man'],
  ['Bruno Mars', '24K Magic'],
  ['Bruno Mars', 'Treasure'],
] as const;
