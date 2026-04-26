'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeSwitcher } from './ThemeSwitcher';

interface PublicLayoutProps {
  children: React.ReactNode;
}

export function PublicLayout({ children }: PublicLayoutProps) {
  const pathname = usePathname();
  const [newsMenuOpen, setNewsMenuOpen] = useState(false);
  const [language, setLanguage] = useState('ru');
  const newsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('language');
    if (saved) setLanguage(saved);
    const handler = () => {
      const lang = localStorage.getItem('language');
      if (lang) setLanguage(lang);
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (newsMenuRef.current && !newsMenuRef.current.contains(e.target as Node)) {
        setNewsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isActive = (path: string) => pathname === path;
  const isNewsActive = ['/', '/news', '/manufacturers', '/brands', '/resources'].some(
    (p) => pathname === p || pathname.startsWith('/news/')
  );

  const navLinkClass = (active: boolean) =>
    `pb-1 text-sm font-medium transition-colors ${
      active
        ? 'border-b-2 border-primary text-primary'
        : 'text-muted-foreground hover:text-primary'
    }`;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <Link href="/" className="text-xl font-bold text-foreground">
              HVAC Info
            </Link>

            {/* Navigation */}
            <nav className="hidden md:flex items-center gap-6">
              {/* Новости — dropdown */}
              <div ref={newsMenuRef} className="relative">
                <button
                  onClick={() => setNewsMenuOpen(!newsMenuOpen)}
                  className={navLinkClass(isNewsActive)}
                >
                  {language === 'ru' ? 'Новости' : language === 'en' ? 'News' : language === 'de' ? 'Nachrichten' : 'Notícias'} ▾
                </button>

                {newsMenuOpen && (
                  <div className="absolute left-0 z-50 mt-2 min-w-[180px] rounded-lg border border-border bg-popover text-popover-foreground shadow-lg py-1">
                    <Link
                      href="/"
                      onClick={() => setNewsMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-foreground hover:bg-accent"
                    >
                      {language === 'ru' ? 'Все новости' : language === 'en' ? 'All news' : language === 'de' ? 'Alle Nachrichten' : 'Todas as notícias'}
                    </Link>
                    <Link
                      href="/manufacturers"
                      onClick={() => setNewsMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-foreground hover:bg-accent"
                    >
                      {language === 'ru' ? 'Производители' : language === 'en' ? 'Manufacturers' : language === 'de' ? 'Hersteller' : 'Fabricantes'}
                    </Link>
                    <Link
                      href="/brands"
                      onClick={() => setNewsMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-foreground hover:bg-accent"
                    >
                      {language === 'ru' ? 'Бренды' : language === 'en' ? 'Brands' : language === 'de' ? 'Marken' : 'Marcas'}
                    </Link>
                    <Link
                      href="/resources"
                      onClick={() => setNewsMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-foreground hover:bg-accent"
                    >
                      {language === 'ru' ? 'Ресурсы' : language === 'en' ? 'Resources' : language === 'de' ? 'Ressourcen' : 'Recursos'}
                    </Link>
                  </div>
                )}
              </div>

              {/* Рейтинг кондиционеров */}
              <Link href="/rating-split-system" className={navLinkClass(isActive('/rating-split-system'))}>
                {language === 'ru' ? 'Рейтинг кондиционеров' : language === 'en' ? 'AC Ratings' : language === 'de' ? 'Klimaanlagen-Rating' : 'Classificação AC'}
              </Link>

              {/* Оценка сметы — только ru */}
              {language === 'ru' && (
                <Link href="/smeta" className={navLinkClass(isActive('/smeta'))}>
                  Оценка сметы
                </Link>
              )}
            </nav>

            {/* Right side: language + theme */}
            <div className="flex items-center gap-1">
              <LanguageSwitcher />
              <ThemeSwitcher />
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} HVAC Info
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <Link href="/feedback" className="hover:text-primary">
                {language === 'ru' ? 'Обратная связь' : language === 'en' ? 'Feedback' : language === 'de' ? 'Feedback' : 'Feedback'}
              </Link>
              <Link href="/rss.xml" className="hover:text-primary">RSS</Link>
              <Link href="/sitemap.xml" className="hover:text-primary">Sitemap</Link>
              <Link href="/llms.txt" className="hover:text-primary">llms.txt</Link>
              <Link href="/login" className="hover:text-primary">
                {language === 'ru' ? 'Вход для своих' : 'Staff login'}
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
