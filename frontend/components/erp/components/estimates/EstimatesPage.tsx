import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Estimates } from './Estimates';
import { MountingEstimates } from './MountingEstimates';

type Tab = 'estimates' | 'mounting';

export function EstimatesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as Tab) || 'estimates';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setSearchParams(tab === 'estimates' ? {} : { tab });
  };

  return (
    <div>
      <div className="border-b border-gray-200 mb-4">
        <nav className="flex gap-4 -mb-px" aria-label="Tabs">
          <button
            onClick={() => handleTabChange('estimates')}
            className={`py-2 px-1 border-b-2 text-sm font-medium transition-colors ${
              activeTab === 'estimates'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            aria-label="Сметы"
            tabIndex={0}
          >
            Сметы
          </button>
          <button
            onClick={() => handleTabChange('mounting')}
            className={`py-2 px-1 border-b-2 text-sm font-medium transition-colors ${
              activeTab === 'mounting'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            aria-label="Монтажные сметы"
            tabIndex={0}
          >
            Монтажные сметы
          </button>
        </nav>
      </div>
      {activeTab === 'estimates' ? <Estimates /> : <MountingEstimates />}
    </div>
  );
}
