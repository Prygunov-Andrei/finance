import acRatingApiClient from './acRatingApiClient';
import type {
  ACBrand,
  ACModelDetail,
  ACModelListItem,
  ACModelPhoto,
  ACModelWritable,
  BrandsListParams,
  EquipmentType,
  GenerateDarkLogosResponse,
  ModelsListParams,
  NormalizeLogosResponse,
  PaginatedResponse,
  RecalculateResponse,
  RegionChoice,
  ReorderPhotosResponse,
} from './acRatingTypes';

// Бэкенд возвращает либо DRF-paginated, либо plain list — нормализуем.
function normalizeList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object' && 'results' in (data as object)) {
    const r = (data as { results?: unknown }).results;
    return Array.isArray(r) ? (r as T[]) : [];
  }
  return [];
}

function buildModelsParams(params?: ModelsListParams): URLSearchParams {
  const sp = new URLSearchParams();
  if (!params) return sp;
  if (params.brand && params.brand.length > 0) {
    for (const id of params.brand) sp.append('brand', String(id));
  }
  if (params.publish_status) sp.set('publish_status', params.publish_status);
  if (params.equipment_type !== undefined && params.equipment_type !== null) {
    sp.set('equipment_type', String(params.equipment_type));
  }
  if (params.region) sp.set('region', params.region);
  if (params.search) sp.set('search', params.search);
  if (params.ordering) sp.set('ordering', params.ordering);
  if (params.page) sp.set('page', String(params.page));
  return sp;
}

function buildBrandsParams(params?: BrandsListParams): URLSearchParams {
  const sp = new URLSearchParams();
  if (!params) return sp;
  if (params.is_active) sp.set('is_active', params.is_active);
  if (params.origin_class !== undefined) {
    sp.set('origin_class', String(params.origin_class));
  }
  if (params.search) sp.set('search', params.search);
  if (params.ordering) sp.set('ordering', params.ordering);
  if (params.page) sp.set('page', String(params.page));
  return sp;
}

