'use client';

import { createContext, useContext } from 'react';
import { api } from './index';

/**
 * Тип API для работы со сметами.
 * Извлекается из api.estimates — все методы для CRUD, matching, import, export.
 */
export type EstimateApi = typeof api.estimates;

/**
 * Контекст для injection API клиента в компоненты смет.
 *
 * ERP: использует api.estimates (default)
 * Public portal: использует publicApi.estimates (другой base URL + auth)
 *
 * Это позволяет переиспользовать компоненты смет (EstimateItemsEditor,
 * WorkMatchingDialog, AutoMatchDialog, EstimateImportDialog) без изменений.
 */
const EstimateApiContext = createContext<EstimateApi>(api.estimates);

export const EstimateApiProvider = EstimateApiContext.Provider;

export function useEstimateApi(): EstimateApi {
  return useContext(EstimateApiContext);
}
