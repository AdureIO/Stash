import { db, type User, type UserRole } from "./db";
import { isSuperAdminRole } from "./roles";

export type DefaultAccess = "deny" | "allow";
export type RegistryAction = "pull" | "push" | "delete";

export interface AccessRuleSource {
	repository: string;
	actions: string;
	source: "user" | "group";
	groupName?: string;
}

/** Whether a repository pattern matches a resource identifier (Docker, Maven, NPM). */
export function repoMatches(pattern: string, name: string): boolean {
	if (pattern === "*") return true;
	if (pattern === name) return true;
	if (pattern.endsWith(":*")) {
		const prefix = pattern.slice(0, -2);
		return name === prefix || name.startsWith(`${prefix}:`);
	}
	if (pattern.endsWith("/*")) {
		const prefix = pattern.slice(0, -2);
		return name === prefix || name.startsWith(`${prefix}/`) || name.startsWith(`${prefix}:`);
	}
	if (pattern.endsWith("/**")) {
		const prefix = pattern.slice(0, -3);
		return name === prefix || name.startsWith(`${prefix}/`) || name.startsWith(`${prefix}:`);
	}
	return false;
}

export function userDefaultAccess(user: User): DefaultAccess {
	return user.default_access === "allow" ? "allow" : "deny";
}

/** Actions the role may perform when access to a resource is granted. */
export function roleActionCeiling(role: UserRole): Set<RegistryAction> {
	if (role === "superadmin" || role === "admin") return new Set(["pull", "push", "delete"]);
	if (role === "push") return new Set(["pull", "push"]);
	return new Set(["pull"]);
}

export function collectRulesForUser(userId: number): AccessRuleSource[] {
	const userRules = db.rules.findByUser(userId).map((r) => ({
		repository: r.repository,
		actions: r.actions,
		source: "user" as const,
	}));
	const groupRules: AccessRuleSource[] = [];
	for (const group of db.groups.userGroups(userId)) {
		for (const rule of db.groups.rules(group.id)) {
			groupRules.push({
				repository: rule.repository,
				actions: rule.actions,
				source: "group",
				groupName: group.name,
			});
		}
	}
	return [...userRules, ...groupRules];
}

function parseRuleActions(actions: string): Set<RegistryAction> {
	const set = new Set<RegistryAction>();
	for (const part of actions.split(",")) {
		const a = part.trim() as RegistryAction;
		if (a === "pull" || a === "push" || a === "delete") set.add(a);
	}
	return set;
}

/** Allowed actions for a resource, after role ceiling and default-access policy. */
export function allowedActionsForResource(user: User, resourceKeys: string[]): Set<RegistryAction> {
	if (isSuperAdminRole(user.role)) return new Set(["pull", "push", "delete"]);

	const ceiling = roleActionCeiling(user.role);
	const allowed = new Set<RegistryAction>();
	const rules = collectRulesForUser(user.id);
	const policy = userDefaultAccess(user);

	for (const key of resourceKeys) {
		if (key) mergeRuleActions(allowed, key, rules, ceiling);
	}

	if (policy === "allow") {
		for (const action of ceiling) allowed.add(action);
	}

	return allowed;
}

function mergeRuleActions(
	target: Set<RegistryAction>,
	resourceKey: string,
	rules: AccessRuleSource[],
	ceiling: Set<RegistryAction>,
) {
	for (const rule of rules) {
		if (!repoMatches(rule.repository, resourceKey)) continue;
		for (const action of parseRuleActions(rule.actions)) {
			if (ceiling.has(action)) target.add(action);
		}
	}
}

export function canResourceAction(user: User, resourceKeys: string[], action: RegistryAction): boolean {
	return allowedActionsForResource(user, resourceKeys).has(action);
}

/** Docker registry repository name (e.g. org/team/app). */
export function dockerResourceKeys(repository: string): string[] {
	return [repository];
}

/**
 * Maven path segments under MAVEN_ROOT.
 * Layout: {groupId path}/{artifactId}/{version}/{file}
 */
export function mavenResourceKeys(segments: string[]): string[] {
	if (!segments.length) return [];

	const keys = new Set<string>();
	let end = segments.length;
	const last = segments[end - 1];
	if (last?.includes(".") || last === "maven-metadata.xml") end -= 1;
	if (end < segments.length && end >= 2) {
		const artifactIdx = end - 1;
		const groupSegments = segments.slice(0, artifactIdx);
		const artifactId = segments[artifactIdx];
		if (groupSegments.length && artifactId) {
			const groupPath = groupSegments.join("/");
			const groupId = groupSegments.join(".");
			keys.add(`${groupPath}/${artifactId}`);
			keys.add(`maven:${groupId}:${artifactId}`);
			keys.add(groupPath);
			keys.add(`maven:${groupId}`);
		}
	}
	for (let i = 1; i <= segments.length; i++) {
		keys.add(segments.slice(0, i).join("/"));
	}
	return [...keys];
}

/** NPM package name (@scope/pkg or name). */
export function npmResourceKeys(packageName: string): string[] {
	return [packageName, `npm:${packageName}`];
}

/** Merged inherited rules for admin UI (deduped by pattern+actions+source). */
export function effectiveAccessOverview(userId: number): AccessRuleSource[] {
	return collectRulesForUser(userId);
}

export function userCanViewResource(user: User, resourceKeys: string[]): boolean {
	if (isSuperAdminRole(user.role)) return true;
	return canResourceAction(user, resourceKeys, "pull");
}

export function filterResourcesByViewAccess<T>(user: User, items: T[], keysFor: (item: T) => string[]): T[] {
	if (isSuperAdminRole(user.role)) return items;
	return items.filter((item) => userCanViewResource(user, keysFor(item)));
}

/** Registry/UI destructive ops when user has delete on resource (or is super-admin). */
export function canManageResource(user: User, resourceKeys: string[]): boolean {
	if (isSuperAdminRole(user.role)) return true;
	return canResourceAction(user, resourceKeys, "delete");
}
