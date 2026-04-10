import { Settings, Brain, FileText, DollarSign, Shield } from 'lucide-react';
import type { Provider } from '../../services/searchConfigService';

export const PROVIDERS: { value: Provider; label: string; description: string; color: string }[] = [
  { value: 'grok', label: 'Grok (xAI)', description: 'Самый дешёвый, веб-поиск', color: 'purple' },
  { value: 'anthropic', label: 'Claude (Anthropic)', description: 'Глубокий анализ текста', color: 'orange' },
  { value: 'gemini', label: 'Gemini (Google)', description: 'Баланс цена/качество', color: 'blue' },
  { value: 'openai', label: 'OpenAI GPT', description: 'Универсальная модель', color: 'green' },
];

export type ModelOption = {
  id: string;
  label: string;
  tier: 'cheap' | 'power';
  description: string;
  input: number;
  output: number;
};

export const MODEL_OPTIONS: Record<string, ModelOption[]> = {
  grok: [
    { id: 'grok-4-1-fast', label: 'Grok 4.1 Fast', tier: 'cheap', description: 'Быстрый и дешёвый, контекст 2M', input: 0.20, output: 0.50 },
    { id: 'grok-4.20-0309-reasoning', label: 'Grok 4.20 Reasoning', tier: 'power', description: 'Flagship, глубокий reasoning', input: 2.00, output: 6.00 },
  ],
  anthropic: [
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', tier: 'cheap', description: 'Быстрая классификация', input: 1.00, output: 5.00 },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', tier: 'power', description: 'Высокое качество, контекст 1M', input: 3.00, output: 15.00 },
  ],
  gemini: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'cheap', description: 'Ультра-дешёвый, контекст 1M', input: 0.30, output: 2.50 },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: 'power', description: 'Лучший reasoning от Google', input: 1.25, output: 10.00 },
  ],
  openai: [
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', tier: 'cheap', description: 'Быстрый, контекст 1M', input: 0.40, output: 1.60 },
    { id: 'gpt-4.1', label: 'GPT-4.1', tier: 'power', description: 'Flagship OpenAI для сложных задач', input: 2.00, output: 8.00 },
  ],
};

export const WIZARD_STEPS = [
  { id: 1, title: 'Провайдер', icon: Settings },
  { id: 2, title: 'Модель и параметры', icon: Brain },
  { id: 3, title: 'Промпты', icon: FileText },
  { id: 4, title: 'Тарифы', icon: DollarSign },
  { id: 5, title: 'Проверка', icon: Shield },
];

export const PROVIDER_COLORS: Record<string, string> = {
  grok: 'bg-purple-500',
  anthropic: 'bg-orange-500',
  gemini: 'bg-blue-500',
  openai: 'bg-green-500',
};

export type RatingConfigFormData = {
  name: string;
  primary_provider: Provider;
  fallback_chain: string[];
  temperature: number;
  timeout: number;
  batch_size: number;
  duplicate_similarity_threshold: number;
  grok_model: string;
  anthropic_model: string;
  gemini_model: string;
  openai_model: string;
  grok_input_price: number;
  grok_output_price: number;
  anthropic_input_price: number;
  anthropic_output_price: number;
  gemini_input_price: number;
  gemini_output_price: number;
  openai_input_price: number;
  openai_output_price: number;
  prompts: Record<string, string>;
};

export const DEFAULT_FORM_DATA: RatingConfigFormData = {
  name: '',
  primary_provider: 'grok',
  fallback_chain: [],
  temperature: 0.2,
  timeout: 120,
  batch_size: 10,
  duplicate_similarity_threshold: 0.75,
  grok_model: 'grok-4-1-fast',
  anthropic_model: 'claude-haiku-4-5',
  gemini_model: 'gemini-2.5-flash',
  openai_model: 'gpt-4.1-mini',
  grok_input_price: 0.20,
  grok_output_price: 0.50,
  anthropic_input_price: 1.00,
  anthropic_output_price: 5.00,
  gemini_input_price: 0.30,
  gemini_output_price: 2.50,
  openai_input_price: 0.40,
  openai_output_price: 1.60,
  prompts: {},
};
