import MainLayout from '../components/MainLayout';
import ApiDiagnostics from '../components/ApiDiagnostics';
import { useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function ApiSettings() {
  const navigate = useNavigate();

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="mb-4"
          >
            <ArrowLeft className="size-4 mr-2" />
            Назад
          </Button>
          <h1 className="text-3xl font-bold">Настройки подключения к API</h1>
          <p className="text-muted-foreground mt-2">
            Измените URL backend API и проверьте доступность сервера
          </p>
        </div>

        <ApiDiagnostics />
      </div>
    </MainLayout>
  );
}
