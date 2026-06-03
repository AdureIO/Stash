import { redirect } from "next/navigation";
import { GroupList } from "./group-list";
import { Header } from "@/components/layout/header";
import { db } from "@/lib/db";
import { getActorUser, requirePanelAdmin } from "@/lib/auth";
import { filterGroupsForActor } from "@/lib/space-access";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
	try {
		await requirePanelAdmin();
	} catch {
		redirect("/");
	}

	const actor = await getActorUser();
	if (!actor) redirect("/");

	const groups = filterGroupsForActor(actor, db.groups.findAll()).map((g) => ({
		...g,
		members: db.groups.members(g.id),
		rules: db.groups.rules(g.id),
	}));
	return (
		<div>
			<Header
				title="Groups"
				subtitle="Define repository access per group, then assign users to inherit that access"
			/>
			<GroupList groups={groups} />
		</div>
	);
}
