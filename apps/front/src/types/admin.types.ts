import type { Permission, Role } from "./auth.generated";

/** Shape of GET /users (admin listing) */
export interface AdminUser {
    id: string;
    display_name: string | null;
    role: Role;
    /** Effective permissions (role bundle ∪ custom grants) */
    permissions: Permission[];
    /** Explicit per-user grants, on top of the role bundle */
    custom_permissions: Permission[];
    is_active: boolean;
    /** Currently holding a live WebSocket connection */
    is_online: boolean;
    created_at: string | null;
    last_login_at: string | null;
}

/** Shape of GET /admin/roles — role → its bundled permissions */
export type RolePermissionMap = Record<string, Permission[]>;
