'use client';

import { MarkdownPage } from '@/components/erp/components/help/MarkdownPage';
import { FeedbackWidget } from '@/components/erp/components/feedback';

export default function HvacInstructionsPage() {
  return (
    <div>
      <FeedbackWidget section="hvac" />
      <MarkdownPage filePath="hvac/instructions.md" />
    </div>
  );
}
