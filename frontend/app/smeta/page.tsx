import type { Metadata } from 'next';
import { PublicLayout } from '@/components/public/PublicLayout';
import { SmetaForm } from './SmetaForm';

export const metadata: Metadata = {
  title: 'Оценка сметы',
  description: 'Загрузите смету для автоматической оценки стоимости работ и материалов',
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
            name: 'Оценка строительных смет',
            description: 'Автоматическая оценка стоимости работ и материалов по загруженной смете',
            provider: {
              '@type': 'Organization',
              name: 'HVAC Info',
              url: 'https://hvac-info.com',
            },
          }),
        }}
      />

      <section className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Оценка сметы
        </h1>
        <p className="text-gray-600 mb-8">
          Загрузите смету в формате Excel или PDF. Мы автоматически оценим стоимость работ
          и материалов по актуальным рыночным ценам.
        </p>

        <SmetaForm />
      </section>
    </PublicLayout>
  );
}
