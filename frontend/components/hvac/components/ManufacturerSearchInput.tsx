import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, Loader2 } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import referencesService, { ManufacturerSearchResult } from '../services/referencesService';

interface ManufacturerSearchInputProps {
  value: ManufacturerSearchResult | null;
  onChange: (manufacturer: ManufacturerSearchResult | null) => void;
  onCreateNew?: () => void;
  placeholder?: string;
  error?: string;
}

export default function ManufacturerSearchInput({
  value,
  onChange,
  onCreateNew,
  placeholder = 'Поиск производителя...',
  error
}: ManufacturerSearchInputProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<ManufacturerSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Обработка клика вне выпадающего списка
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Обновление отображаемого значения при изменении value
  useEffect(() => {
    if (value) {
      setSearchQuery(value.name);
    } else {
      setSearchQuery('');
    }
  }, [value]);

  const searchManufacturers = async (query: string) => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const data = await referencesService.searchManufacturers(query, 20);
      setResults(data);
      setShowDropdown(true);
    } catch (err) {
      console.error('Error searching manufacturers:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);

    // Очищаем текущее значение, если пользователь начал редактировать
    if (value) {
      onChange(null);
    }

    // Debounce поиска
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      searchManufacturers(query);
    }, 300);
  };

  const handleSelectManufacturer = (manufacturer: ManufacturerSearchResult) => {
    onChange(manufacturer);
    setSearchQuery(manufacturer.name);
    setShowDropdown(false);
  };

  const handleFocus = () => {
    if (searchQuery.length >= 2 && results.length > 0) {
      setShowDropdown(true);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          type="text"
          value={searchQuery}
          onChange={handleInputChange}
          onFocus={handleFocus}
          placeholder={placeholder}
          className={`pl-9 pr-9 ${error ? 'border-destructive' : ''}`}
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive mt-1">{error}</p>
      )}

      {/* Выбранный производитель */}
      {value && (
        <div className="mt-2 p-3 bg-muted rounded-lg flex items-center justify-between">
          <div>
            <p className="font-medium">{value.name}</p>
            {value.region && (
              <p className="text-sm text-muted-foreground">{value.region}</p>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(null);
              setSearchQuery('');
            }}
          >
            Изменить
          </Button>
        </div>
      )}

      {/* Выпадающий список результатов */}
      {showDropdown && !value && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {results.map((manufacturer) => (
            <button
              key={manufacturer.id}
              type="button"
              onClick={() => handleSelectManufacturer(manufacturer)}
              className="w-full px-4 py-3 text-left hover:bg-muted transition-colors border-b last:border-b-0"
            >
              <p className="font-medium">{manufacturer.name}</p>
              {manufacturer.region && (
                <p className="text-sm text-muted-foreground">{manufacturer.region}</p>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Кнопка создания нового производителя */}
      {showDropdown && !value && searchQuery.length >= 2 && onCreateNew && (
        <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg">
          {results.length > 0 && (
            <div className="border-b" />
          )}
          <button
            type="button"
            onClick={() => {
              setShowDropdown(false);
              onCreateNew();
            }}
            className="w-full px-4 py-3 text-left hover:bg-muted transition-colors flex items-center gap-2 text-primary"
          >
            <Plus className="w-4 h-4" />
            <span>Создать нового производителя "{searchQuery}"</span>
          </button>
        </div>
      )}
    </div>
  );
}
