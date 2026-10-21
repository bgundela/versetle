import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Versetle — Know the words?',
  description:
    'A lyric puzzle for the songs you know by heart. Play solo, fill the blanks, and beat the clock.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
