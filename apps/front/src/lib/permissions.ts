import { Permission } from '@/types/auth.generated';
import type { User } from '@/types/auth.types';

/**
 * Effective-permission check against the `/auth/me` permission list.
 * ROOT bypasses every check, mirroring the backend.
 */
export function hasPermission(
    user: User | null | undefined,
    ...permissions: Permission[]
): boolean {
    const granted = user?.permissions ?? [];
    if (granted.includes(Permission.ROOT)) return true;
    return permissions.some((p) => granted.includes(p));
}
