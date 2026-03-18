import { ApiClient } from './client';
import './extensions'; // prototype augmentations (supply, notifications, etc.)

export { ApiClient };
export * from './types';

export const api = new ApiClient();
