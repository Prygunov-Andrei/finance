import type { Metadata } from 'next';
import { Inter, Source_Serif_4, JetBrains_Mono } from 'next/font/google';
import './rating-split-system/_styles/tokens.css';

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
    default: 'HVAC Info — независимый портал о кондиционерах',
    template: '%s | HVAC Info',
  },
  description:
    'Рейтинг кондиционеров, новости HVAC-индустрии, методика, франшиза Август-Климат.',
  icons: {
    icon: [
      {
        url: '/favicon-light.svg',
        type: 'image/svg+xml',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/favicon-dark.svg',
        type: 'image/svg+xml',
        media: '(prefers-color-scheme: dark)',
      },
      { url: '/favicon.ico', sizes: 'any' },
    ],
  },
};

export default function HvacInfoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`hvac-info-scope rating-scope ${inter.variable} ${serif.variable} ${mono.variable}`}
      style={{
        background: 'hsl(var(--rt-paper))',
        color: 'hsl(var(--rt-ink))',
        fontFamily: 'var(--rt-font-sans), Inter, system-ui, sans-serif',
        minHeight: '100vh',
      }}
    >
      {children}
    </div>
  );
}
