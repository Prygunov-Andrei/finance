/**
 * Хуки для загрузки справочных данных с кешированием
 * 
 * Справочные данные (objects, counterparties, legal-entities и т.д.)
 * редко изменяются, поэтому для них используется длительный staleTime.
 */

import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { CONSTANTS } from '../constants';

// Время кеширования справочных данных (15 минут)
const REFERENCE_STALE_TIME = CONSTANTS.REFERENCE_STALE_TIME_MS;
const GC_TIME = CONSTANTS.QUERY_GC_TIME_MS;

/**
 * Хук для загрузки списка объектов строительства
 */
export const useObjects = (filters?: { status?: string; search?: string }) => {
  return useQuery({
    queryKey: ['objects', filters],
    queryFn: () => api.getObjects(filters),
    staleTime: REFERENCE_STALE_TIME,
    gcTime: GC_TIME,
  });
};

/**
 * Хук для загрузки списка контрагентов
 */
export const useCounterparties = (filters?: { search?: string }) => {
  return useQuery({
    queryKey: ['counterparties', filters],
    queryFn: () => api.getCounterparties(filters),
    staleTime: REFERENCE_STALE_TIME,
    gcTime: GC_TIME,
  });
};

/**
 * Хук для загрузки списка юридических лиц
 */
export const useLegalEntities = () => {
  return useQuery({
    queryKey: ['legal-entities'],
    queryFn: () => api.getLegalEntities(),
    staleTime: REFERENCE_STALE_TIME,
    gcTime: GC_TIME,
  });
};

/**
 * Хук для загрузки списка счетов
 */
export const useAccounts = () => {
  return useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.getAccounts(),
    staleTime: REFERENCE_STALE_TIME,
    gcTime: GC_TIME,
  });
};

/**
 * Хук для загрузки налоговых систем
 */
export const useTaxSystems = () => {
  return useQuery({
    queryKey: ['tax-systems'],
    queryFn: () => api.getTaxSystems(),
    staleTime: REFERENCE_STALE_TIME,
    gcTime: GC_TIME,
  });
};

/**
 * Хук для загрузки категорий расходов
 */
export const useExpenseCategories = () => {
  return useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => api.getExpenseCategories(),
    staleTime: REFERENCE_STALE_TIME,
    gcTime: GC_TIME,
  });
};

/**
 * Хук для загрузки рамочных договоров
 */
export const useFrameworkContracts = () => {
  return useQuery({
    queryKey: ['framework-contracts'],
    queryFn: () => api.getFrameworkContracts(),
    staleTime: REFERENCE_STALE_TIME,
    gcTime: GC_TIME,
  });
};

/**
 * Хук для загрузки прайс-листов
 */
export const usePriceLists = () => {
  return useQuery({
    queryKey: ['price-lists'],
    queryFn: () => api.getPriceLists(),
    staleTime: REFERENCE_STALE_TIME,
    gcTime: GC_TIME,
  });
};

/**
 * Хук для загрузки разрядов рабочих
 */
export const useWorkerGrades = (isActive?: boolean) => {
  return useQuery({
    queryKey: ['worker-grades', isActive],
    queryFn: () => api.getWorkerGrades(isActive),
    staleTime: REFERENCE_STALE_TIME,
    gcTime: GC_TIME,
  });
};

/**
 * Хук для загрузки разделов работ
 */
export const useWorkSections = (tree?: boolean) => {
  return useQuery({
    queryKey: ['work-sections', tree],
    queryFn: () => api.getWorkSections(tree),
    staleTime: REFERENCE_STALE_TIME,
    gcTime: GC_TIME,
  });
};

/**
 * Хук для загрузки условий монтажа
 */
export const useMountingConditions = () => {
  return useQuery({
    queryKey: ['mounting-conditions'],
    queryFn: () => api.getMountingConditions(),
    staleTime: REFERENCE_STALE_TIME,
    gcTime: GC_TIME,
  });
};

/**
 * Хук для загрузки фронта работ
 */
export const useFrontOfWorkItems = () => {
  return useQuery({
    queryKey: ['front-of-work-items'],
    queryFn: () => api.getFrontOfWorkItems(),
    staleTime: REFERENCE_STALE_TIME,
    gcTime: GC_TIME,
  });
};

/**
 * Хук для загрузки категорий каталога
 */
export const useCatalogCategories = () => {
  return useQuery({
    queryKey: ['catalog-categories'],
    queryFn: () => api.getCategories(),
    staleTime: REFERENCE_STALE_TIME,
    gcTime: GC_TIME,
  });
};

/**
 * Хук для загрузки дерева категорий каталога
 */
export const useCatalogCategoryTree = () => {
  return useQuery({
    queryKey: ['catalog-category-tree'],
    queryFn: () => api.getCategoryTree(),
    staleTime: REFERENCE_STALE_TIME,
    gcTime: GC_TIME,
  });
};
