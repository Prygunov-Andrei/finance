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
    `text-sm font-medium transition-colors pb-1 ${
      active
        ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
        : 'text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400'
    }`;

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Header */}
      <header className="bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <Link href="/" className="text-xl font-bold text-gray-900 dark:text-white">
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
                  <div className="absolute left-0 mt-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-50 min-w-[180px]">
                    <Link
                      href="/"
                      onClick={() => setNewsMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      {language === 'ru' ? 'Все новости' : language === 'en' ? 'All news' : language === 'de' ? 'Alle Nachrichten' : 'Todas as notícias'}
                    </Link>
                    <Link
                      href="/manufacturers"
                      onClick={() => setNewsMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      {language === 'ru' ? 'Производители' : language === 'en' ? 'Manufacturers' : language === 'de' ? 'Hersteller' : 'Fabricantes'}
                    </Link>
                    <Link
                      href="/brands"
                      onClick={() => setNewsMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      {language === 'ru' ? 'Бренды' : language === 'en' ? 'Brands' : language === 'de' ? 'Marken' : 'Marcas'}
                    </Link>
                    <Link
                      href="/resources"
                      onClick={() => setNewsMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      {language === 'ru' ? 'Ресурсы' : language === 'en' ? 'Resources' : language === 'de' ? 'Ressourcen' : 'Recursos'}
                    </Link>
                  </div>
                )}
              </div>

              {/* Рейтинг кондиционеров */}
              <Link href="/ratings" className={navLinkClass(isActive('/ratings'))}>
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
      <footer className="bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              &copy; {new Date().getFullYear()} HVAC Info
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
              <Link href="/feedback" className="hover:text-blue-600 dark:hover:text-blue-400">
                {language === 'ru' ? 'Обратная связь' : language === 'en' ? 'Feedback' : language === 'de' ? 'Feedback' : 'Feedback'}
              </Link>
              <Link href="/rss.xml" className="hover:text-blue-600 dark:hover:text-blue-400">RSS</Link>
              <Link href="/sitemap.xml" className="hover:text-blue-600 dark:hover:text-blue-400">Sitemap</Link>
              <Link href="/llms.txt" className="hover:text-blue-600 dark:hover:text-blue-400">llms.txt</Link>
              <Link href="/login" className="hover:text-blue-600 dark:hover:text-blue-400">
                {language === 'ru' ? 'Вход для своих' : 'Staff login'}
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
