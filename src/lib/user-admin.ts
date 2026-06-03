import { db, type User, type UserRole } from "./db";
import {
	assignableRoles,
	canAssignRole,
	canManageUser,
	filterManageableGroupIds,
	canAdminScopePatterns,
	isSuperAdmin,
} from "./space-access";

export function validateUserAdminPatch(
	actor: User,
	targetId: number,
	body: { role?: string; groupIds?: number[] },
): { ok: true } | { ok: false; error: string } {
	if (!canManageUser(actor, targetId)) {
		return { ok: false, error: "Forbidden" };
	}
	if (body.role && !canAssignRole(actor, body.role)) {
		return { ok: false, error: "Cannot assign this role" };
	}
	if (Array.isArray(body.groupIds)) {
		const valid = filterManageableGroupIds(actor, body.groupIds);
		if (!isSuperAdmin(actor) && valid.length !== body.groupIds.length) {
			return { ok: false, error: "One or more groups are outside your scope" };
		}
	}
	return { ok: true };
}

export function validateUserCreate(
	actor: User,
	body: { role?: string; groupIds?: number[] },
): { ok: true; role: UserRole; groupIds: number[] } | { ok: false; error: string } {
	const role = (body.role || "viewer") as UserRole;
	if (!canAssignRole(actor, role)) {
		return { ok: false, error: "Cannot assign this role" };
	}
	const groupIds = Array.isArray(body.groupIds)
		? body.groupIds.map((g) => Number(g)).filter((g) => Number.isInteger(g) && g > 0)
		: [];
	const validGroups = filterManageableGroupIds(actor, groupIds);
	if (!isSuperAdmin(actor)) {
		if (!validGroups.length) {
			return { ok: false, error: "Assign at least one group in your scope" };
		}
		if (validGroups.length !== groupIds.length) {
			return { ok: false, error: "One or more groups are outside your scope" };
		}
	}
	return { ok: true, role, groupIds: validGroups };
}

export function validateGroupRules(actor: User, rules: { repository: string }[]): boolean {
	if (!rules.length) return isSuperAdmin(actor);
	return canAdminScopePatterns(actor, rules.map((r) => r.repository.trim()).filter(Boolean));
}

export function assignableRolesForActor(actor: User): UserRole[] {
	return assignableRoles(actor);
}
