import { EstimateSection, EstimateSubsection } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Plus, Edit2, Trash2, FileText } from 'lucide-react';

interface EstimateSectionsTabProps {
  sections: EstimateSection[];
  onAddSection: () => void;
  onEditSection: (section: EstimateSection) => void;
  onDeleteSection: (sectionId: number) => void;
  onAddSubsection: (sectionId: number) => void;
  onEditSubsection: (subsection: EstimateSubsection) => void;
  onDeleteSubsection: (subsectionId: number) => void;
  onUpdateSectionMarkup?: (sectionId: number, data: Partial<EstimateSection>) => void;
}

export function EstimateSectionsTab({
  sections,
  onAddSection,
  onEditSection,
  onDeleteSection,
  onAddSubsection,
  onEditSubsection,
  onDeleteSubsection,
  onUpdateSectionMarkup,
}: EstimateSectionsTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={onAddSection} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          Добавить раздел
        </Button>
      </div>

      {sections.length > 0 ? (
        <Accordion type="multiple" className="space-y-4">
          {sections.map((section) => (
            <AccordionItem key={section.id} value={`section-${section.id}`} className="bg-card rounded-xl shadow-sm border border-border">
              <AccordionTrigger className="px-6 py-4 hover:no-underline">
                <div className="flex items-center justify-between w-full pr-4">
                  <div className="flex items-center gap-4">
                    <span className="font-semibold text-foreground">{section.name}</span>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-right">
                      <div className="text-muted-foreground">Продажа</div>
                      <div className="font-medium text-foreground">{formatCurrency(section.total_sale)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-muted-foreground">Закупка</div>
                      <div className="font-medium text-foreground">{formatCurrency(section.total_purchase)}</div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="p-2 hover:bg-muted rounded-lg transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditSection(section);
                        }}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        className="p-2 hover:bg-muted rounded-lg transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSection(section.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                <div className="space-y-4">
                  <div className="flex items-end gap-4 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onAddSubsection(section.id)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Добавить подраздел
                    </Button>
                    {onUpdateSectionMarkup && (
                      <>
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs text-muted-foreground">Наценка мат. %</Label>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="По умолчанию"
                            defaultValue={section.material_markup_percent ?? ''}
                            onBlur={(e) => {
                              const newVal = e.target.value || null;
                              if (newVal !== (section.material_markup_percent ?? null)) {
                                onUpdateSectionMarkup(section.id, { material_markup_percent: newVal });
                              }
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            className="h-8 w-36 text-sm"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs text-muted-foreground">Наценка раб. %</Label>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="По умолчанию"
                            defaultValue={section.work_markup_percent ?? ''}
                            onBlur={(e) => {
                              const newVal = e.target.value || null;
                              if (newVal !== (section.work_markup_percent ?? null)) {
                                onUpdateSectionMarkup(section.id, { work_markup_percent: newVal });
                              }
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            className="h-8 w-36 text-sm"
                          />
                        </div>
                      </>
                    )}
                  </div>

                  {section.subsections.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-muted border-b">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Название</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Материалы (продажа)</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Работы (продажа)</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Материалы (закупка)</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Работы (закупка)</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Итого продажа</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Итого закупка</th>
                            <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">Действия</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {section.subsections.map((subsection) => (
                            <tr key={subsection.id} className="hover:bg-muted">
                              <td className="px-4 py-3 text-sm text-foreground">{subsection.name}</td>
                              <td className="px-4 py-3 text-sm text-right text-foreground">{formatCurrency(subsection.materials_sale)}</td>
                              <td className="px-4 py-3 text-sm text-right text-foreground">{formatCurrency(subsection.works_sale)}</td>
                              <td className="px-4 py-3 text-sm text-right text-foreground">{formatCurrency(subsection.materials_purchase)}</td>
                              <td className="px-4 py-3 text-sm text-right text-foreground">{formatCurrency(subsection.works_purchase)}</td>
                              <td className="px-4 py-3 text-sm text-right font-medium text-foreground">{formatCurrency(subsection.total_sale)}</td>
                              <td className="px-4 py-3 text-sm text-right font-medium text-foreground">{formatCurrency(subsection.total_purchase)}</td>
                              <td className="px-4 py-3 text-center">
                                <div className="flex justify-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onEditSubsection(subsection)}
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onDeleteSubsection(subsection.id)}
                                  >
                                    <Trash2 className="w-4 h-4 text-red-600" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-4 text-sm">Нет подразделов</p>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      ) : (
        <div className="bg-card rounded-xl shadow-sm border border-border p-12 text-center">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Нет разделов</p>
        </div>
      )}
    </div>
  );
}
