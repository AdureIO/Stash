import { Header } from "@/components/layout/header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatBytes } from "@/lib/utils";
import { MavenPackageList, type MavenListItem } from "./maven-package-list";
import { listMavenArtifacts } from "@/lib/maven-storage";
import { latestVersionScan } from "@/lib/maven-scans";

export const dynamic = "force-dynamic";

import { getFeatures } from "@/lib/features";
import { redirect } from "next/navigation";
import { getActorUser } from "@/lib/auth";
import { filterResourcesByViewAccess } from "@/lib/access-control";
import { mavenScanRepository } from "@/lib/maven-utils";

export default async function PackagesPage() {
	if (!getFeatures().maven) redirect("/");
	const actor = await getActorUser();
	let raw = listMavenArtifacts();
	if (actor) {
		raw = filterResourcesByViewAccess(actor, raw, (a) => [
			mavenScanRepository(a.groupId, a.artifactId),
			`maven:${a.groupId}:${a.artifactId}`,
		]);
	}
	const artifacts: MavenListItem[] = raw.map((a) => {
		const { latestVersion, latestScan } = latestVersionScan(a.groupId, a.artifactId, a.versions);
		return { ...a, latestVersion, latestScan };
	});
	const totalSize = artifacts.reduce((s, a) => s + a.size, 0);

	const publicUrl = process.env.PUBLIC_URL || "http://localhost:3000";
	const mavenUrl = `${publicUrl}/api/maven`;

	return (
		<div>
			<Header
				title="Maven Packages"
				subtitle={`${artifacts.length} ${artifacts.length === 1 ? "artifact" : "artifacts"} · ${formatBytes(totalSize)}`}
			/>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
				<div className="lg:col-span-2">
					<MavenPackageList artifacts={artifacts} />
				</div>

				{/* Usage sidebar */}
				<div className="space-y-4">
					<Card>
						<CardHeader>
							<CardTitle>Maven</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							<div>
								<p className="text-xs font-medium text-zinc-500 mb-1.5">~/.m2/settings.xml</p>
								<pre className="text-xs bg-zinc-900 text-zinc-300 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{`<server>
  <id>registry</id>
  <username>YOUR_USER</username>
  <password>YOUR_PASS</password>
</server>`}</pre>
							</div>
							<div>
								<p className="text-xs font-medium text-zinc-500 mb-1.5">pom.xml</p>
								<pre className="text-xs bg-zinc-900 text-zinc-300 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{`<repository>
  <id>registry</id>
  <url>${mavenUrl}</url>
</repository>

<distributionManagement>
  <repository>
    <id>registry</id>
    <url>${mavenUrl}</url>
  </repository>
</distributionManagement>`}</pre>
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Gradle</CardTitle>
						</CardHeader>
						<CardContent>
							<pre className="text-xs bg-zinc-900 text-zinc-300 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{`maven {
  url = "${mavenUrl}"
  credentials {
    username = "YOUR_USER"
    password = "YOUR_PASS"
  }
}`}</pre>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Deploy</CardTitle>
						</CardHeader>
						<CardContent>
							<pre className="text-xs bg-zinc-900 text-zinc-300 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{`mvn deploy \\
  -DaltDeploymentRepository=\\
  registry::${mavenUrl}`}</pre>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
