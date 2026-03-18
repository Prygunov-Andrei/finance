import { Construction } from 'lucide-react';
import { Badge } from './ui/badge';

interface StubPageProps {
  title: string;
  description?: string;
  parentSection?: string;
}

export const StubPage = ({ title, description, parentSection }: StubPageProps) => (
  <div className="p-8 flex flex-col items-center justify-center min-h-[60vh]">
    <Construction className="w-16 h-16 text-gray-300 mb-4" />
    <h1 className="text-2xl font-semibold text-gray-700 mb-2">{title}</h1>
    <p className="text-gray-500">Раздел в разработке</p>
    {description && (
      <p className="text-gray-400 mt-2 text-sm max-w-md text-center">{description}</p>
    )}
    {parentSection && (
      <Badge variant="outline" className="mt-4">{parentSection}</Badge>
    )}
  </div>
);
