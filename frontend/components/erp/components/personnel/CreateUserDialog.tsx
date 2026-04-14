import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, UserPlus } from 'lucide-react';

const CYR_MAP: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh', 'з': 'z', 'и': 'i',
  'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't',
  'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '',
  'э': 'e', 'ю': 'yu', 'я': 'ya',
};

function translit(text: string): string {
  return text.toLowerCase().split('').map((ch) => CYR_MAP[ch] ?? ch).join('');
}

export function suggestUsername(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const lastname = translit(parts[0]).replace(/[^a-z0-9]/g, '');
  if (parts.length < 2) return lastname;
  const firstInitial = translit(parts[1].charAt(0)).replace(/[^a-z0-9]/g, '');
  return firstInitial ? `${lastname}.${firstInitial}` : lastname;
}

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: number;
  employeeFullName: string;
  onSuccess: (userId: number, username: string) => void;
}

export function CreateUserDialog({ open, onOpenChange, employeeId, employeeFullName, onSuccess }: CreateUserDialogProps) {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');

  useEffect(() => {
    if (open) {
      setUsername(suggestUsername(employeeFullName));
    }
  }, [open, employeeFullName]);

  const createUserMutation = useMutation({
    mutationFn: () => api.personnel.createUserForEmployee(employeeId, { username: username.trim() }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['users-for-link'] });
      toast.success(`Учётная запись «${data.username}» создана`);
      onSuccess(data.id, data.username);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(`Ошибка: ${e?.message}`),
  });

  const trimmed = username.trim();
  const canSubmit = trimmed.length >= 3 && !createUserMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" /> Создать учётную запись
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Будет создан User в ERP и привязан к сотруднику {employeeFullName}. Пароль задаётся отдельно.
          </p>
          <div>
            <Label htmlFor="new_username">Логин</Label>
            <Input
              id="new_username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="savinov.a"
              autoFocus
            />
            <p className="text-xs text-muted-foreground mt-1">
              По умолчанию предлагается транслит ФИО. Можно изменить.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button
            onClick={() => createUserMutation.mutate()}
            disabled={!canSubmit}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {createUserMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Создание...</>
            ) : (
              <><UserPlus className="w-4 h-4 mr-1" /> Создать</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
