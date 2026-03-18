import apiClient from './apiClient';

// Типы данных
export interface FeedbackRequest {
  email: string;
  name?: string;
  message: string;
  captcha: string;
}

export interface FeedbackResponse {
  message: string;
  id: number;
}

// API сервис для обратной связи
class FeedbackService {
  private baseUrl = '/feedback/';

  /**
   * Отправить сообщение обратной связи
   * @param data - Данные формы обратной связи
   */
  async submitFeedback(data: FeedbackRequest): Promise<FeedbackResponse> {
    const response = await apiClient.post<FeedbackResponse>(this.baseUrl, data);
    return response.data;
  }
}

export default new FeedbackService();
