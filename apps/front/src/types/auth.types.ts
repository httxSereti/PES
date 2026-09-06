import type { Permission, Role } from './auth.generated';

/**
 * Shape of `GET /auth/me`: role + *effective* permissions (role bundle ∪
 * custom grants), as returned by the backend.
 */
export interface User {
    id: string;
    display_name: string | null;
    role: Role;
    permissions: Permission[];
    is_guest?: boolean;
}

export interface AuthState {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isGuest: boolean;
    loading: boolean;
    error: string | null;
}

export interface AuthTokens {
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
}

export interface LoginCredentials {
    magic_token: string;
}

export interface LoginResponse {
    success: boolean;
    token?: string;
    user?: User;
    error?: string;
}
