import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Обратная связь',
  description: 'Форма обратной связи HVAC Info',
  robots: { index: false, follow: true },
};

export default function FeedbackLayout({ children }: { children: React.ReactNode }) {
  return children;
}
