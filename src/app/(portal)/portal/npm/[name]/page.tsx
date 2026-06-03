import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
	PortalCard,
	PortalCardHeader,
	PortalCardTitle,
	PortalCardContent,
	PortalBadge,
} from "@/components/portal/portal-ui";
import { isResourcePublic } from "@/lib/visibility";
import { buildPackageMeta } from "@/lib/npm-registry";
import { CopySnippet } from "@/components/portal/copy-snippet";

export const dynamic = "force-dynamic";

interface Props {
	params: Promise<{ name: string }>;
}

export default async function PortalNpmDetailPage({ params }: Props) {
	const { name } = await params;
	const pkgName = decodeURIComponent(name);

	if (!isResourcePublic("npm", pkgName)) notFound();

	const publicUrl = (process.env.PUBLIC_URL || "http://localhost:3000").replace(/\/$/, "");
	const registryUrl = `${publicUrl}/api/npm/`;
	const meta = buildPackageMeta(pkgName, publicUrl);
	if (!meta) notFound();

	const versions = Object.keys(meta.versions || {}).sort();

	return (
		<div>
			<Link href="/" className="inline-flex items-center gap-1.5 text-sm mb-4 portal-muted-hover">
				<ArrowLeft size={14} /> Catalog
			</Link>

			<div className="mb-6">
				<h1 className="text-2xl font-semibold portal-heading font-mono">{pkgName}</h1>
				<p className="text-sm mt-1 portal-muted">
					{versions.length} version{versions.length !== 1 ? "s" : ""}
				</p>
			</div>

			<div className="grid gap-4 lg:grid-cols-3">
				<PortalCard className="lg:col-span-2">
					<PortalCardHeader>
						<PortalCardTitle>Versions</PortalCardTitle>
					</PortalCardHeader>
					<PortalCardContent>
						<div className="flex flex-wrap gap-2">
							{versions.map((v) => {
								const info = meta.versions[v];
								return (
									<div key={v} className="portal-version-chip">
										<PortalBadge variant="success">{v}</PortalBadge>
										{info?.dist?.shasum && (
											<span className="text-xs portal-muted font-mono">
												{info.dist.shasum.slice(0, 12)}…
											</span>
										)}
									</div>
								);
							})}
						</div>
					</PortalCardContent>
				</PortalCard>

				<div className="space-y-4">
					<PortalCard>
						<PortalCardHeader>
							<PortalCardTitle>Install</PortalCardTitle>
						</PortalCardHeader>
						<PortalCardContent>
							<CopySnippet
								label="npm install"
								value={`npm install ${pkgName}${versions.length ? `@${versions[versions.length - 1]}` : ""} --registry=${registryUrl}`}
							/>
						</PortalCardContent>
					</PortalCard>

					<PortalCard>
						<PortalCardHeader>
							<PortalCardTitle>.npmrc</PortalCardTitle>
						</PortalCardHeader>
						<PortalCardContent>
							<CopySnippet label="Registry" value={`registry=${registryUrl}`} />
						</PortalCardContent>
					</PortalCard>
				</div>
			</div>
		</div>
	);
}
