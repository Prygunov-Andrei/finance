import type { RequestFn } from './types';
import type {
  AutoMatchResult, ColumnConfigTemplate, ColumnDef, CreateEstimateItemData,
  EstimateCharacteristic, EstimateCreateRequest, EstimateDetail,
  EstimateImportPreview, EstimateImportProgress, EstimateItem, EstimateList,
  EstimatePdfImportSession, EstimateSection, EstimateSubsection,
  MountingEstimateCreateRequest, MountingEstimateDetail, MountingEstimateList,
  PaginatedResponse, ProjectDetail, ProjectFile, ProjectFileType, ProjectList,
  ProjectNote,
  WorkMatchingSession, WorkMatchingProgress, WorkMatchingApplyItem, WorkMatchingApplyResult,
} from '../types';

const API_BASE_URL = '/api/erp';

export function createEstimatesService(request: RequestFn) {
  return {
    // ==================== PROJECTS ====================

    async getProjects(params?: {
      object?: number;
      stage?: 'П' | 'РД';
      is_approved_for_production?: boolean;
      primary_check_done?: boolean;
      secondary_check_done?: boolean;
      search?: string;
    }) {
      const queryParams = new URLSearchParams();
      if (params?.object) queryParams.append('object', params.object.toString());
      if (params?.stage) queryParams.append('stage', params.stage);
      if (params?.is_approved_for_production !== undefined) queryParams.append('is_approved_for_production', params.is_approved_for_production.toString());
      if (params?.primary_check_done !== undefined) queryParams.append('primary_check_done', params.primary_check_done.toString());
      if (params?.secondary_check_done !== undefined) queryParams.append('secondary_check_done', params.secondary_check_done.toString());
      if (params?.search) queryParams.append('search', params.search);

      const url = `/projects/${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await request<PaginatedResponse<ProjectList> | ProjectList[]>(url);

      if (response && typeof response === 'object' && 'results' in response) {
        return response.results;
      }
      return response as ProjectList[];
    },

    async getProjectDetail(id: number) {
      return request<ProjectDetail>(`/projects/${id}/`);
    },

    async createProject(data: FormData) {
      return request<ProjectDetail>('/projects/', {
        method: 'POST',
        body: data,
      });
    },

    async updateProject(id: number, data: FormData) {
      return request<ProjectDetail>(`/projects/${id}/`, {
        method: 'PATCH',
        body: data,
      });
    },

    async createProjectVersion(id: number) {
      return request<ProjectDetail>(`/projects/${id}/create-version/`, { method: 'POST' });
    },

    async getProjectVersions(id: number) {
      return request<ProjectList[]>(`/projects/${id}/versions/`);
    },

    async primaryCheckProject(id: number) {
      return request<ProjectDetail>(`/projects/${id}/primary-check/`, { method: 'POST' });
    },

    async secondaryCheckProject(id: number) {
      return request<ProjectDetail>(`/projects/${id}/secondary-check/`, { method: 'POST' });
    },

    async approveProduction(id: number, file: File) {
      const formData = new FormData();
      formData.append('production_approval_file', file);
      return request<ProjectDetail>(`/projects/${id}/approve-production/`, {
        method: 'POST',
        body: formData,
      });
    },

    // Project Notes
    async getProjectNotes(projectId?: number) {
      const url = projectId ? `/project-notes/?project=${projectId}` : '/project-notes/';
      const response = await request<PaginatedResponse<ProjectNote> | ProjectNote[]>(url);

      if (response && typeof response === 'object' && 'results' in response) {
        return response.results;
      }
      return response as ProjectNote[];
    },

    async createProjectNote(data: { project: number; text: string }) {
      return request<ProjectNote>('/project-notes/', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async updateProjectNote(id: number, data: { text: string }) {
      return request<ProjectNote>(`/project-notes/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    async deleteProjectNote(id: number) {
      return request<void>(`/project-notes/${id}/`, { method: 'DELETE' });
    },

    // ==================== PROJECT FILE TYPES ====================

    async getProjectFileTypes(params?: { is_active?: boolean }) {
      const queryParams = new URLSearchParams();
      if (params?.is_active !== undefined) queryParams.append('is_active', params.is_active.toString());
      const url = `/project-file-types/${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await request<PaginatedResponse<ProjectFileType> | ProjectFileType[]>(url);
      if (response && typeof response === 'object' && 'results' in response) {
        return response.results;
      }
      return response as ProjectFileType[];
    },

    async createProjectFileType(data: { name: string; code: string; sort_order?: number; is_active?: boolean }) {
      return request<ProjectFileType>('/project-file-types/', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async updateProjectFileType(id: number, data: Partial<{ name: string; code: string; sort_order: number; is_active: boolean }>) {
      return request<ProjectFileType>(`/project-file-types/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    async deleteProjectFileType(id: number) {
      return request<void>(`/project-file-types/${id}/`, { method: 'DELETE' });
    },

    // ==================== PROJECT FILES ====================

    async getProjectFiles(projectId: number) {
      const url = `/project-files/?project=${projectId}`;
      const response = await request<PaginatedResponse<ProjectFile> | ProjectFile[]>(url);
      if (response && typeof response === 'object' && 'results' in response) {
        return response.results;
      }
      return response as ProjectFile[];
    },

    async uploadProjectFile(data: FormData) {
      return request<ProjectFile>('/project-files/', {
        method: 'POST',
        body: data,
      });
    },

    async updateProjectFile(id: number, data: Partial<{ title: string; file_type: number }>) {
      return request<ProjectFile>(`/project-files/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    async deleteProjectFile(id: number) {
      return request<void>(`/project-files/${id}/`, { method: 'DELETE' });
    },

    // ==================== ESTIMATES ====================

    async getEstimates(params?: {
      object?: number;
      legal_entity?: number;
      status?: string;
      approved_by_customer?: boolean;
      search?: string;
    }) {
      const queryParams = new URLSearchParams();
      if (params?.object) queryParams.append('object', params.object.toString());
      if (params?.legal_entity) queryParams.append('legal_entity', params.legal_entity.toString());
      if (params?.status) queryParams.append('status', params.status);
      if (params?.approved_by_customer !== undefined) queryParams.append('approved_by_customer', params.approved_by_customer.toString());
      if (params?.search) queryParams.append('search', params.search);

      const url = `/estimates/${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await request<PaginatedResponse<EstimateList> | EstimateList[]>(url);

      if (response && typeof response === 'object' && 'results' in response) {
        return response.results;
      }
      return response as EstimateList[];
    },

    async getEstimateDetail(id: number) {
      return request<EstimateDetail>(`/estimates/${id}/`);
    },

    async createEstimate(data: EstimateCreateRequest) {
      return request<EstimateDetail>('/estimates/', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async updateEstimate(id: number, data: Partial<EstimateCreateRequest>) {
      return request<EstimateDetail>(`/estimates/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    async createEstimateVersion(id: number) {
      return request<EstimateDetail>(`/estimates/${id}/create-version/`, { method: 'POST' });
    },

    async getEstimateVersions(id: number) {
      return request<EstimateList[]>(`/estimates/${id}/versions/`);
    },

    async createMountingEstimateFromEstimate(estimateId: number) {
      return request<MountingEstimateDetail>(`/estimates/${estimateId}/create-mounting-estimate/`, { method: 'POST' });
    },

    async deleteEstimate(id: number) {
      return request<void>(`/estimates/${id}/`, { method: 'DELETE' });
    },

    // Estimate Sections
    async getEstimateSections(estimateId: number) {
      const response = await request<PaginatedResponse<EstimateSection> | EstimateSection[]>(`/estimate-sections/?estimate=${estimateId}`);
      if (response && typeof response === 'object' && 'results' in response) {
        return response.results;
      }
      return response as EstimateSection[];
    },

    async createEstimateSection(data: { estimate: number; name: string; sort_order?: number }) {
      return request<EstimateSection>('/estimate-sections/', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async updateEstimateSection(id: number, data: Partial<EstimateSection>) {
      return request<EstimateSection>(`/estimate-sections/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    async deleteEstimateSection(id: number) {
      return request<void>(`/estimate-sections/${id}/`, { method: 'DELETE' });
    },

    // Estimate Subsections
    async getEstimateSubsections(params: { section?: number; estimate?: number }) {
      const queryParams = new URLSearchParams();
      if (params.section) queryParams.append('section', params.section.toString());
      if (params.estimate) queryParams.append('estimate', params.estimate.toString());

      const response = await request<PaginatedResponse<EstimateSubsection> | EstimateSubsection[]>(`/estimate-subsections/?${queryParams.toString()}`);
      if (response && typeof response === 'object' && 'results' in response) {
        return response.results;
      }
      return response as EstimateSubsection[];
    },

    async createEstimateSubsection(data: {
      section: number;
      name: string;
      materials_sale: string;
      works_sale: string;
      materials_purchase: string;
      works_purchase: string;
      sort_order?: number;
    }) {
      return request<EstimateSubsection>('/estimate-subsections/', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async updateEstimateSubsection(id: number, data: Partial<EstimateSubsection>) {
      return request<EstimateSubsection>(`/estimate-subsections/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    async deleteEstimateSubsection(id: number) {
      return request<void>(`/estimate-subsections/${id}/`, { method: 'DELETE' });
    },

    // Estimate Characteristics
    async getEstimateCharacteristics(estimateId: number) {
      const response = await request<PaginatedResponse<EstimateCharacteristic> | EstimateCharacteristic[]>(`/estimate-characteristics/?estimate=${estimateId}`);
      if (response && typeof response === 'object' && 'results' in response) {
        return response.results;
      }
      return response as EstimateCharacteristic[];
    },

    async createEstimateCharacteristic(data: {
      estimate: number;
      name: string;
      purchase_amount: string;
      sale_amount: string;
      source_type: 'sections' | 'manual';
      sort_order?: number;
    }) {
      return request<EstimateCharacteristic>('/estimate-characteristics/', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async updateEstimateCharacteristic(id: number, data: Partial<EstimateCharacteristic>) {
      return request<EstimateCharacteristic>(`/estimate-characteristics/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    async deleteEstimateCharacteristic(id: number) {
      return request<void>(`/estimate-characteristics/${id}/`, { method: 'DELETE' });
    },

    // Column Config Templates
    async getColumnConfigTemplates() {
      const response = await request<PaginatedResponse<ColumnConfigTemplate> | ColumnConfigTemplate[]>(
        '/column-config-templates/'
      );
      if (response && typeof response === 'object' && 'results' in response) {
        return (response as PaginatedResponse<ColumnConfigTemplate>).results;
      }
      return response as ColumnConfigTemplate[];
    },

    async createColumnConfigTemplate(data: { name: string; description?: string; column_config: ColumnDef[]; is_default?: boolean }) {
      return request<ColumnConfigTemplate>('/column-config-templates/', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async deleteColumnConfigTemplate(id: number) {
      return request<void>(`/column-config-templates/${id}/`, { method: 'DELETE' });
    },

    async applyColumnConfigTemplate(templateId: number, estimateId: number) {
      return request<{ status: string; estimate_id: number }>(
        `/column-config-templates/${templateId}/apply/`,
        {
          method: 'POST',
          body: JSON.stringify({ estimate_id: estimateId }),
        }
      );
    },

    async exportEstimate(id: number, mode?: 'internal' | 'external'): Promise<Blob> {
      const url = `${API_BASE_URL}/estimates/${id}/export/${mode ? `?mode=${mode}` : ''}`;
      const token = localStorage.getItem('access_token');
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Ошибка экспорта: ${res.status}`);
      return res.blob();
    },

    // Estimate Items
    async getEstimateItems(estimateId: number) {
      const response = await request<PaginatedResponse<EstimateItem> | EstimateItem[]>(
        `/estimate-items/?estimate=${estimateId}&ordering=sort_order,item_number&page_size=all`
      );
      if (response && typeof response === 'object' && 'results' in response) {
        return (response as PaginatedResponse<EstimateItem>).results;
      }
      return response as EstimateItem[];
    },

    async createEstimateItem(data: CreateEstimateItemData) {
      return request<EstimateItem>('/estimate-items/', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async updateEstimateItem(id: number, data: Partial<CreateEstimateItemData>) {
      return request<EstimateItem>(`/estimate-items/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    async deleteEstimateItem(id: number) {
      return request<void>(`/estimate-items/${id}/`, { method: 'DELETE' });
    },

    async bulkCreateEstimateItems(items: CreateEstimateItemData[]) {
      return request<EstimateItem[]>('/estimate-items/bulk-create/', {
        method: 'POST',
        body: JSON.stringify({ items }),
      });
    },

    async bulkUpdateEstimateItems(items: Array<{ id: number } & Partial<CreateEstimateItemData>>) {
      return request<EstimateItem[]>('/estimate-items/bulk-update/', {
        method: 'POST',
        body: JSON.stringify({ items }),
      });
    },

    async bulkMoveEstimateItems(itemIds: number[], targetPosition: number) {
      return request<{ moved: number }>('/estimate-items/bulk-move/', {
        method: 'POST',
        body: JSON.stringify({ item_ids: itemIds, target_position: targetPosition }),
      });
    },

    async mergeEstimateItems(itemIds: number[]) {
      return request<{ merged_into: number; deleted_ids: number[] }>('/estimate-items/bulk-merge/', {
        method: 'POST',
        body: JSON.stringify({ item_ids: itemIds }),
      });
    },

    async autoMatchEstimateItems(
      estimateId: number,
      options?: { priceListId?: number; supplierIds?: number[]; priceStrategy?: string },
    ) {
      const body: Record<string, unknown> = { estimate_id: estimateId };
      if (options?.priceListId) body.price_list_id = options.priceListId;
      if (options?.supplierIds && options.supplierIds.length > 0) body.supplier_ids = options.supplierIds;
      if (options?.priceStrategy) body.price_strategy = options.priceStrategy;
      return request<AutoMatchResult[]>('/estimate-items/auto-match/', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },

    // ==================== Async Work Matching ====================

    async startWorkMatching(estimateId: number) {
      return request<WorkMatchingSession>('/estimate-items/start-work-matching/', {
        method: 'POST',
        body: JSON.stringify({ estimate_id: estimateId }),
      });
    },

    async getWorkMatchingProgress(sessionId: string, signal?: AbortSignal) {
      return request<WorkMatchingProgress>(
        `/estimate-items/work-matching-progress/${sessionId}/`,
        signal ? { signal } : undefined,
      );
    },

    async cancelWorkMatching(sessionId: string) {
      return request<{ status: string }>(
        `/estimate-items/cancel-work-matching/${sessionId}/`,
        { method: 'POST' },
      );
    },

    async applyWorkMatching(sessionId: string, items: WorkMatchingApplyItem[]) {
      return request<WorkMatchingApplyResult>(
        '/estimate-items/apply-work-matching/',
        { method: 'POST', body: JSON.stringify({ session_id: sessionId, items }) },
      );
    },

    // F11: отдельная функция для preview — всегда возвращает EstimateImportPreview
    async importEstimateFilePreview(estimateId: number, file: File) {
      const formData = new FormData();
      formData.append('estimate_id', estimateId.toString());
      formData.append('file', file);
      formData.append('preview', 'true');
      return request<EstimateImportPreview>(
        '/estimate-items/import/',
        { method: 'POST', body: formData },
      );
    },

    async importFromProjectFilePreview(estimateId: number, projectFileIds: number[]) {
      return request<EstimateImportPreview>(
        '/estimate-items/import-project-file/',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            estimate_id: estimateId,
            project_file_ids: projectFileIds,
            preview: 'true',
          }),
        },
      );
    },

    async startProjectFilePdfImport(
      estimateId: number,
      projectFileIds: number[],
    ): Promise<EstimatePdfImportSession> {
      return request<EstimatePdfImportSession>(
        '/estimate-items/import-project-file-pdf/',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            estimate_id: estimateId,
            project_file_ids: projectFileIds,
          }),
        },
      );
    },

    async importEstimateFile(estimateId: number, file: File) {
      const formData = new FormData();
      formData.append('estimate_id', estimateId.toString());
      formData.append('file', file);
      return request<EstimateItem[]>(
        '/estimate-items/import/',
        { method: 'POST', body: formData },
      );
    },

    async importEstimateRows(
      estimateId: number,
      rows: Array<{ name: string; model_name?: string; unit?: string; quantity?: string; material_unit_price?: string; work_unit_price?: string; is_section?: boolean }>,
    ) {
      // F12: фильтруем undefined → default values перед отправкой
      const cleanRows = rows.map((row) => ({
        name: row.name,
        model_name: row.model_name || '',
        unit: row.unit || 'шт',
        quantity: row.quantity ?? '0',
        material_unit_price: row.material_unit_price ?? '0',
        work_unit_price: row.work_unit_price ?? '0',
        is_section: row.is_section ?? false,
      }));
      return request<{ created_count: number; item_ids: number[] }>('/estimate-items/import-rows/', {
        method: 'POST',
        body: JSON.stringify({ estimate_id: estimateId, rows: cleanRows }),
      });
    },

    async startEstimatePdfImport(estimateId: number, file: File): Promise<EstimatePdfImportSession> {
      const formData = new FormData();
      formData.append('estimate_id', estimateId.toString());
      formData.append('file', file);
      return request<EstimatePdfImportSession>('/estimate-items/import-pdf/', {
        method: 'POST',
        body: formData,
      });
    },

    async getEstimateImportProgress(sessionId: string, signal?: AbortSignal): Promise<EstimateImportProgress> {
      return request<EstimateImportProgress>(`/estimate-items/import-progress/${sessionId}/`, signal ? { signal } : undefined);
    },

    async cancelEstimateImport(sessionId: string): Promise<{ status: string }> {
      return request<{ status: string }>(`/estimate-items/import-cancel/${sessionId}/`, { method: 'POST' });
    },

    async promoteItemToSection(itemId: number) {
      return request<{ section_id: number }>(
        `/estimate-items/${itemId}/promote-to-section/`,
        { method: 'POST' },
      );
    },

    async demoteSectionToItem(sectionId: number) {
      return request<{ item_id: number }>(
        `/estimate-sections/${sectionId}/demote-to-item/`,
        { method: 'POST' },
      );
    },

    async moveEstimateItem(
      itemId: number,
      data: { direction: 'up' | 'down' } | { target_section_id: number },
    ) {
      return request<{ moved: boolean }>(
        `/estimate-items/${itemId}/move/`,
        { method: 'POST', body: JSON.stringify(data) },
      );
    },

    async bulkSetMarkup(data: {
      item_ids: number[];
      material_markup_type?: string | null;
      material_markup_value?: string | null;
      work_markup_type?: string | null;
      work_markup_value?: string | null;
    }): Promise<{ status: string; updated: number }> {
      return request<{ status: string; updated: number }>('/estimate-items/bulk-set-markup/', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async getMarkupDefaults(): Promise<{ material_markup_percent: string; work_markup_percent: string }> {
      return request<{ material_markup_percent: string; work_markup_percent: string }>('/estimate-markup-defaults/');
    },

    async updateMarkupDefaults(data: { material_markup_percent?: string; work_markup_percent?: string }): Promise<unknown> {
      return request<unknown>('/estimate-markup-defaults/1/', {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    // ==================== MOUNTING ESTIMATES ====================

    async getMountingEstimates(params?: {
      object?: number;
      source_estimate?: number;
      status?: string;
      agreed_counterparty?: number;
      search?: string;
    }) {
      const queryParams = new URLSearchParams();
      if (params?.object) queryParams.append('object', params.object.toString());
      if (params?.source_estimate) queryParams.append('source_estimate', params.source_estimate.toString());
      if (params?.status) queryParams.append('status', params.status);
      if (params?.agreed_counterparty) queryParams.append('agreed_counterparty', params.agreed_counterparty.toString());
      if (params?.search) queryParams.append('search', params.search);

      const url = `/mounting-estimates/${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await request<PaginatedResponse<MountingEstimateList> | MountingEstimateList[]>(url);

      if (response && typeof response === 'object' && 'results' in response) {
        return response.results;
      }
      return response as MountingEstimateList[];
    },

    async getMountingEstimateDetail(id: number) {
      return request<MountingEstimateDetail>(`/mounting-estimates/${id}/`);
    },

    async createMountingEstimate(data: MountingEstimateCreateRequest) {
      return request<MountingEstimateDetail>('/mounting-estimates/', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async createMountingEstimateFromEstimateId(estimateId: number) {
      return request<MountingEstimateDetail>('/mounting-estimates/from-estimate/', {
        method: 'POST',
        body: JSON.stringify({ estimate_id: estimateId }),
      });
    },

    async updateMountingEstimate(id: number, data: Partial<MountingEstimateCreateRequest>) {
      return request<MountingEstimateDetail>(`/mounting-estimates/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    async createMountingEstimateVersion(id: number) {
      return request<MountingEstimateDetail>(`/mounting-estimates/${id}/create-version/`, { method: 'POST' });
    },

    async agreeMountingEstimate(id: number, counterpartyId: number) {
      return request<MountingEstimateDetail>(`/mounting-estimates/${id}/agree/`, {
        method: 'POST',
        body: JSON.stringify({ counterparty_id: counterpartyId }),
      });
    },
  };
}
