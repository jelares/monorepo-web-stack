// Standard API response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
  };
}

// Example domain types - replace with your own
export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}
