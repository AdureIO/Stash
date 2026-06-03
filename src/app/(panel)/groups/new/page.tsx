import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { GroupForm } from "../group-form";
import { db } from "@/lib/db";
import { getActorUser, requirePanelAdmin } from "@/lib/auth";
import { filterUsersForActor } from "@/lib/space-access";

export const dynamic = "force-dynamic";

export default async function NewGroupPage() {
	try {
		await requirePanelAdmin();
	} catch {
		redirect("/");
	}

	const actor = await getActorUser();
	if (!actor) redirect("/");

	const allUsers = filterUsersForActor(
		actor,
		db.users.findAll().map(({ password_hash: _omit, ...u }) => u),
	);

	return (
		<div>
			<Header title="New group" subtitle="Define repository access and assign members" />
			<GroupForm mode="create" allUsers={allUsers} />
		</div>
	);
}
