import acRatingApiClient from './acRatingApiClient';
import type {
  ACBrand,
  ACCriterion,
  ACCriterionListItem,
  ACMethodology,
  ACMethodologyListItem,
  ACModelDetail,
  ACModelListItem,
  ACModelPhoto,
  ACModelWritable,
  ACPreset,
  ACPresetWritable,
  ACReview,
  ACSubmissionDetail,
  ACSubmissionListItem,
  BrandsListParams,
  BulkUpdateReviewsResponse,
  BulkUpdateSubmissionsResponse,
  ConvertSubmissionResponse,
  CriteriaListParams,
  EquipmentType,
  GenerateDarkLogosResponse,
  GenerateProsConsResponse,
  ModelsListParams,
  NormalizeLogosResponse,
  PaginatedResponse,
  PresetsListParams,
  RecalculateResponse,
  RegionChoice,
  ReorderPhotosResponse,
  ReviewStatus,
  ReviewsListParams,
  SubmissionPatchPayload,
  SubmissionStatus,
  SubmissionsListParams,
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

function buildCriteriaParams(params?: CriteriaListParams): URLSearchParams {
  const sp = new URLSearchParams();
  if (!params) return sp;
  if (params.value_type) sp.set('value_type', params.value_type);
  if (params.group) sp.set('group', params.group);
  if (params.is_active) sp.set('is_active', params.is_active);
  if (params.is_key_measurement)
    sp.set('is_key_measurement', params.is_key_measurement);
  if (params.search) sp.set('search', params.search);
  if (params.ordering) sp.set('ordering', params.ordering);
  if (params.page) sp.set('page', String(params.page));
  return sp;
}

function buildPresetsParams(params?: PresetsListParams): URLSearchParams {
  const sp = new URLSearchParams();
  if (!params) return sp;
  if (params.is_active) sp.set('is_active', params.is_active);
  if (params.is_all_selected) sp.set('is_all_selected', params.is_all_selected);
  if (params.search) sp.set('search', params.search);
  if (params.ordering) sp.set('ordering', params.ordering);
  if (params.page) sp.set('page', String(params.page));
  return sp;
}

function buildSubmissionsParams(params?: SubmissionsListParams): URLSearchParams {
  const sp = new URLSearchParams();
  if (!params) return sp;
  if (params.status) sp.set('status', params.status);
  if (params.brand !== undefined) sp.set('brand', String(params.brand));
  if (params.has_brand) sp.set('has_brand', params.has_brand);
  if (params.search) sp.set('search', params.search);
  if (params.ordering) sp.set('ordering', params.ordering);
  if (params.page) sp.set('page', String(params.page));
  return sp;
}

function buildReviewsParams(params?: ReviewsListParams): URLSearchParams {
  const sp = new URLSearchParams();
  if (!params) return sp;
  if (params.status) sp.set('status', params.status);
  if (params.model !== undefined) sp.set('model', String(params.model));
  if (params.rating !== undefined) sp.set('rating', String(params.rating));
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

  // ── Criteria (Ф8B-1) ──────────────────────────────────────────────
  async getCriteria(
    params?: CriteriaListParams
  ): Promise<{
    items: ACCriterionListItem[];
    next: string | null;
    count: number | null;
  }> {
    const sp = buildCriteriaParams(params);
    const response = await acRatingApiClient.get<unknown>('/criteria/', {
      params: sp,
    });
    const data = response.data;
    if (Array.isArray(data)) {
      return {
        items: data as ACCriterionListItem[],
        next: null,
        count: data.length,
      };
    }
    const paginated = data as PaginatedResponse<ACCriterionListItem>;
    return {
      items: paginated.results || [],
      next: paginated.next ?? null,
      count: paginated.count ?? null,
    };
  },

  async getCriterion(id: number): Promise<ACCriterion> {
    const response = await acRatingApiClient.get<ACCriterion>(
      `/criteria/${id}/`
    );
    return response.data;
  },

  async createCriterion(payload: FormData): Promise<ACCriterion> {
    const response = await acRatingApiClient.post<ACCriterion>(
      '/criteria/',
      payload,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  },

  async updateCriterion(id: number, payload: FormData): Promise<ACCriterion> {
    const response = await acRatingApiClient.patch<ACCriterion>(
      `/criteria/${id}/`,
      payload,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  },

  async deleteCriterion(id: number): Promise<void> {
    await acRatingApiClient.delete(`/criteria/${id}/`);
  },

  // ── Methodology (Ф8B-1) ───────────────────────────────────────────
  async getMethodologies(): Promise<ACMethodologyListItem[]> {
    const response = await acRatingApiClient.get<unknown>('/methodologies/');
    return normalizeList<ACMethodologyListItem>(response.data);
  },

  async getMethodology(id: number): Promise<ACMethodology> {
    const response = await acRatingApiClient.get<ACMethodology>(
      `/methodologies/${id}/`
    );
    return response.data;
  },

  async activateMethodology(id: number): Promise<ACMethodology> {
    const response = await acRatingApiClient.post<ACMethodology>(
      `/methodologies/${id}/activate/`
    );
    return response.data;
  },

  // ── AI: pros/cons (Ф8B-1) ─────────────────────────────────────────
  async generateModelProsCons(
    modelId: number
  ): Promise<GenerateProsConsResponse> {
    const response = await acRatingApiClient.post<GenerateProsConsResponse>(
      `/models/${modelId}/generate-pros-cons/`
    );
    return response.data;
  },

  // ── Presets (Ф8B-2) ───────────────────────────────────────────────
  async getPresets(
    params?: PresetsListParams
  ): Promise<{
    items: ACPreset[];
    next: string | null;
    count: number | null;
  }> {
    const sp = buildPresetsParams(params);
    const response = await acRatingApiClient.get<unknown>('/presets/', {
      params: sp,
    });
    const data = response.data;
    if (Array.isArray(data)) {
      return { items: data as ACPreset[], next: null, count: data.length };
    }
    const paginated = data as PaginatedResponse<ACPreset>;
    return {
      items: paginated.results || [],
      next: paginated.next ?? null,
      count: paginated.count ?? null,
    };
  },

  async getPreset(id: number): Promise<ACPreset> {
    const response = await acRatingApiClient.get<ACPreset>(`/presets/${id}/`);
    return response.data;
  },

  async createPreset(payload: ACPresetWritable): Promise<ACPreset> {
    const response = await acRatingApiClient.post<ACPreset>(
      '/presets/',
      payload
    );
    return response.data;
  },

  async updatePreset(
    id: number,
    payload: ACPresetWritable
  ): Promise<ACPreset> {
    const response = await acRatingApiClient.patch<ACPreset>(
      `/presets/${id}/`,
      payload
    );
    return response.data;
  },

  async deletePreset(id: number): Promise<void> {
    await acRatingApiClient.delete(`/presets/${id}/`);
  },

  // ── Reviews (Ф8B-2) ───────────────────────────────────────────────
  async getReviews(
    params?: ReviewsListParams
  ): Promise<{
    items: ACReview[];
    next: string | null;
    count: number | null;
  }> {
    const sp = buildReviewsParams(params);
    const response = await acRatingApiClient.get<unknown>('/reviews/', {
      params: sp,
    });
    const data = response.data;
    if (Array.isArray(data)) {
      return { items: data as ACReview[], next: null, count: data.length };
    }
    const paginated = data as PaginatedResponse<ACReview>;
    return {
      items: paginated.results || [],
      next: paginated.next ?? null,
      count: paginated.count ?? null,
    };
  },

  async getReview(id: number): Promise<ACReview> {
    const response = await acRatingApiClient.get<ACReview>(`/reviews/${id}/`);
    return response.data;
  },

  async updateReviewStatus(
    id: number,
    status: ReviewStatus
  ): Promise<ACReview> {
    const response = await acRatingApiClient.patch<ACReview>(
      `/reviews/${id}/`,
      { status }
    );
    return response.data;
  },

  async deleteReview(id: number): Promise<void> {
    await acRatingApiClient.delete(`/reviews/${id}/`);
  },

  async bulkUpdateReviews(
    review_ids: number[],
    status: ReviewStatus
  ): Promise<BulkUpdateReviewsResponse> {
    const response = await acRatingApiClient.post<BulkUpdateReviewsResponse>(
      '/reviews/bulk-update/',
      { review_ids, status }
    );
    return response.data;
  },

  // ── Submissions (Ф8C) ─────────────────────────────────────────────
  async getSubmissions(
    params?: SubmissionsListParams
  ): Promise<{
    items: ACSubmissionListItem[];
    next: string | null;
    count: number | null;
  }> {
    const sp = buildSubmissionsParams(params);
    const response = await acRatingApiClient.get<unknown>('/submissions/', {
      params: sp,
    });
    const data = response.data;
    if (Array.isArray(data)) {
      return {
        items: data as ACSubmissionListItem[],
        next: null,
        count: data.length,
      };
    }
    const paginated = data as PaginatedResponse<ACSubmissionListItem>;
    return {
      items: paginated.results || [],
      next: paginated.next ?? null,
      count: paginated.count ?? null,
    };
  },

  async getSubmission(id: number): Promise<ACSubmissionDetail> {
    const response = await acRatingApiClient.get<ACSubmissionDetail>(
      `/submissions/${id}/`
    );
    return response.data;
  },

  async updateSubmission(
    id: number,
    payload: SubmissionPatchPayload
  ): Promise<ACSubmissionDetail> {
    const response = await acRatingApiClient.patch<ACSubmissionDetail>(
      `/submissions/${id}/`,
      payload
    );
    return response.data;
  },

  async deleteSubmission(id: number): Promise<void> {
    await acRatingApiClient.delete(`/submissions/${id}/`);
  },

  async bulkUpdateSubmissions(
    submission_ids: number[],
    status: SubmissionStatus
  ): Promise<BulkUpdateSubmissionsResponse> {
    const response = await acRatingApiClient.post<BulkUpdateSubmissionsResponse>(
      '/submissions/bulk-update/',
      { submission_ids, status }
    );
    return response.data;
  },

  async convertSubmission(id: number): Promise<ConvertSubmissionResponse> {
    const response = await acRatingApiClient.post<ConvertSubmissionResponse>(
      `/submissions/${id}/convert-to-acmodel/`
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
