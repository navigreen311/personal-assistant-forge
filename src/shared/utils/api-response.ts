import { NextResponse } from 'next/server';
import type { ApiResponse, ApiError } from '@/shared/types';

export function success<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json(
    { success: true, data, meta: { timestamp: new Date().toISOString() } },
    { status }
  );
}

export function error(
  code: string,
  message: string,
  status = 400,
  details?: Record<string, unknown>
): NextResponse<ApiResponse> {
  const err: ApiError = { code, message, details };
  return NextResponse.json(
    { success: false, error: err, meta: { timestamp: new Date().toISOString() } },
    { status }
  );
}

export function paginated<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number
): NextResponse<ApiResponse<T[]>> {
  return NextResponse.json({
    success: true,
    data,
    meta: { page, pageSize, total, timestamp: new Date().toISOString() },
  });
}
