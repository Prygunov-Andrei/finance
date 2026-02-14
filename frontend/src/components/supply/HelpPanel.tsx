import { useState } from 'react';
import { HelpCircle, X, ChevronDown, ChevronRight, BookOpen } from 'lucide-react';

// =============================================================================
// Типы
// =============================================================================

interface HelpSection {
  title: string;
  content: string[];
}

interface RoleGuide {
  role: string;
  description: string;
  sections: HelpSection[];
}

// =============================================================================
// Данные инструкций
// =============================================================================

const GUIDES: RoleGuide[] = [
  {
    role: 'Оператор-Снабженец',
    description: 'Обработка запросов из Bitrix24, проверка распознанных счетов',
    sections: [
      {
        title: 'Как работать со счетами',
        content: [
          '1. Перейдите в «Снабжение» → «Счета на оплату»',
          '2. Счета со статусом «На проверке» требуют вашего внимания',
          '3. Откройте счёт и проверьте данные, распознанные LLM:',
          '   — Номер и дата счёта',
          '   — Контрагент (поставщик)',
          '   — Позиции: наименование, количество, цена',
          '   — Объект и договор',
          '4. Если товар распознан неверно — исправьте вручную',
          '5. Если товар-дубликат — объедините через «Модерация товаров»',
          '6. После проверки нажмите «В реестр» — счёт перейдёт к директору',
        ],
      },
      {
        title: 'Запросы из Битрикс',
        content: [
          '1. Перейдите в «Снабжение» → «Запросы из Битрикс»',
          '2. Здесь отображаются все запросы, пришедшие из Bitrix24',
          '3. Статусы:',
          '   — «Получен» — только что пришёл',
          '   — «В обработке» — система скачивает файлы и распознаёт',
          '   — «Завершён» — счета созданы и готовы к проверке',
          '   — «Ошибка» — что-то пошло не так (см. описание ошибки)',
          '4. При ошибке маппинга (объект/договор не найден) — исправьте привязки вручную',
        ],
      },
      {
        title: 'Модерация товаров',
        content: [
          '1. Перейдите в «Каталог» → «Модерация товаров»',
          '2. Здесь отображаются новые товары, добавленные из счетов',
          '3. Проверьте, нет ли дубликатов (например, «Болт 6мм» и «Болт 6 мм»)',
          '4. Если дубликат — создайте алиас для объединения',
          '5. Верно распознанные товары подтвердите',
        ],
      },
    ],
  },
  {
    role: 'Линейный бухгалтер',
    description: 'Периодические платежи и учёт доходов',
    sections: [
      {
        title: 'Периодические платежи',
        content: [
          '1. Перейдите в «Снабжение» → «Периодические платежи»',
          '2. Нажмите «Создать» для нового периодического платежа',
          '3. Заполните:',
          '   — Название (например, «Аренда офиса»)',
          '   — Контрагент (арендодатель)',
          '   — Сумма и частота (ежемесячно, ежеквартально, ежегодно)',
          '   — День месяца для генерации счёта',
          '   — Счёт списания и юридическое лицо',
          '4. Система будет автоматически создавать счета в реестр',
          '5. Если сумма меняется — обновите запись перед следующей генерацией',
          '6. Для прекращения — установите дату окончания или деактивируйте',
        ],
      },
      {
        title: 'Учёт доходов',
        content: [
          '1. Перейдите в «Снабжение» → «Доходы»',
          '2. Нажмите «Создать» для новой записи',
          '3. Заполните:',
          '   — Счёт зачисления',
          '   — Сумму и дату',
          '   — Контрагент и договор (если есть)',
          '   — Категорию дохода',
          '4. Прикрепите скан документа (если есть)',
          '5. Доход сразу отразится в балансе счёта',
        ],
      },
    ],
  },
  {
    role: 'Директор-контролёр',
    description: 'Одобрение платежей, управление кредиторской задолженностью',
    sections: [
      {
        title: 'Дашборд',
        content: [
          '1. Перейдите в «Снабжение» → «Дашборд»',
          '2. Здесь вы видите полную картину:',
          '   — Остатки на всех счетах (внутренние и банковские)',
          '   — Общая сумма счетов, ожидающих оплаты',
          '   — Просроченные счета (требуют немедленного внимания)',
          '   — Разбивка по объектам и категориям',
          '3. Используйте эту информацию для принятия решений об оплатах',
        ],
      },
      {
        title: 'Одобрение счетов',
        content: [
          '1. Перейдите в «Снабжение» → «Счета на оплату»',
          '2. Отфильтруйте по статусу «В реестре»',
          '3. Для каждого счёта доступны действия:',
          '   — «Одобрить» — счёт уйдёт в банк для оплаты',
          '   — «Отклонить» — с комментарием, вернётся оператору',
          '   — «Перенести» — установить новую дату оплаты',
          '4. Перед одобрением проверьте:',
          '   — PDF-скан счёта (кнопка «Скачать»)',
          '   — Привязку к объекту и договору',
          '   — Позиции и суммы',
          '   — Достаточно ли средств на счёте',
        ],
      },
      {
        title: 'Управление приоритетами',
        content: [
          '1. Счета с иконкой «просрочен» требуют внимания в первую очередь',
          '2. Используйте «Перенести» чтобы спланировать оплаты',
          '3. Отклоняйте счета с ошибками — оператор исправит и отправит повторно',
          '4. После одобрения платёж автоматически отправляется в банк',
        ],
      },
    ],
  },
];

