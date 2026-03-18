import apiClient from './apiClient';

// Типы данных
export interface CommentAuthor {
  id: number;
  email: string;
  first_name: string;
}

export interface Comment {
  id: number;
  news_post: number;
  author: CommentAuthor;
  text: string;
  created_at: string;
  updated_at: string;
}

export interface CommentsResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Comment[];
}

export interface CreateCommentRequest {
  news_post: number;
  text: string;
}

export interface UpdateCommentRequest {
  text: string;
}

// API сервис для работы с комментариями
class CommentService {
  private baseUrl = '/comments/';

  /**
   * Получить список всех комментариев (с пагинацией)
   */
  async getComments(page: number = 1): Promise<CommentsResponse> {
    const response = await apiClient.get<CommentsResponse>(this.baseUrl, {
      params: { page },
    });
    return response.data;
  }

  /**
   * Получить комментарии конкретной новости
   * @param newsId - ID новости
   */
  async getCommentsByNews(newsId: number): Promise<Comment[]> {
    const response = await apiClient.get<Comment[]>(
      `${this.baseUrl}by-news/${newsId}/`
    );
    return response.data;
  }

  /**
   * Получить комментарии с фильтрацией по новости (с пагинацией)
   * @param newsId - ID новости
   * @param page - Номер страницы
   */
  async getCommentsFiltered(newsId: number, page: number = 1): Promise<CommentsResponse> {
    const response = await apiClient.get<CommentsResponse>(this.baseUrl, {
      params: { news_post: newsId, page },
    });
    return response.data;
  }

  /**
   * Создать новый комментарий
   * @param data - Данные комментария
   */
  async createComment(data: CreateCommentRequest): Promise<Comment> {
    const response = await apiClient.post<Comment>(this.baseUrl, data);
    return response.data;
  }

  /**
   * Обновить комментарий (PATCH)
   * @param commentId - ID комментария
   * @param data - Обновленные данные
   */
  async updateComment(commentId: number, data: UpdateCommentRequest): Promise<Comment> {
    const response = await apiClient.patch<Comment>(
      `${this.baseUrl}${commentId}/`,
      data
    );
    return response.data;
  }

  /**
   * Удалить комментарий
   * @param commentId - ID комментария
   */
  async deleteComment(commentId: number): Promise<void> {
    await apiClient.delete(`${this.baseUrl}${commentId}/`);
  }

  /**
   * Получить один комментарий по ID
   * @param commentId - ID комментария
   */
  async getCommentById(commentId: number): Promise<Comment> {
    const response = await apiClient.get<Comment>(`${this.baseUrl}${commentId}/`);
    return response.data;
  }
}

export default new CommentService();
