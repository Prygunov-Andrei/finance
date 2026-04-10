'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { publicAuthApi } from '@/lib/api/public-client';

export function CabinetLoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [contactName, setContactName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Проверяем не авторизован ли уже
  if (typeof window !== 'undefined' && publicAuthApi.isLoggedIn()) {
    router.push('/smeta/cabinet');
    return null;
  }

  const handleRegister = async () => {
    if (!email) return;
    setLoading(true);
    setError('');
    try {
      await publicAuthApi.register({ email, phone, contact_name: contactName, company_name: companyName });
      setStep('otp');
    } catch (err: any) {
      setError(err.message || 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!otp) return;
    setLoading(true);
    setError('');
    try {
      await publicAuthApi.login(email, otp);
      router.push('/smeta/cabinet');
    } catch (err: any) {
      setError(err.message || 'Неверный код');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {step === 'form' && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              placeholder="your@email.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Имя
            </label>
            <input
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              placeholder="Иван Иванов"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Телефон
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                placeholder="+7 999 123 45 67"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Компания
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                placeholder="ООО Климат"
              />
            </div>
          </div>
          <button
            onClick={handleRegister}
            disabled={!email || loading}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm font-medium"
          >
            {loading ? 'Отправка...' : 'Получить код на email'}
          </button>
        </>
      )}

      {step === 'otp' && (
        <>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Код отправлен на <strong>{email}</strong>
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Код подтверждения
            </label>
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm tracking-widest text-center text-lg"
              placeholder="123456"
              maxLength={6}
              autoFocus
            />
          </div>
          <button
            onClick={handleLogin}
            disabled={!otp || loading}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm font-medium"
          >
            {loading ? 'Проверка...' : 'Войти'}
          </button>
          <button
            onClick={() => setStep('form')}
            className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Отправить код заново
          </button>
        </>
      )}
    </div>
  );
}
