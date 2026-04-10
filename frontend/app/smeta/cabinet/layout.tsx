'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { publicAuthApi } from '@/lib/api/public-client';
import { FileSpreadsheet, LogOut, User } from 'lucide-react';

export default function CabinetLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<{ email: string; contact_name: string; company_name: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!publicAuthApi.isLoggedIn()) {
      router.push('/smeta');
      return;
    }
    publicAuthApi.getMe().then((data) => {
      if (!data) {
        router.push('/smeta');
        return;
      }
      setUser(data);
      setLoading(false);
    });
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-4">
              <Link href="/smeta/cabinet" className="flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100">
                <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                Сметчик
              </Link>
            </div>
            <div className="flex items-center gap-4">
              {user && (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <User className="h-4 w-4" />
                  {user.contact_name || user.email}
                  {user.company_name && <span className="text-gray-400">({user.company_name})</span>}
                </div>
              )}
              <button
                onClick={() => {
                  publicAuthApi.logout();
                  router.push('/smeta');
                }}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-600 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Выйти
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
}
