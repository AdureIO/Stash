import { redirect, notFound } from "next/navigation";
import { Header } from "@/components/layout/header";
import { GroupForm } from "../group-form";
import { db } from "@/lib/db";
import { getActorUser, requirePanelAdmin } from "@/lib/auth";
import { canManageGroup, filterUsersForActor } from "@/lib/space-access";

export const dynamic = "force-dynamic";

interface Props {
	params: Promise<{ id: string }>;
}

export default async function EditGroupPage({ params }: Props) {
	try {
		await requirePanelAdmin();
	} catch {
		redirect("/dashboard");
	}

	const actor = await getActorUser();
	if (!actor) redirect("/dashboard");

	const { id } = await params;
	const groupId = Number(id);
	if (!canManageGroup(actor, groupId)) redirect("/groups");

	const group = db.groups.findById(groupId);
	if (!group) notFound();

	const members = db.groups.members(group.id);
	const rules = db.groups.rules(group.id);
	const allUsers = filterUsersForActor(
		actor,
		db.users.findAll().map(({ password_hash: _omit, ...u }) => u),
	);

	return (
		<div>
			<Header title={group.name} subtitle="Edit repository access and members" />
			<GroupForm mode="edit" group={group} members={members} rules={rules} allUsers={allUsers} />
		</div>
	);
}
