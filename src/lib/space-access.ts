import { db, type User, type UserRole } from "./db";
import { collectRulesForUser, repoMatches } from "./access-control";
import { isSuperAdminRole, isPanelAdminRole } from "./roles";

export function isSuperAdmin(user: Pick<User, "role">): boolean {
	return isSuperAdminRole(user.role);
}

export function isPanelAdmin(user: Pick<User, "role">): boolean {
	return isPanelAdminRole(user.role);
}

/** Repository patterns that define spaces a space-admin may govern. */
export function adminScopePatterns(userId: number): string[] {
	return [...new Set(collectRulesForUser(userId).map((r) => r.repository))];
}

/** True when every resource matching `targetPattern` is within `adminPattern`. */
export function patternCoversScope(adminPattern: string, targetPattern: string): boolean {
	if (adminPattern === "*") return true;
	if (adminPattern === targetPattern) return true;
	if (adminPattern.endsWith("/*")) {
		const prefix = adminPattern.slice(0, -2);
		if (targetPattern === prefix) return true;
		if (targetPattern.startsWith(`${prefix}/`)) return true;
		if (targetPattern.startsWith(`${prefix}:`)) return true;
	}
	if (adminPattern.endsWith("/**")) {
		const prefix = adminPattern.slice(0, -3);
		if (targetPattern === prefix) return true;
		if (targetPattern.startsWith(`${prefix}/`)) return true;
		if (targetPattern.startsWith(`${prefix}:`)) return true;
	}
	if (adminPattern.endsWith(":*")) {
		const prefix = adminPattern.slice(0, -2);
		if (targetPattern === prefix || targetPattern.startsWith(`${prefix}:`)) return true;
	}
	return repoMatches(adminPattern, targetPattern);
}

export function canAdminScopePatterns(actor: User, patterns: string[]): boolean {
	if (isSuperAdmin(actor)) return true;
	if (actor.role !== "admin") return false;
	const scopes = adminScopePatterns(actor.id);
	if (!scopes.length) return false;
	return patterns.every((tp) => scopes.some((ap) => patternCoversScope(ap, tp)));
}

export function canManageGroup(actor: User, groupId: number): boolean {
	if (isSuperAdmin(actor)) return true;
	if (actor.role !== "admin") return false;
	const rules = db.groups.rules(groupId);
	if (!rules.length) return false;
	return canAdminScopePatterns(
		actor,
		rules.map((r) => r.repository),
	);
}

export function canManageUser(actor: User, targetId: number): boolean {
	if (actor.id === targetId) return true;
	if (isSuperAdmin(actor)) return true;
	if (actor.role !== "admin") return false;
	const target = db.users.findById(targetId);
	if (!target) return false;
	if (isSuperAdmin(target)) return false;

	const groups = db.groups.userGroups(targetId);
	if (groups.length === 0) return adminScopePatterns(actor.id).length > 0;
	return groups.every((g) => canManageGroup(actor, g.id));
}

export function assignableRoles(actor: User): UserRole[] {
	if (isSuperAdmin(actor)) return ["superadmin", "admin", "push", "viewer"];
	if (actor.role === "admin") return ["admin", "push", "viewer"];
	return [];
}

export function canAssignRole(actor: User, role: string): boolean {
	return assignableRoles(actor).includes(role as UserRole);
}

export function filterManageableGroupIds(actor: User, groupIds: number[]): number[] {
	return groupIds.filter((id) => canManageGroup(actor, id));
}

export function filterUsersForActor<T extends { id: number; role: string }>(actor: User, users: T[]): T[] {
	if (isSuperAdmin(actor)) return users;
	return users.filter((u) => canManageUser(actor, u.id));
}

export function filterGroupsForActor<T extends { id: number }>(actor: User, groups: T[]): T[] {
	if (isSuperAdmin(actor)) return groups;
	return groups.filter((g) => canManageGroup(actor, g.id));
}
