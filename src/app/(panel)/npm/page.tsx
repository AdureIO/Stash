import { Header } from "@/components/layout/header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { getFeatures } from "@/lib/features";
import { redirect } from "next/navigation";
import { listPackages } from "@/lib/npm-registry";
import { NpmPackageList } from "./npm-package-list";
import { getActorUser } from "@/lib/auth";
import { filterResourcesByViewAccess, npmResourceKeys, canManageResource } from "@/lib/access-control";
import { isResourcePublic } from "@/lib/visibility";

export const dynamic = "force-dynamic";

export default async function NpmPage() {
	if (!getFeatures().npm) redirect("/dashboard");
	const actor = await getActorUser();
	let packages = listPackages();
	if (actor) {
		packages = filterResourcesByViewAccess(actor, packages, (pkg) => npmResourceKeys(pkg.name));
	}
	const publicUrl = process.env.PUBLIC_URL || "http://localhost:3000";
	const registryUrl = `${publicUrl}/api/npm`;
	const manageByName: Record<string, boolean> = {};
	const publicByName: Record<string, boolean> = {};
	for (const pkg of packages) {
		publicByName[pkg.name] = isResourcePublic("npm", pkg.name);
		manageByName[pkg.name] = actor ? canManageResource(actor, npmResourceKeys(pkg.name)) : false;
	}

	return (
		<div>
			<Header title="NPM Packages" subtitle={`${packages.length} packages in registry`} />

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
				<div className="lg:col-span-2">
					<NpmPackageList packages={packages} manageByName={manageByName} publicByName={publicByName} />
				</div>

				<div className="space-y-4">
					<Card>
						<CardHeader>
							<CardTitle>.npmrc</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							<pre className="text-xs bg-zinc-900 text-zinc-300 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{`registry=${registryUrl}/
//${publicUrl.replace(/^https?:\/\//, "")}/api/npm/:_authToken=YOUR_PAT`}</pre>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Login</CardTitle>
						</CardHeader>
						<CardContent>
							<pre className="text-xs bg-zinc-900 text-zinc-300 rounded-lg p-3">{`npm login --registry=${registryUrl}/`}</pre>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Publish</CardTitle>
						</CardHeader>
						<CardContent>
							<pre className="text-xs bg-zinc-900 text-zinc-300 rounded-lg p-3">{`npm publish --registry=${registryUrl}/`}</pre>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>package.json</CardTitle>
						</CardHeader>
						<CardContent>
							<pre className="text-xs bg-zinc-900 text-zinc-300 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{`"publishConfig": {
  "registry": "${registryUrl}/"
}`}</pre>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
