import Link from "next/link";
import { Package, BookOpen, Box, ArrowUpRight } from "lucide-react";
import { PortalHero } from "@/components/portal/portal-hero";
import { PortalCard, PortalCardContent, PortalCardHover } from "@/components/portal/portal-ui";
import { getFeatures } from "@/lib/features";
import { publicResourceKeys } from "@/lib/visibility";
import { listRepositories, listTags } from "@/lib/registry";
import { listMavenArtifacts } from "@/lib/maven-storage";
import { listPackages } from "@/lib/npm-registry";
import { mavenArtifactCoords } from "@/lib/maven-utils";
import { formatBytes } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function getDockerSummaries(publicRepos: Set<string>) {
	const repos = (await listRepositories()).filter((name) => publicRepos.has(name));
	return Promise.all(
		repos.map(async (name) => ({
			name,
			tagCount: (await listTags(name)).length,
		})),
	);
}

export default async function PortalPage() {
	const features = getFeatures();
	const publicDocker = features.docker ? publicResourceKeys("docker") : new Set<string>();
	const publicMaven = features.maven ? publicResourceKeys("maven") : new Set<string>();
	const publicNpm = features.npm ? publicResourceKeys("npm") : new Set<string>();

	const dockerRepos = publicDocker.size ? await getDockerSummaries(publicDocker) : [];
	const mavenArtifacts = publicMaven.size
		? listMavenArtifacts().filter((a) => publicMaven.has(`maven:${mavenArtifactCoords(a.groupId, a.artifactId)}`))
		: [];
	const npmPackages = publicNpm.size ? listPackages().filter((p) => publicNpm.has(p.name)) : [];

	const totalCount = dockerRepos.length + mavenArtifacts.length + npmPackages.length;

	return (
		<div>
			<PortalHero features={features} totalCount={totalCount} />

			{totalCount === 0 ? (
				<PortalCard className="portal-card-dashed">
					<PortalCardContent className="py-20 text-center">
						<div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 portal-empty-icon">
							<Package size={24} strokeWidth={1.5} />
						</div>
						<p className="text-sm font-medium portal-empty-title">Nothing published yet</p>
						<p className="text-xs portal-muted mt-1">Check back soon.</p>
					</PortalCardContent>
				</PortalCard>
			) : (
				<div className="space-y-10">
					{features.docker && dockerRepos.length > 0 && (
						<section>
							<SectionHeader
								icon={Package}
								label="Docker images"
								count={dockerRepos.length}
								accent="blue"
							/>
							<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
								{dockerRepos.map((repo) => (
									<PackageCard
										key={repo.name}
										href={`/portal/docker/${encodeURIComponent(repo.name)}`}
										name={repo.name}
										meta={`${repo.tagCount} tag${repo.tagCount !== 1 ? "s" : ""}`}
										accent="blue"
									/>
								))}
							</div>
						</section>
					)}

					{features.maven && mavenArtifacts.length > 0 && (
						<section>
							<SectionHeader
								icon={BookOpen}
								label="Maven packages"
								count={mavenArtifacts.length}
								accent="purple"
							/>
							<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
								{mavenArtifacts.map((a) => {
									const coords = mavenArtifactCoords(a.groupId, a.artifactId);
									return (
										<PackageCard
											key={coords}
											href={`/portal/maven/${encodeURIComponent(coords)}`}
											name={coords}
											meta={`${a.versions.length} version${a.versions.length !== 1 ? "s" : ""} · ${formatBytes(a.size)}`}
											accent="purple"
										/>
									);
								})}
							</div>
						</section>
					)}

					{features.npm && npmPackages.length > 0 && (
						<section>
							<SectionHeader
								icon={Box}
								label="NPM packages"
								count={npmPackages.length}
								accent="emerald"
							/>
							<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
								{npmPackages.map((p) => (
									<PackageCard
										key={p.name}
										href={`/portal/npm/${encodeURIComponent(p.name)}`}
										name={p.name}
										meta={`${p.versions.length} version${p.versions.length !== 1 ? "s" : ""} · ${formatBytes(p.size)}`}
										accent="emerald"
									/>
								))}
							</div>
						</section>
					)}
				</div>
			)}
		</div>
	);
}

function SectionHeader({
	icon: Icon,
	label,
	count,
	accent,
}: {
	icon: React.ElementType;
	label: string;
	count: number;
	accent: "blue" | "purple" | "emerald";
}) {
	return (
		<div className="flex items-center gap-2.5 mb-4">
			<div className={`portal-section-icon portal-section-icon--${accent}`}>
				<Icon size={16} strokeWidth={1.75} />
			</div>
			<h2 className="text-base font-semibold portal-section-title">{label}</h2>
			<span className="portal-count-badge">{count}</span>
		</div>
	);
}

function PackageCard({
	href,
	name,
	meta,
	accent,
}: {
	href: string;
	name: string;
	meta: string;
	accent: "blue" | "purple" | "emerald";
}) {
	return (
		<Link href={href}>
			<PortalCardHover accent={accent} className="h-full">
				<PortalCardContent className="py-4 flex items-start justify-between gap-3">
					<div className="min-w-0">
						<p className="font-mono text-sm font-medium portal-package-name truncate">{name}</p>
						<p className="text-xs portal-muted mt-1">{meta}</p>
					</div>
					<ArrowUpRight size={14} className="portal-arrow shrink-0 mt-0.5" />
				</PortalCardContent>
			</PortalCardHover>
		</Link>
	);
}
