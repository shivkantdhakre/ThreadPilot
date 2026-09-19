// ─── Auth types ──────────────────────────────────────────────────────────────

export interface UserDto {
  id: string;
  email: string;
  createdAt: string;
}

export interface AuthTokensDto {
  accessToken: string;
  // refreshToken delivered as HttpOnly cookie — not in response body
}

export interface RegisterDto {
  email: string;
  password: string;
  name: string;
}

export interface LoginDto {
  email: string;
  password: string;
}
