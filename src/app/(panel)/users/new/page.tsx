import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { UserForm } from "../user-form";
import { db } from "@/lib/db";
import { getActorUser, requirePanelAdmin } from "@/lib/auth";
import { filterGroupsForActor } from "@/lib/space-access";
import { assignableRolesForActor } from "@/lib/user-admin";

export const dynamic = "force-dynamic";

export default async function NewUserPage() {
	try {
		await requirePanelAdmin();
	} catch {
		redirect("/");
	}

	const actor = await getActorUser();
	if (!actor) redirect("/");

	const allGroups = filterGroupsForActor(actor, db.groups.findAll()).map((g) => ({
		id: g.id,
		name: g.name,
	}));

	return (
		<div>
			<Header title="New user" subtitle="Create an account and assign role and groups" />
			<UserForm mode="create" allGroups={allGroups} assignableRoles={assignableRolesForActor(actor)} />
		</div>
	);
}