// =============================================================================
// Компонент HelpPanel
// =============================================================================

export const HelpPanel = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const handleToggleRole = (role: string) => {
    setExpandedRole(expandedRole === role ? null : role);
  };

  const handleToggleSection = (key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-white shadow-lg hover:bg-blue-700 transition-colors"
        aria-label="Открыть справку"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setIsOpen(true);
        }}
      >
        <HelpCircle className="w-5 h-5" />
        <span className="text-sm font-medium">Справка</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-96 bg-white shadow-2xl border-l border-gray-200 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-blue-50">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">Инструкции</h2>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="p-1 rounded hover:bg-blue-100 transition-colors"
          aria-label="Закрыть справку"
          tabIndex={0}
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <p className="text-sm text-gray-500 mb-4">
          Выберите вашу роль, чтобы увидеть инструкции по работе с системой.
        </p>

        {GUIDES.map((guide) => (
          <div key={guide.role} className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Role header */}
            <button
              onClick={() => handleToggleRole(guide.role)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
              aria-expanded={expandedRole === guide.role}
              tabIndex={0}
            >
              <div>
                <div className="font-medium text-gray-900">{guide.role}</div>
                <div className="text-xs text-gray-500 mt-0.5">{guide.description}</div>
              </div>
              {expandedRole === guide.role ? (
                <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
              )}
            </button>

            {/* Sections */}
            {expandedRole === guide.role && (
              <div className="border-t border-gray-200">
                {guide.sections.map((section, idx) => {
                  const sectionKey = `${guide.role}-${idx}`;
                  const isExpanded = expandedSections.has(sectionKey);

                  return (
                    <div key={sectionKey} className="border-b border-gray-100 last:border-b-0">
                      <button
                        onClick={() => handleToggleSection(sectionKey)}
                        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-blue-50 transition-colors text-left"
                        aria-expanded={isExpanded}
                        tabIndex={0}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        )}
                        <span className="text-sm font-medium text-gray-700">{section.title}</span>
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-3 space-y-1">
                          {section.content.map((line, lineIdx) => (
                            <p
                              key={lineIdx}
                              className={`text-sm text-gray-600 ${
                                line.startsWith('   ') ? 'ml-4' : ''
                              }`}
                            >
                              {line.trim()}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
        <p className="text-xs text-gray-400 text-center">
          Полная документация: docs/supply/WORKFLOW.md
        </p>
      </div>
    </div>
  );
};
