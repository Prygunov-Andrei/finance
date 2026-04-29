import type { Metadata } from 'next';
import { PublicLayout } from '@/components/public/PublicLayout';
import { SmetaForm } from './SmetaForm';
import { CabinetLoginForm } from './CabinetLoginForm';

export const metadata: Metadata = {
  title: 'Сметчик — Рассчитайте смету онлайн',
  description: 'Загрузите смету для автоматической оценки стоимости работ и материалов или работайте в интерактивном редакторе',
  robots: { index: false, follow: true },
};

export default function SmetaPage() {
  return (
    <PublicLayout>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Service',
            name: 'Онлайн-сметчик для HVAC',
            description: 'Интерактивный редактор смет с автоматическим подбором работ и материалов',
            provider: {
              '@type': 'Organization',
              name: 'HVAC Info',
              url: 'https://hvac-info.com',
            },
          }),
        }}
      />

      <section className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
          Сметчик
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Рассчитайте стоимость работ и материалов. Зарегистрируйтесь для доступа к
          интерактивному редактору или загрузите файл для быстрой оценки.
        </p>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Интерактивный кабинет */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Интерактивный редактор
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Импортируйте спецификацию, редактируйте смету, подбирайте работы и материалы,
              скачайте готовую смету в Excel.
            </p>
            <CabinetLoginForm />
          </div>

          {/* Быстрая оценка */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Быстрая оценка
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Загрузите файл сметы — мы автоматически оценим стоимость и пришлём
              результат на email.
            </p>
            <SmetaForm />
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
