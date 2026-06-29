// src/types/index.ts
import { Request } from 'express';

export type Currency = 'HNL' | 'USD';
export type UserRole = 'ADMIN' | 'OWNER' | 'VIEWER';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: UserRole;
    companyId: string | null;
  };
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: string[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function successResponse<T>(data: T, message?: string): ApiResponse<T> {
  return { success: true, data, message };
}

export function errorResponse(message: string, errors?: string[]): ApiResponse {
  return { success: false, message, errors };
}

export function paginatedResponse<T>(
  data: T,
  page: number,
  limit: number,
  total: number
): ApiResponse<T> {
  return {
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
