import type { RequestFn } from './types';
import type { PaginatedResponse } from '../types';
import type {
  AvitoConfig,
  AvitoListingDetail,
  AvitoListingItem,
  AvitoPublishedListingItem,
  AvitoSearchKeyword,
  CampaignDetail,
  CampaignListItem,
  CampaignPreview,
  CampaignRecipientItem,
  ContactHistoryItem,
  CreateAvitoListingData,
  CreateCampaignData,
  CreateContactData,
  CreateExecutorProfileData,
  ExecutorProfileDetail,
  ExecutorProfileFilters,
  ExecutorProfileListItem,
  MarketingDashboard,
  MarketingSyncLogItem,
  UnisenderConfig,
  UpdateExecutorProfileData,
} from '../types/marketing';

function buildParams(filters?: Record<string, string | undefined>): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.append(key, value);
  }
  const str = params.toString();
  return str ? `?${str}` : '';
}

function unwrapResults<T>(response: PaginatedResponse<T> | T[]): T[] {
  if (response && typeof response === 'object' && 'results' in response) {
    return (response as PaginatedResponse<T>).results;
  }
  return response as T[];
}

export function createMarketingService(request: RequestFn) {
  return {
    // ── Executor Profiles ──────────────────────────────────────────

    async getExecutorProfiles(filters?: ExecutorProfileFilters) {
      const resp = await request<PaginatedResponse<ExecutorProfileListItem> | ExecutorProfileListItem[]>(
        `/marketing/executor-profiles/${buildParams(filters as Record<string, string | undefined>)}`,
      );
      return unwrapResults(resp);
    },

    async getExecutorProfile(id: number) {
      return request<ExecutorProfileDetail>(`/marketing/executor-profiles/${id}/`);
    },

    async createExecutorProfile(data: CreateExecutorProfileData) {
      return request<ExecutorProfileDetail>('/marketing/executor-profiles/', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async updateExecutorProfile(id: number, data: UpdateExecutorProfileData) {
      return request<ExecutorProfileDetail>(`/marketing/executor-profiles/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    async deleteExecutorProfile(id: number) {
      return request<void>(`/marketing/executor-profiles/${id}/`, { method: 'DELETE' });
    },

    async getContactHistory(profileId: number) {
      return request<ContactHistoryItem[]>(`/marketing/executor-profiles/${profileId}/contact-history/`);
    },

    async addContact(profileId: number, data: CreateContactData) {
      return request<ContactHistoryItem>(`/marketing/executor-profiles/${profileId}/add-contact/`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    // ── Avito Config ───────────────────────────────────────────────

    async getAvitoConfig() {
      return request<AvitoConfig>('/marketing/avito/config/');
    },

    async updateAvitoConfig(data: Partial<AvitoConfig>) {
      return request<AvitoConfig>('/marketing/avito/config/', {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    // ── Avito Keywords ─────────────────────────────────────────────

    async getAvitoKeywords() {
      const resp = await request<PaginatedResponse<AvitoSearchKeyword> | AvitoSearchKeyword[]>(
        '/marketing/avito/keywords/',
      );
      return unwrapResults(resp);
    },

    async createAvitoKeyword(keyword: string) {
      return request<AvitoSearchKeyword>('/marketing/avito/keywords/', {
        method: 'POST',
        body: JSON.stringify({ keyword }),
      });
    },

    async updateAvitoKeyword(id: number, data: Partial<AvitoSearchKeyword>) {
      return request<AvitoSearchKeyword>(`/marketing/avito/keywords/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    async deleteAvitoKeyword(id: number) {
      return request<void>(`/marketing/avito/keywords/${id}/`, { method: 'DELETE' });
    },

    // ── Avito Listings (входящие) ──────────────────────────────────

    async getAvitoListings(filters?: { status?: string; keyword?: string; city?: string }) {
      const resp = await request<PaginatedResponse<AvitoListingItem> | AvitoListingItem[]>(
        `/marketing/avito/listings/${buildParams(filters)}`,
      );
      return unwrapResults(resp);
    },

    async getAvitoListing(id: number) {
      return request<AvitoListingDetail>(`/marketing/avito/listings/${id}/`);
    },

    async createAvitoListing(data: CreateAvitoListingData) {
      return request<AvitoListingItem>('/marketing/avito/listings/', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async updateListingStatus(id: number, status: string) {
      return request<AvitoListingItem>(`/marketing/avito/listings/${id}/update-status/`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    },

    async convertListingToExecutor(id: number) {
      return request<ExecutorProfileDetail>(`/marketing/avito/listings/${id}/convert/`, {
        method: 'POST',
      });
    },

    // ── Avito Published Listings ───────────────────────────────────

    async getPublishedListings() {
      const resp = await request<PaginatedResponse<AvitoPublishedListingItem> | AvitoPublishedListingItem[]>(
        '/marketing/avito/published/',
      );
      return unwrapResults(resp);
    },

    async refreshPublishedStats(id: number) {
      return request<AvitoPublishedListingItem>(`/marketing/avito/published/${id}/refresh-stats/`, {
        method: 'POST',
      });
    },

    // ── Avito Actions ──────────────────────────────────────────────

    async triggerAvitoScan() {
      return request<{ status: string; message?: string }>('/marketing/avito/scan/', {
        method: 'POST',
      });
    },

    async publishMPToAvito(mpId: number, dryRun = false) {
      return request<{ status: string; data?: unknown }>(`/marketing/avito/publish-mp/${mpId}/`, {
        method: 'POST',
        body: JSON.stringify({ dry_run: dryRun }),
      });
    },

    // ── Campaigns ──────────────────────────────────────────────────

    async getCampaigns() {
      const resp = await request<PaginatedResponse<CampaignListItem> | CampaignListItem[]>(
        '/marketing/campaigns/',
      );
      return unwrapResults(resp);
    },

    async getCampaign(id: number) {
      return request<CampaignDetail>(`/marketing/campaigns/${id}/`);
    },

    async createCampaign(data: CreateCampaignData) {
      return request<CampaignDetail>('/marketing/campaigns/', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async updateCampaign(id: number, data: Partial<CreateCampaignData>) {
      return request<CampaignDetail>(`/marketing/campaigns/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    async deleteCampaign(id: number) {
      return request<void>(`/marketing/campaigns/${id}/`, { method: 'DELETE' });
    },

    async sendCampaign(id: number) {
      return request<{ status: string; campaign_id: number }>(`/marketing/campaigns/${id}/send/`, {
        method: 'POST',
      });
    },

    async previewCampaign(id: number) {
      return request<CampaignPreview>(`/marketing/campaigns/${id}/preview/`);
    },

    async getCampaignRecipients(id: number) {
      return request<CampaignRecipientItem[]>(`/marketing/campaigns/${id}/recipients/`);
    },

    // ── Unisender Config ───────────────────────────────────────────

    async getUnisenderConfig() {
      return request<UnisenderConfig>('/marketing/unisender/config/');
    },

    async updateUnisenderConfig(data: Partial<UnisenderConfig>) {
      return request<UnisenderConfig>('/marketing/unisender/config/', {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    // ── Sync Logs & Dashboard ──────────────────────────────────────

    async getSyncLogs(filters?: { sync_type?: string; status?: string }) {
      const resp = await request<PaginatedResponse<MarketingSyncLogItem> | MarketingSyncLogItem[]>(
        `/marketing/sync-logs/${buildParams(filters)}`,
      );
      return unwrapResults(resp);
    },

    async getDashboard() {
      return request<MarketingDashboard>('/marketing/dashboard/');
    },
  };
}
