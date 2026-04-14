import type { RequestFn } from './types';
import type {
  CreateEmployeeData, CreatePositionRecordData, CreateSalaryRecordData,
  Employee, EmployeeDetail, OrgChartData, PaginatedResponse,
  PositionRecord, SalaryHistoryRecord,
} from '../types';

export function createPersonnelService(request: RequestFn) {
  return {
    async getEmployees(params?: {
      search?: string;
      legal_entity?: number;
      is_active?: boolean;
    }): Promise<Employee[]> {
      const qp = new URLSearchParams();
      if (params?.search) qp.append('search', params.search);
      if (params?.legal_entity) qp.append('legal_entity', params.legal_entity.toString());
      if (params?.is_active !== undefined) qp.append('is_active', params.is_active.toString());
      const qs = qp.toString();
      const response = await request<PaginatedResponse<Employee> | Employee[]>(
        `/personnel/employees/${qs ? `?${qs}` : ''}`
      );
      if (response && typeof response === 'object' && 'results' in response) {
        return response.results;
      }
      return response as Employee[];
    },

    async getEmployee(id: number): Promise<EmployeeDetail> {
      return request<EmployeeDetail>(`/personnel/employees/${id}/`);
    },

    async createEmployee(data: CreateEmployeeData): Promise<EmployeeDetail> {
      return request<EmployeeDetail>('/personnel/employees/', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async updateEmployee(id: number, data: Partial<CreateEmployeeData>): Promise<EmployeeDetail> {
      return request<EmployeeDetail>(`/personnel/employees/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    async deleteEmployee(id: number): Promise<void> {
      return request<void>(`/personnel/employees/${id}/`, { method: 'DELETE' });
    },

    // Positions
    async getEmployeePositions(employeeId: number): Promise<PositionRecord[]> {
      return request<PositionRecord[]>(`/personnel/employees/${employeeId}/positions/`);
    },

    async createPositionRecord(employeeId: number, data: CreatePositionRecordData): Promise<PositionRecord> {
      return request<PositionRecord>(`/personnel/employees/${employeeId}/positions/`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async updatePositionRecord(id: number, data: Partial<CreatePositionRecordData>): Promise<PositionRecord> {
      return request<PositionRecord>(`/personnel/position-records/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    async deletePositionRecord(id: number): Promise<void> {
      return request<void>(`/personnel/position-records/${id}/`, { method: 'DELETE' });
    },

    // Salary History
    async getEmployeeSalaryHistory(employeeId: number): Promise<SalaryHistoryRecord[]> {
      return request<SalaryHistoryRecord[]>(`/personnel/employees/${employeeId}/salary-history/`);
    },

    async createSalaryRecord(employeeId: number, data: CreateSalaryRecordData): Promise<SalaryHistoryRecord> {
      return request<SalaryHistoryRecord>(`/personnel/employees/${employeeId}/salary-history/`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async deleteSalaryRecord(id: number): Promise<void> {
      return request<void>(`/personnel/salary-history/${id}/`, { method: 'DELETE' });
    },

    // Org Chart
    async getOrgChart(legalEntityId?: number): Promise<OrgChartData> {
      const qs = legalEntityId ? `?legal_entity=${legalEntityId}` : '';
      return request<OrgChartData>(`/personnel/org-chart/${qs}`);
    },

    // Create counterparty from employee
    async createCounterpartyFromEmployee(employeeId: number): Promise<{ id: number; name: string; message: string }> {
      return request<{ id: number; name: string; message: string }>(
        `/personnel/employees/${employeeId}/create-counterparty/`,
        { method: 'POST' }
      );
    },

    // Create User account for employee (without password)
    async createUserForEmployee(employeeId: number, data: { username: string }): Promise<{ id: number; username: string }> {
      return request<{ id: number; username: string }>(
        `/personnel/employees/${employeeId}/create-user/`,
        { method: 'POST', body: JSON.stringify(data) }
      );
    },

    // Set password for the User bound to employee
    async setEmployeePassword(
      employeeId: number,
      data: { new_password: string; new_password_confirm: string }
    ): Promise<{ status: string }> {
      return request<{ status: string }>(
        `/personnel/employees/${employeeId}/set-password/`,
        { method: 'POST', body: JSON.stringify(data) }
      );
    },
  };
}
