import { NextRequest, NextResponse } from "next/server";
import { getActorUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listRepositories, listTags } from "@/lib/registry";
import { dockerResourceKeys, filterResourcesByViewAccess } from "@/lib/access-control";

export async function GET(req: NextRequest) {
	const actor = await getActorUser();
	if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const q = req.nextUrl.searchParams.get("q") || "";
	if (q.length < 2) return NextResponse.json({ repositories: [], events: [] });

	let allRepos = await listRepositories();
	allRepos = filterResourcesByViewAccess(actor, allRepos, (name) => dockerResourceKeys(name));

	const [matchingRepos, events] = await Promise.all([
		Promise.resolve(allRepos.filter((name) => name.toLowerCase().includes(q.toLowerCase()))),
		db.events.search(q, 20),
	]);

	const reposWithCounts = await Promise.all(
		matchingRepos.slice(0, 10).map(async (name) => ({
			name,
			tagCount: (await listTags(name)).length,
		})),
	);

	return NextResponse.json({ repositories: reposWithCounts, events });
}
