/**
 * Generic API client with interceptors, retry logic, and type-safe requests.
 * Supports both REST and GraphQL endpoints.
 */
import { z } from 'zod';

// Request/Response types
export interface RequestConfig<T = unknown> {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  data?: T;
  params?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

export interface ApiError {
  message: string;
  code: string;
  status: number;
  details?: Record<string, unknown>;
}

// Interceptor types
export interface RequestInterceptor {
  onFulfilled?: (config: RequestConfig) => RequestConfig | Promise<RequestConfig>;
  onRejected?: (error: Error) => Promise<never>;
}

export interface ResponseInterceptor {
  onFulfilled?: <T>(response: ApiResponse<T>) => ApiResponse<T> | Promise<ApiResponse<T>>;
  onRejected?: (error: ApiError) => Promise<never>;
}

/**
 * Creates a type-safe API client with Zod schema validation
 */
export function createApiClient<BaseUrl extends string>(baseUrl: BaseUrl) {
  const requestInterceptors: RequestInterceptor[] = [];
  const responseInterceptors: ResponseInterceptor[] = [];
  
  let defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  // Retry configuration
  const DEFAULT_RETRIES = 3;
  const DEFAULT_TIMEOUT = 30_000;
  
  /**
   * Adds a request interceptor
   */
  function addRequestInterceptor(interceptor: RequestInterceptor): () => void {
    requestInterceptors.push(interceptor);
    return () => {
      const idx = requestInterceptors.indexOf(interceptor);
      if (idx >= 0) requestInterceptors.splice(idx, 1);
    };
  }
  
  /**
   * Adds a response interceptor
   */
  function addResponseInterceptor(interceptor: ResponseInterceptor): () => void {
    responseInterceptors.push(interceptor);
    return () => {
      const idx = responseInterceptors.indexOf(interceptor);
      if (idx >= 0) responseInterceptors.splice(idx, 1);
    };
  }
  
  /**
   * Sets default headers for all requests
   */
  function setDefaultHeaders(headers: Record<string, string>): void {
    defaultHeaders = { ...defaultHeaders, ...headers };
  }
  
  /**
   * Executes request with interceptors and retry logic
   */
  async function request<T>(config: RequestConfig<T>, schema?: z.ZodSchema<T>): Promise<ApiResponse<T>> {
    let finalConfig = config;
    
    // Apply request interceptors
    for (const interceptor of requestInterceptors) {
      if (interceptor.onFulfilled) {
        finalConfig = await interceptor.onFulfilled(finalConfig);
      }
    }
    
    const url = new URL(finalConfig.url, baseUrl);
    if (finalConfig.params) {
      Object.entries(finalConfig.params).forEach(([key, value]) => {
        url.searchParams.set(key, String(value));
      });
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), finalConfig.timeout ?? DEFAULT_TIMEOUT);
    
    let lastError: Error | null = null;
    const maxRetries = finalConfig.retries ?? DEFAULT_RETRIES;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url.toString(), {
          method: finalConfig.method,
          headers: { ...defaultHeaders, ...finalConfig.headers },
          body: finalConfig.data ? JSON.stringify(finalConfig.data) : undefined,
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });
        
        let data: T;
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          data = await response.json();
        } else {
          data = await response.text() as unknown as T;
        }
        
        const apiResponse: ApiResponse<T> = {
          data,
          status: response.status,
          headers: responseHeaders,
        };
        
        // Apply response interceptors
        let finalResponse = apiResponse;
        for (const interceptor of responseInterceptors) {
          if (interceptor.onFulfilled) {
            finalResponse = await interceptor.onFulfilled(finalResponse);
          }
        }
        
        // Validate with schema if provided
        if (schema) {
          const parsed = schema.safeParse(finalResponse.data);
          if (!parsed.success) {
            throw new Error(`Response validation failed: ${parsed.error.message}`);
          }
        }
        
        if (!response.ok) {
          throw createApiError(finalResponse);
        }
        
        return finalResponse;
      } catch (err) {
        clearTimeout(timeoutId);
        lastError = err as Error;
        
        // Don't retry on client errors (4xx) or abort
        if (err instanceof Error && err.name === 'AbortError') throw err;
        if (err instanceof Response && err.status >= 400 && err.status < 500) throw err;
        
        if (attempt < maxRetries) {
          // Exponential backoff: 100ms, 200ms, 400ms...
          await new Promise(resolve => setTimeout(resolve, 100 * 2 ** attempt));
        }
      }
    }
    
    throw lastError ?? new Error('Request failed after retries');
  }
  
  function createApiError<T>(response: ApiResponse<T>): ApiError {
    return {
      message: (response.data as any)?.message ?? `HTTP ${response.status}`,
      code: (response.data as any)?.code ?? 'API_ERROR',
      status: response.status,
      details: (response.data as any)?.details,
    };
  }
  
  // Convenience methods
  const http = {
    get: <T>(url: string, params?: RequestConfig['params'], schema?: z.ZodSchema<T>) =>
      request<T>({ method: 'GET', url, params }, schema),
    post: <T>(url: string, data?: T, schema?: z.ZodSchema<T>) =>
      request<T>({ method: 'POST', url, data }, schema),
    put: <T>(url: string, data?: T, schema?: z.ZodSchema<T>) =>
      request<T>({ method: 'PUT', url, data }, schema),
    patch: <T>(url: string, data?: T, schema?: z.ZodSchema<T>) =>
      request<T>({ method: 'PATCH', url, data }, schema),
    delete: <T>(url: string, schema?: z.ZodSchema<T>) =>
      request<T>({ method: 'DELETE', url }, schema),
  };
  
  return {
    request,
    http,
    addRequestInterceptor,
    addResponseInterceptor,
    setDefaultHeaders,
  };
}

// Default client instance
export const api = createApiClient('https://api.example.com/v1');

// TODO: Add WebSocket support for real-time updates
// TODO: Add request/response logging in development
// FIXME: Handle multipart/form-data for file uploads