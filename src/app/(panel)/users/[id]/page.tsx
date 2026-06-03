import { redirect, notFound } from "next/navigation";
import { Header } from "@/components/layout/header";
import { UserForm } from "../user-form";
import { db } from "@/lib/db";
import { getActorUser, requirePanelAdmin } from "@/lib/auth";
import { canManageUser, filterGroupsForActor } from "@/lib/space-access";
import { assignableRolesForActor } from "@/lib/user-admin";
import { effectiveAccessOverview } from "@/lib/access-control";

export const dynamic = "force-dynamic";

interface Props {
	params: Promise<{ id: string }>;
}

export default async function EditUserPage({ params }: Props) {
	try {
		await requirePanelAdmin();
	} catch {
		redirect("/dashboard");
	}

	const actor = await getActorUser();
	if (!actor) redirect("/dashboard");

	const { id } = await params;
	const userId = Number(id);
	if (!canManageUser(actor, userId)) redirect("/users");

	const user = db.users.findById(userId);
	if (!user) notFound();

	const { password_hash: _omit, ...safe } = user;
	const allGroups = filterGroupsForActor(actor, db.groups.findAll()).map((g) => ({
		id: g.id,
		name: g.name,
	}));
	const groups = db.groups.userGroups(user.id).map((g) => ({ id: g.id, name: g.name }));

	return (
		<div>
			<Header title={user.username} subtitle="Edit role and group membership" />
			<UserForm
				mode="edit"
				user={{ ...safe, groups }}
				allGroups={allGroups}
				inheritedRules={effectiveAccessOverview(user.id)}
				assignableRoles={assignableRolesForActor(actor)}
			/>
		</div>
	);
}