const acRatingService = {
  // ── Models ────────────────────────────────────────────────────────
  async getModels(
    params?: ModelsListParams
  ): Promise<{
    items: ACModelListItem[];
    next: string | null;
    count: number | null;
  }> {
    const sp = buildModelsParams(params);
    const response = await acRatingApiClient.get<unknown>('/models/', {
      params: sp,
    });
    const data = response.data;
    if (Array.isArray(data)) {
      return { items: data as ACModelListItem[], next: null, count: data.length };
    }
    const paginated = data as PaginatedResponse<ACModelListItem>;
    return {
      items: paginated.results || [],
      next: paginated.next ?? null,
      count: paginated.count ?? null,
    };
  },

  async getModel(id: number): Promise<ACModelDetail> {
    const response = await acRatingApiClient.get<ACModelDetail>(
      `/models/${id}/`
    );
    return response.data;
  },

  async createModel(payload: ACModelWritable): Promise<ACModelDetail> {
    const response = await acRatingApiClient.post<ACModelDetail>(
      '/models/',
      payload
    );
    return response.data;
  },

  async updateModel(
    id: number,
    payload: ACModelWritable
  ): Promise<ACModelDetail> {
    const response = await acRatingApiClient.patch<ACModelDetail>(
      `/models/${id}/`,
      payload
    );
    return response.data;
  },

  async deleteModel(id: number): Promise<void> {
    await acRatingApiClient.delete(`/models/${id}/`);
  },

  async recalculateModel(id: number): Promise<RecalculateResponse> {
    const response = await acRatingApiClient.post<RecalculateResponse>(
      `/models/${id}/recalculate/`
    );
    return response.data;
  },

  // ── Photos ────────────────────────────────────────────────────────
  async getModelPhotos(modelId: number): Promise<ACModelPhoto[]> {
    const response = await acRatingApiClient.get<unknown>(
      `/models/${modelId}/photos/`
    );
    return normalizeList<ACModelPhoto>(response.data);
  },

  async uploadModelPhoto(
    modelId: number,
    image: File,
    alt?: string,
    order?: number
  ): Promise<ACModelPhoto> {
    const fd = new FormData();
    fd.append('image', image);
    if (alt !== undefined) fd.append('alt', alt);
    if (order !== undefined) fd.append('order', String(order));
    const response = await acRatingApiClient.post<ACModelPhoto>(
      `/models/${modelId}/photos/`,
      fd,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  },

  async updateModelPhoto(
    modelId: number,
    photoId: number,
    payload: { alt?: string; order?: number }
  ): Promise<ACModelPhoto> {
    const response = await acRatingApiClient.patch<ACModelPhoto>(
      `/models/${modelId}/photos/${photoId}/`,
      payload
    );
    return response.data;
  },

  async deleteModelPhoto(modelId: number, photoId: number): Promise<void> {
    await acRatingApiClient.delete(`/models/${modelId}/photos/${photoId}/`);
  },

  async reorderModelPhotos(
    modelId: number,
    ids: number[]
  ): Promise<ReorderPhotosResponse> {
    const response = await acRatingApiClient.post<ReorderPhotosResponse>(
      `/models/${modelId}/photos/reorder/`,
      { ids }
    );
    return response.data;
  },

  // ── Brands ────────────────────────────────────────────────────────
  async getBrands(
    params?: BrandsListParams
  ): Promise<{
    items: ACBrand[];
    next: string | null;
    count: number | null;
  }> {
    const sp = buildBrandsParams(params);
    const response = await acRatingApiClient.get<unknown>('/brands/', {
      params: sp,
    });
    const data = response.data;
    if (Array.isArray(data)) {
      return { items: data as ACBrand[], next: null, count: data.length };
    }
    const paginated = data as PaginatedResponse<ACBrand>;
    return {
      items: paginated.results || [],
      next: paginated.next ?? null,
      count: paginated.count ?? null,
    };
  },

  async getBrand(id: number): Promise<ACBrand> {
    const response = await acRatingApiClient.get<ACBrand>(`/brands/${id}/`);
    return response.data;
  },

  async createBrand(payload: FormData): Promise<ACBrand> {
    const response = await acRatingApiClient.post<ACBrand>(
      '/brands/',
      payload,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  },

  async updateBrand(id: number, payload: FormData): Promise<ACBrand> {
    const response = await acRatingApiClient.patch<ACBrand>(
      `/brands/${id}/`,
      payload,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  },

  async deleteBrand(id: number): Promise<void> {
    await acRatingApiClient.delete(`/brands/${id}/`);
  },

  async normalizeBrandLogos(
    brand_ids?: number[]
  ): Promise<NormalizeLogosResponse> {
    const body = brand_ids && brand_ids.length > 0 ? { brand_ids } : {};
    const response = await acRatingApiClient.post<NormalizeLogosResponse>(
      '/brands/normalize-logos/',
      body
    );
    return response.data;
  },

  async generateDarkLogos(
    brand_ids?: number[]
  ): Promise<GenerateDarkLogosResponse> {
    const body = brand_ids && brand_ids.length > 0 ? { brand_ids } : {};
    const response = await acRatingApiClient.post<GenerateDarkLogosResponse>(
      '/brands/generate-dark-logos/',
      body
    );
    return response.data;
  },

  // ── Reference data ────────────────────────────────────────────────
  async getEquipmentTypes(): Promise<EquipmentType[]> {
    const response = await acRatingApiClient.get<unknown>('/equipment-types/');
    return normalizeList<EquipmentType>(response.data);
  },

  async getRegions(): Promise<RegionChoice[]> {
    const response = await acRatingApiClient.get<unknown>('/regions/');
    return normalizeList<RegionChoice>(response.data);
  },
};

export default acRatingService;
