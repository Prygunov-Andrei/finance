import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { BookOpen, FileText, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Alert, AlertDescription } from '../ui/alert';

interface HelpSection {
  id: string;
  title: string;
  description: string;
  path: string;
  icon?: string;
}

interface HelpIndex {
  title: string;
  sections: HelpSection[];
}

export const HelpIndexPage = () => {
  const navigate = useNavigate();
  const [index, setIndex] = useState<HelpIndex | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/help/index.json')
      .then((res) => {
        if (!res.ok) throw new Error('Не удалось загрузить индекс справки');
        return res.json();
      })
      .then((data: HelpIndex) => {
        setIndex(data);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <BookOpen className="w-8 h-8 text-blue-600" />
        <h1 className="text-2xl font-semibold">{index?.title || 'Справка'}</h1>
      </div>

      <p className="text-muted-foreground">
        Добро пожаловать в справочную систему. Выберите интересующий раздел.
      </p>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {index?.sections.map((section) => (
          <Card
            key={section.id}
            className="cursor-pointer hover:border-blue-300 hover:shadow-md transition-all"
            tabIndex={0}
            role="button"
            aria-label={`Открыть раздел: ${section.title}`}
            onClick={() => navigate(section.path)}
            onKeyDown={(e) => { if (e.key === 'Enter') navigate(section.path); }}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-500" />
                {section.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{section.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
