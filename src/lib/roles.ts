import type { UserRole } from "./db";

export const USER_ROLES: UserRole[] = ["superadmin", "admin", "push", "viewer"];

export function isSuperAdminRole(role: string): boolean {
	return role === "superadmin";
}

/** Space admin or super-admin — may manage users/groups (within scope for admin). */
export function isPanelAdminRole(role: string): boolean {
	return role === "superadmin" || role === "admin";
}

export function normalizeRole(role: string): UserRole {
	if (role === "superadmin" || role === "admin" || role === "push" || role === "viewer") {
		return role;
	}
	return "viewer";
}
