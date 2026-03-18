'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

export function SmetaForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'upload' | 'verify' | 'submitting'>('upload');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const handleSendOtp = async () => {
    if (!file || !email) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/public/v1/estimates/verify-email/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error('Ошибка отправки кода');
      setStep('verify');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!file || !email || !otp) return;
    setLoading(true);
    setStep('submitting');
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('email', email);
      formData.append('otp', otp);

      const res = await fetch('/api/public/v1/estimates/create/', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Ошибка отправки сметы');
      const data = await res.json();
      router.push(`/smeta/requests/${data.access_token}`);
    } catch (err: any) {
      setError(err.message);
      setStep('verify');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* File upload */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Файл сметы (Excel, PDF)
        </label>
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 transition-colors"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.pdf"
            onChange={handleFileChange}
            className="hidden"
          />
          {file ? (
            <p className="text-sm text-gray-900">{file.name} ({(file.size / 1024).toFixed(0)} KB)</p>
          ) : (
            <p className="text-sm text-gray-500">Нажмите для выбора файла или перетащите сюда</p>
          )}
        </div>
      </div>

      {/* Email */}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
          Email для получения результата
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          placeholder="your@email.com"
          required
        />
      </div>

      {step === 'upload' && (
        <button
          onClick={handleSendOtp}
          disabled={!file || !email || loading}
          className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {loading ? 'Отправка кода...' : 'Получить код подтверждения'}
        </button>
      )}

      {step === 'verify' && (
        <>
          <div>
            <label htmlFor="otp" className="block text-sm font-medium text-gray-700 mb-2">
              Код подтверждения (из email)
            </label>
            <input
              id="otp"
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              placeholder="123456"
              maxLength={6}
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={!otp || loading}
            className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Отправка...' : 'Отправить смету на оценку'}
          </button>
        </>
      )}

      {step === 'submitting' && (
        <div className="text-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-2 text-sm text-gray-500">Отправляем смету...</p>
        </div>
      )}
    </div>
  );
}
