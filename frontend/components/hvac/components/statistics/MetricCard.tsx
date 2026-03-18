import React from 'react';
import { Card } from '../ui/card';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  color?: 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'yellow';
  trend?: 'up' | 'down' | 'neutral';
  onClick?: () => void;
}

const colorClasses = {
  blue: 'bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
  green: 'bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400',
  orange: 'bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400',
  red: 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400',
  purple: 'bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
  yellow: 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400',
};

export default function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'blue',
  trend,
  onClick,
}: MetricCardProps) {
  const CardComponent = onClick ? 'button' : 'div';
  const cardProps = onClick
    ? {
        onClick,
        className: 'w-full text-left transition-all hover:shadow-md hover:scale-[1.02] cursor-pointer',
      }
    : {};

  return (
    <CardComponent {...cardProps}>
      <Card className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground mb-2">{title}</p>
            <p className="text-3xl font-semibold mb-1">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </Card>
    </CardComponent>
  );
}
