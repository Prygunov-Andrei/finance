import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { Upload, CheckCircle, FileText, Mail, Loader2, X } from 'lucide-react';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const ALLOWED_EXT = ['.pdf', '.xlsx', '.xls', '.zip', '.png', '.jpg', '.jpeg'];

export default function LandingPage() {
  const navigate = useNavigate();

  // OTP state
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [verificationToken, setVerificationToken] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);

  // Form state
  const [projectName, setProjectName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Honeypot
  const [honeypot, setHoneypot] = useState('');

  // Drag state
  const [dragOver, setDragOver] = useState(false);

  const sendOTP = async () => {
    if (!email) { toast.error('Введите email'); return; }
    setOtpLoading(true);
    try {
      await api.sendOTP(email);
      setOtpSent(true);
      toast.success('Код отправлен на email');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setOtpLoading(false);
    }
  };

  const confirmOTP = async () => {
    if (!otpCode || otpCode.length !== 6) { toast.error('Введите 6-цифровой код'); return; }
    setOtpLoading(true);
    try {
      const result = await api.confirmOTP(email, otpCode);
      setVerificationToken(result.verification_token);
      setOtpVerified(true);
      toast.success('Email подтверждён');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setOtpLoading(false);
    }
  };

  const validateFile = (file: File): string | null => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) return `${file.name}: неподдерживаемый формат`;
    if (file.size > MAX_FILE_SIZE) return `${file.name}: превышает 50 МБ`;
    return null;
  };

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const valid: File[] = [];
    for (const f of Array.from(newFiles)) {
      const err = validateFile(f);
      if (err) { toast.error(err); continue; }
      if (files.some(existing => existing.name === f.name && existing.size === f.size)) continue;
      valid.push(f);
    }
    setFiles(prev => [...prev, ...valid]);
  }, [files]);

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const submit = async () => {
    if (!otpVerified) { toast.error('Подтвердите email'); return; }
    if (!projectName.trim()) { toast.error('Введите название проекта'); return; }
    if (files.length === 0) { toast.error('Загрузите хотя бы один файл'); return; }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('verification_token', verificationToken);
      formData.append('project_name', projectName);
      formData.append('company_name', companyName);
      formData.append('company_website', honeypot); // honeypot
      files.forEach(f => formData.append('files', f));

      const result = await api.createEstimateRequest(formData);
      toast.success('Запрос создан! Перенаправляем...');
      navigate(`/requests/${result.access_token}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-primary-700">Портал расчёта смет</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12">
        {/* Hero */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Рассчитайте смету по проектной документации
          </h2>
          <p className="text-lg text-gray-600 max-w-xl mx-auto">
            Загрузите спецификацию — получите готовую смету с ценами на материалы и работы
          </p>
        </div>

        {/* Как это работает */}
        <div className="grid grid-cols-3 gap-6 mb-12">
          {[
            { icon: <Upload className="w-8 h-8" />, title: 'Загрузите файлы', desc: 'PDF, ZIP, Excel' },
            { icon: <FileText className="w-8 h-8" />, title: 'Система распознает', desc: 'Автоподбор цен' },
            { icon: <Mail className="w-8 h-8" />, title: 'Получите смету', desc: 'Excel на email' },
          ].map((step, i) => (
            <div key={i} className="text-center p-6 bg-white rounded-xl shadow-sm border">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-100 text-primary-600 rounded-full mb-3">
                {step.icon}
              </div>
              <h3 className="font-semibold text-gray-900">{step.title}</h3>
              <p className="text-sm text-gray-500 mt-1">{step.desc}</p>
            </div>
          ))}
        </div>

        {/* Форма */}
        <div className="bg-white rounded-2xl shadow-lg border p-8 space-y-6">

          {/* Email + OTP */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={otpVerified}
                placeholder="your@email.com"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-50"
              />
              {!otpSent && !otpVerified && (
                <button onClick={sendOTP} disabled={otpLoading} className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50">
                  {otpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Получить код'}
                </button>
              )}
              {otpVerified && (
                <div className="flex items-center gap-1 px-3 text-green-600">
                  <CheckCircle className="w-5 h-5" /> Подтверждён
                </div>
              )}
            </div>

            {otpSent && !otpVerified && (
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Введите 6-цифровой код"
                  maxLength={6}
                  className="w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm tracking-widest text-center focus:ring-2 focus:ring-primary-500"
                />
                <button onClick={confirmOTP} disabled={otpLoading} className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50">
                  {otpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Подтвердить'}
                </button>
                <button onClick={sendOTP} disabled={otpLoading} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700">
                  Отправить заново
                </button>
              </div>
            )}
          </div>

          {/* Drag-and-drop */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Файлы проекта *</label>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
                ${dragOver ? 'border-primary-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}
            >
              <Upload className="w-10 h-10 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-600">Перетащите файлы сюда или нажмите для выбора</p>
              <p className="text-sm text-gray-400 mt-1">PDF, ZIP, Excel, PNG, JPG — до 50 МБ на файл</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.xlsx,.xls,.zip,.png,.jpg,.jpeg"
              onChange={e => e.target.files && addFiles(e.target.files)}
              className="hidden"
            />

            {files.length > 0 && (
              <div className="mt-3 space-y-1">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm bg-gray-50 rounded-lg px-3 py-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    <span className="flex-1 truncate">{f.name}</span>
                    <span className="text-gray-400">{(f.size / 1024 / 1024).toFixed(1)} МБ</span>
                    <button onClick={() => removeFile(i)} className="text-gray-400 hover:text-red-500">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Название проекта */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Название проекта *</label>
            <input
              type="text"
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              placeholder="например: Жилой дом на ул. Ленина"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Компания */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Компания</label>
            <input
              type="text"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              placeholder="ООО «Ваша компания»"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Honeypot (скрытое) */}
          <div style={{ position: 'absolute', left: '-9999px' }} aria-hidden="true">
            <input
              type="text"
              name="company_website"
              value={honeypot}
              onChange={e => setHoneypot(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          {/* Submit */}
          <button
            onClick={submit}
            disabled={submitting || !otpVerified || !projectName.trim() || files.length === 0}
            className="w-full py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {submitting ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Отправка...</>
            ) : (
              'Рассчитать смету'
            )}
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t mt-16 py-8 text-center text-sm text-gray-400">
        Портал расчёта смет
      </footer>
    </div>
  );
}
