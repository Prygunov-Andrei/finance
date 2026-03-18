import { useState } from 'react';
import { VendorMatchSuggestion, ParsedVendor } from '../../lib/api';
import { useCounterparties } from '../../hooks';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { PlusCircle, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface CounterpartySelectorProps {
  value: number | null;
  onChange: (id: number | null) => void;
  suggestions?: VendorMatchSuggestion[];
  parsedVendor?: ParsedVendor;
  onCreateNew?: (data: { name: string; inn: string; kpp?: string }) => void;
  disabled?: boolean;
}

export function CounterpartySelector({
  value,
  onChange,
  suggestions = [],
  parsedVendor,
  onCreateNew,
  disabled = false,
}: CounterpartySelectorProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newCounterparty, setNewCounterparty] = useState({
    name: parsedVendor?.name || '',
    inn: parsedVendor?.inn || '',
    kpp: parsedVendor?.kpp || '',
  });

  const { data: counterpartiesData } = useCounterparties();
  const counterparties = Array.isArray(counterpartiesData) 
    ? counterpartiesData 
    : counterpartiesData?.results || [];

  const handleCreateNew = () => {
    if (!newCounterparty.name || !newCounterparty.inn) {
      toast.error('Заполните обязательные поля: Название и ИНН');
      return;
    }

    if (onCreateNew) {
      onCreateNew({
        name: newCounterparty.name,
        inn: newCounterparty.inn,
        kpp: newCounterparty.kpp || undefined,
      });
      setIsCreateDialogOpen(false);
    }
  };

  const handleOpenCreateDialog = () => {
    // Предзаполняем форму данными из парсинга
    setNewCounterparty({
      name: parsedVendor?.name || '',
      inn: parsedVendor?.inn || '',
      kpp: parsedVendor?.kpp || '',
    });
    setIsCreateDialogOpen(true);
  };

  // Собираем список: suggestions первыми, затем остальные
  const suggestionIds = new Set(suggestions.map(s => s.id));
  const otherCounterparties = counterparties.filter(c => !suggestionIds.has(c.id));

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Контрагент</Label>
          {suggestions.length > 0 && (
            <Badge variant="outline" className="text-xs flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Найдено {suggestions.length} похожих
            </Badge>
          )}
        </div>

        <Select
          value={value?.toString() || ''}
          onValueChange={(val) => {
            if (val === 'create-new') {
              handleOpenCreateDialog();
            } else {
              onChange(val ? parseInt(val) : null);
            }
          }}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="Выберите контрагента" />
          </SelectTrigger>
          <SelectContent>
            {/* Suggestions (похожие контрагенты) */}
            {suggestions.length > 0 && (
              <>
                {suggestions.map((suggestion) => (
                  <SelectItem key={`suggestion-${suggestion.id}`} value={suggestion.id.toString()}>
                    <div className="flex items-center justify-between w-full">
                      <span>
                        {suggestion.name}
                        {suggestion.short_name && ` (${suggestion.short_name})`}
                      </span>
                      <Badge className="ml-2 bg-yellow-100 text-yellow-800 text-xs">
                        Похоже {(suggestion.score * 100).toFixed(0)}%
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
                <div className="px-2 py-1 border-t border-gray-200 my-1">
                  <span className="text-xs text-gray-500">Другие контрагенты:</span>
                </div>
              </>
            )}

            {/* Остальные контрагенты */}
            {otherCounterparties.map((counterparty) => (
              <SelectItem key={counterparty.id} value={counterparty.id.toString()}>
                {counterparty.name}
                {counterparty.short_name && ` (${counterparty.short_name})`}
              </SelectItem>
            ))}

            {/* Опция создания нового */}
            <div className="border-t border-gray-200 mt-1">
              <SelectItem value="create-new">
                <div className="flex items-center gap-2 text-blue-600">
                  <PlusCircle className="w-4 h-4" />
                  <span>Создать нового контрагента</span>
                </div>
              </SelectItem>
            </div>
          </SelectContent>
        </Select>

        {/* Показываем данные из парсинга если контрагент не найден */}
        {parsedVendor && !value && (
          <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded border border-gray-200">
            <div className="font-medium mb-1">Данные из счёта:</div>
            <div>{parsedVendor.name}</div>
            <div className="text-gray-500">
              ИНН: {parsedVendor.inn}
              {parsedVendor.kpp && ` • КПП: ${parsedVendor.kpp}`}
            </div>
          </div>
        )}
      </div>

      {/* Dialog создания нового контрагента */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Создать контрагента</DialogTitle>
            <DialogDescription>
              Заполните основную информацию о новом контрагенте
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="name">
                Название <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                value={newCounterparty.name}
                onChange={(e) =>
                  setNewCounterparty({ ...newCounterparty, name: e.target.value })
                }
                placeholder="Название организации"
              />
            </div>
            <div>
              <Label htmlFor="inn">
                ИНН <span className="text-red-500">*</span>
              </Label>
              <Input
                id="inn"
                value={newCounterparty.inn}
                onChange={(e) =>
                  setNewCounterparty({ ...newCounterparty, inn: e.target.value })
                }
                placeholder="1234567890"
                maxLength={12}
              />
            </div>
            <div>
              <Label htmlFor="kpp">КПП</Label>
              <Input
                id="kpp"
                value={newCounterparty.kpp}
                onChange={(e) =>
                  setNewCounterparty({ ...newCounterparty, kpp: e.target.value })
                }
                placeholder="123456789"
                maxLength={9}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleCreateNew}>Создать</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}