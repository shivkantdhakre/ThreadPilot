const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

interface RequestOptions extends RequestInit {
  workspaceId?: string;
  skipAuth?: boolean;
}

class ApiClient {
  private isRefreshing = false;
  private refreshSubscribers: Array<(token: string) => void> = [];

  private onRefreshed(token: string) {
    this.refreshSubscribers.forEach((cb) => cb(token));
    this.refreshSubscribers = [];
  }

  private addRefreshSubscriber(cb: (token: string) => void) {
    this.refreshSubscribers.push(cb);
  }

  get token(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('tp_token');
  }

  set token(token: string | null) {
    if (typeof window === 'undefined') return;
    if (token) {
      localStorage.setItem('tp_token', token);
    } else {
      localStorage.removeItem('tp_token');
    }
  }

  get workspaceId(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('tp_active_workspace_id');
  }

  set workspaceId(id: string | null) {
    if (typeof window === 'undefined') return;
    if (id) {
      localStorage.setItem('tp_active_workspace_id', id);
    } else {
      localStorage.removeItem('tp_active_workspace_id');
    }
  }

  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
    const headers = new Headers(options.headers || {});

    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    if (!options.skipAuth && this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }

    const wsId = options.workspaceId ?? this.workspaceId;
    if (wsId) {
      headers.set('x-workspace-id', wsId);
    }

    const config: RequestInit = {
      ...options,
      headers,
      credentials: 'include', // sends HttpOnly refresh cookie
    };

    const response = await fetch(url, config);

    // 401 Unauthorized handling with refresh token retry
    if (response.status === 401 && !options.skipAuth && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/refresh')) {
      if (!this.isRefreshing) {
        this.isRefreshing = true;
        try {
          const refreshRes = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          });

          if (refreshRes.ok) {
            const data = await refreshRes.json();
            this.token = data.accessToken;
            this.onRefreshed(data.accessToken);
            this.isRefreshing = false;

            // Retry original request
            headers.set('Authorization', `Bearer ${data.accessToken}`);
            const retryRes = await fetch(url, { ...config, headers });
            return this.handleResponse<T>(retryRes);
          } else {
            this.token = null;
            this.isRefreshing = false;
            if (typeof window !== 'undefined') {
              window.location.href = '/login';
            }
            throw new Error('Session expired. Please log in again.');
          }
        } catch (err) {
          this.isRefreshing = false;
          this.token = null;
          throw err;
        }
      } else {
        // Wait for refresh to complete
        return new Promise((resolve, reject) => {
          this.addRefreshSubscriber(async (newToken) => {
            headers.set('Authorization', `Bearer ${newToken}`);
            try {
              const retryRes = await fetch(url, { ...config, headers });
              resolve(await this.handleResponse<T>(retryRes));
            } catch (err) {
              reject(err);
            }
          });
        });
      }
    }

    return this.handleResponse<T>(response);
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      let errorMsg = `HTTP Error ${response.status}`;
      try {
        const errorData = await response.json();
        errorMsg = errorData.message || errorData.error?.message || JSON.stringify(errorData);
      } catch {
        const text = await response.text();
        if (text) errorMsg = text;
      }
      throw new Error(errorMsg);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  get<T>(endpoint: string, options?: RequestOptions) {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  post<T>(endpoint: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  patch<T>(endpoint: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  delete<T>(endpoint: string, options?: RequestOptions) {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
