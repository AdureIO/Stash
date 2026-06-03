import { db, type SsoProvider } from "./db";

/** Add user to the SSO provider's default group (idempotent). */
export function applySsoGroupMembership(userId: number, provider: SsoProvider): void {
	if (!provider.default_group_id) return;
	const group = db.groups.findById(provider.default_group_id);
	if (!group) return;
	db.groups.addMember(provider.default_group_id, userId);
}

export function parseDefaultGroupId(value: unknown): number | null {
	if (value === "" || value === null || value === undefined) return null;
	const id = Number(value);
	if (!Number.isInteger(id) || id <= 0) return null;
	return id;
}

export function validateDefaultGroupId(groupId: number | null): string | null {
	if (groupId === null) return null;
	if (!db.groups.findById(groupId)) return "Group not found";
	return null;
}
