export type FeedbackSection =
  | 'dashboard' | 'commercial' | 'objects' | 'finance' | 'contracts'
  | 'supply' | 'goods' | 'pto' | 'marketing' | 'communications'
  | 'settings' | 'hvac' | 'help';

export type FeedbackStatus = 'new' | 'in_progress' | 'resolved';

export interface FeedbackAttachment {
  id: number;
  url: string;
  original_filename: string;
  created_at: string;
}

export interface FeedbackReply {
  id: number;
  feedback: number;
  author: number;
  author_name: string;
  text: string;
  attachments: FeedbackAttachment[];
  created_at: string;
}

export interface SectionFeedback {
  id: number;
  section: FeedbackSection;
  author: number;
  author_name: string;
  text: string;
  status: FeedbackStatus;
  attachments: FeedbackAttachment[];
  replies: FeedbackReply[];
  reply_count: number;
  created_at: string;
  updated_at: string;
}

export interface SectionFeedbackListItem {
  id: number;
  section: FeedbackSection;
  author: number;
  author_name: string;
  text: string;
  status: FeedbackStatus;
  reply_count: number;
  attachment_count: number;
  has_attachments: boolean;
  created_at: string;
  updated_at: string;
}

export interface FeedbackStats {
  section: FeedbackSection;
  total: number;
  new: number;
  in_progress: number;
  resolved: number;
}

export const SECTION_LABELS: Record<FeedbackSection, string> = {
  dashboard: 'Пункт управления',
  commercial: 'Коммерческие предложения',
  objects: 'Объекты',
  finance: 'Финансы',
  contracts: 'Договоры',
  supply: 'Снабжение и Склад',
  goods: 'Товары и услуги',
  pto: 'ПТО',
  marketing: 'Маркетинг',
  communications: 'Переписка',
  settings: 'Справочники и Настройки',
  hvac: 'HVAC-новости',
  help: 'Справка',
};
