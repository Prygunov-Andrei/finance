import type { Metadata } from 'next';
import { Inter, Source_Serif_4, JetBrains_Mono } from 'next/font/google';
import './_styles/tokens.css';

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--rt-font-sans-loaded',
  display: 'swap',
});

const serif = Source_Serif_4({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '600', '700'],
  variable: '--rt-font-serif-loaded',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--rt-font-mono-loaded',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Рейтинг кондиционеров — hvac-info.com',
    template: '%s | Рейтинг кондиционеров',
  },
  description:
    'Независимый рейтинг бытовых кондиционеров: методика, параметры, отзывы, сравнение моделей.',
};

export default function RatingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`rating-scope ${inter.variable} ${serif.variable} ${mono.variable} min-h-screen`}
      style={{
        background: 'hsl(var(--rt-paper))',
        color: 'hsl(var(--rt-ink))',
        fontFamily: 'var(--rt-font-sans)',
      }}
    >
      {children}
    </div>
  );
}
