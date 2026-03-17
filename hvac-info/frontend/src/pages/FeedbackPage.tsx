import React, { useState } from 'react';
import MainLayout from '../components/MainLayout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Mail, CheckCircle, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import feedbackService from '../services/feedbackService';
import HCaptcha from '@hcaptcha/react-hcaptcha';

export default function FeedbackPage() {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: '',
  });
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // hCaptcha site key - ВАЖНО: замените на свой ключ!
  const HCAPTCHA_SITE_KEY = '10000000-ffff-ffff-ffff-000000000001'; // Тестовый ключ, замените на настоящий

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Очистить ошибку валидации для этого поля
    if (validationErrors[name]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.email.trim()) {
      errors.email = t('validation.required');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = t('validation.email');
    }

    if (!formData.message.trim()) {
      errors.message = t('validation.required');
    } else if (formData.message.length < 10) {
      errors.message = t('validation.minLength', { min: 10 });
    }

    if (!captchaToken) {
      errors.captcha = t('feedback.captchaError');
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitStatus('idle');
      setErrorMessage('');

      await feedbackService.submitFeedback({
        email: formData.email,
        name: formData.name || undefined,
        message: formData.message,
        captcha: captchaToken!,
      });

      setSubmitStatus('success');
      // Очистить форму
      setFormData({ name: '', email: '', message: '' });
      setCaptchaToken(null);
    } catch (error: any) {
      console.error('Error submitting feedback:', error);
      setSubmitStatus('error');

      // Обработка различных типов ошибок
      if (error.response?.data?.captcha) {
        setErrorMessage(t('feedback.captchaFailed'));
      } else if (error.response?.data) {
        // Показать первую ошибку из ответа
        const firstError = Object.values(error.response.data)[0];
        setErrorMessage(Array.isArray(firstError) ? firstError[0] : String(firstError));
      } else {
        setErrorMessage(t('feedback.errorMessage'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <MainLayout>
      <div className="p-6">
        <div className="max-w-2xl mx-auto">
          {/* Заголовок */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <Mail className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold mb-2">{t('feedback.title')}</h1>
            <p className="text-muted-foreground">{t('feedback.description')}</p>
          </div>

          {/* Форма */}
          <div className="bg-card border border-border rounded-lg p-8">
            {submitStatus === 'success' ? (
              // Сообщение об успешной отправке
              <div className="text-center py-8">
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold mb-2">{t('feedback.successTitle')}</h2>
                <p className="text-muted-foreground mb-6">{t('feedback.successMessage')}</p>
                <Button onClick={() => setSubmitStatus('idle')}>
                  {t('feedback.submit')} {t('common.next')}
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Поле имени */}
                <div className="space-y-2">
                  <Label htmlFor="name">{t('feedback.name')}</Label>
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder={t('feedback.namePlaceholder')}
                    disabled={isSubmitting}
                  />
                </div>

                {/* Поле email */}
                <div className="space-y-2">
                  <Label htmlFor="email">
                    {t('feedback.email')} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder={t('feedback.emailPlaceholder')}
                    disabled={isSubmitting}
                    className={validationErrors.email ? 'border-destructive' : ''}
                  />
                  {validationErrors.email && (
                    <p className="text-sm text-destructive">{validationErrors.email}</p>
                  )}
                </div>

                {/* Поле сообщения */}
                <div className="space-y-2">
                  <Label htmlFor="message">
                    {t('feedback.message')} <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="message"
                    name="message"
                    value={formData.message}
                    onChange={handleInputChange}
                    placeholder={t('feedback.messagePlaceholder')}
                    rows={6}
                    maxLength={2000}
                    disabled={isSubmitting}
                    className={validationErrors.message ? 'border-destructive' : ''}
                  />
                  <div className="flex justify-between items-center">
                    {validationErrors.message ? (
                      <p className="text-sm text-destructive">{validationErrors.message}</p>
                    ) : (
                      <span />
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formData.message.length}/2000
                    </p>
                  </div>
                </div>

                {/* hCaptcha */}
                <div className="space-y-2">
                  {/* Примечание о тестовом ключе - удалите в продакшене */}
                  {HCAPTCHA_SITE_KEY === '10000000-ffff-ffff-ffff-000000000001' && (
                    <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-2">
                      <p className="text-xs text-amber-900 dark:text-amber-100">
                        ℹ️ <strong>Для разработчиков:</strong> Используется тестовый ключ hCaptcha. 
                        В продакшене замените на настоящий ключ в переменной HCAPTCHA_SITE_KEY.
                      </p>
                    </div>
                  )}
                  
                  <div className="relative min-h-[120px] flex items-start overflow-visible">
                    <div className="w-full">
                      <HCaptcha
                        sitekey={HCAPTCHA_SITE_KEY}
                        onVerify={(token) => {
                          setCaptchaToken(token);
                          if (validationErrors.captcha) {
                            setValidationErrors(prev => {
                              const newErrors = { ...prev };
                              delete newErrors.captcha;
                              return newErrors;
                            });
                          }
                        }}
                        onExpire={() => setCaptchaToken(null)}
                        onError={() => setCaptchaToken(null)}
                      />
                    </div>
                  </div>
                  {validationErrors.captcha && (
                    <p className="text-sm text-destructive">{validationErrors.captcha}</p>
                  )}
                </div>

                {/* Сообщение об ошибке */}
                {submitStatus === 'error' && errorMessage && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-destructive">{t('feedback.errorTitle')}</p>
                        <p className="text-sm text-destructive mt-1">{errorMessage}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Кнопка отправки */}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting}
                >
                  <Mail className="w-4 h-4 mr-2" />
                  {isSubmitting ? t('feedback.submitting') : t('feedback.submit')}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  <span className="text-destructive">*</span> - {t('validation.required')}
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}