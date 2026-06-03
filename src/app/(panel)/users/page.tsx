import { redirect } from "next/navigation";
import { UserList } from "./user-list";
import { Header } from "@/components/layout/header";
import { db } from "@/lib/db";
import { getActorUser, requirePanelAdmin } from "@/lib/auth";
import { filterUsersForActor } from "@/lib/space-access";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
	// Admin-only — enforce server-side before any data loads
	try {
		await requirePanelAdmin();
	} catch {
		redirect("/");
	}

	const actor = await getActorUser();
	if (!actor) redirect("/");

	const users = filterUsersForActor(actor, db.users.findAll());
	// Strip password_hash before serialising into the RSC payload
	const usersWithRules = users.map(({ password_hash: _omit, ...u }) => ({
		...u,
		rules: db.rules.findByUser(u.id),
		groups: db.groups.userGroups(u.id).map((g) => ({ id: g.id, name: g.name })),
	}));

	return (
		<div>
			<Header title="Users" subtitle="Manage accounts, roles, and group membership" />
			<UserList users={usersWithRules} />
		</div>
	);
}
