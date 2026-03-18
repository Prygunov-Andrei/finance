import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'HVAC Info — Новости климатической индустрии',
    template: '%s | HVAC Info',
  },
  description: 'Портал новостей и каталог оборудования для HVAC-индустрии: отопление, вентиляция, кондиционирование',
  metadataBase: new URL('https://hvac-info.com'),
  icons: {
    icon: '/favicon.ico',
  },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: 'https://hvac-info.com',
    siteName: 'HVAC Info',
    title: 'HVAC Info — Новости климатической индустрии',
    description: 'Портал новостей и каталог оборудования для HVAC-индустрии',
  },
  alternates: {
    types: {
      'application/rss+xml': '/rss.xml',
    },
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'HVAC Info',
              url: 'https://hvac-info.com',
              description: 'Портал новостей и каталог оборудования для HVAC-индустрии',
              sameAs: [],
            }),
          }}
        />
      </head>
      <body className="min-h-screen antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
