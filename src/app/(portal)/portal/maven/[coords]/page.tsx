import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
	PortalCard,
	PortalCardHeader,
	PortalCardTitle,
	PortalCardContent,
	PortalTable,
	PortalThead,
	PortalTh,
	PortalTbody,
	PortalTr,
	PortalTd,
	PortalBadge,
} from "@/components/portal/portal-ui";
import { getMavenArtifactDetail, parseMavenArtifactCoords } from "@/lib/maven-storage";
import { isResourcePublic, mavenVisibilityKey } from "@/lib/visibility";
import { mavenArtifactCoords, mavenRepositoryPath } from "@/lib/maven-utils";
import { formatBytes, formatDate } from "@/lib/utils";
import { CopySnippet } from "@/components/portal/copy-snippet";

export const dynamic = "force-dynamic";

interface Props {
	params: Promise<{ coords: string }>;
}

export default async function PortalMavenDetailPage({ params }: Props) {
	const { coords } = await params;
	const parsed = parseMavenArtifactCoords(coords);
	if (!parsed) notFound();

	const key = mavenVisibilityKey(parsed.groupId, parsed.artifactId);
	if (!isResourcePublic("maven", key)) notFound();

	const artifact = getMavenArtifactDetail(parsed.groupId, parsed.artifactId);
	if (!artifact) notFound();

	const publicUrl = (process.env.PUBLIC_URL || "http://localhost:3000").replace(/\/$/, "");
	const mavenUrl = `${publicUrl}/api/maven`;
	const coordsLabel = mavenArtifactCoords(parsed.groupId, parsed.artifactId);
	const latest = artifact.versions[artifact.versions.length - 1];

	return (
		<div>
			<Link href="/" className="inline-flex items-center gap-1.5 text-sm mb-4 portal-muted-hover">
				<ArrowLeft size={14} /> Catalog
			</Link>

			<div className="mb-6">
				<h1 className="text-2xl font-semibold portal-heading font-mono">{coordsLabel}</h1>
				<p className="text-sm mt-1 portal-muted">
					{artifact.versions.length} version{artifact.versions.length !== 1 ? "s" : ""}
				</p>
			</div>

			<div className="grid gap-4 lg:grid-cols-3">
				<PortalCard className="lg:col-span-2">
					<PortalCardHeader>
						<PortalCardTitle>Versions</PortalCardTitle>
					</PortalCardHeader>
					<PortalCardContent className="p-0">
						<PortalTable>
							<PortalThead>
								<PortalTr>
									<PortalTh>Version</PortalTh>
									<PortalTh>Size</PortalTh>
									<PortalTh>Updated</PortalTh>
									<PortalTh>Files</PortalTh>
								</PortalTr>
							</PortalThead>
							<PortalTbody>
								{artifact.versions.map((v) => (
									<PortalTr key={v.version}>
										<PortalTd>
											<PortalBadge variant="purple">{v.version}</PortalBadge>
										</PortalTd>
										<PortalTd>{formatBytes(v.size)}</PortalTd>
										<PortalTd className="portal-td-muted">
											{v.modified ? formatDate(v.modified) : "—"}
										</PortalTd>
										<PortalTd className="text-xs portal-td-muted">
											{v.files.length} file(s)
										</PortalTd>
									</PortalTr>
								))}
							</PortalTbody>
						</PortalTable>
					</PortalCardContent>
				</PortalCard>

				<div className="space-y-4">
					<PortalCard>
						<PortalCardHeader>
							<PortalCardTitle>Maven dependency</PortalCardTitle>
						</PortalCardHeader>
						<PortalCardContent>
							<CopySnippet
								label="pom.xml"
								value={`<dependency>
  <groupId>${parsed.groupId}</groupId>
  <artifactId>${parsed.artifactId}</artifactId>
  <version>${latest?.version ?? "VERSION"}</version>
</dependency>`}
							/>
						</PortalCardContent>
					</PortalCard>

					<PortalCard>
						<PortalCardHeader>
							<PortalCardTitle>Repository</PortalCardTitle>
						</PortalCardHeader>
						<PortalCardContent>
							<CopySnippet
								label="Direct URL (latest JAR)"
								value={
									latest
										? `${mavenUrl}/${mavenRepositoryPath(parsed.groupId, parsed.artifactId, latest.version, `${parsed.artifactId}-${latest.version}.jar`)}`
										: mavenUrl
								}
							/>
						</PortalCardContent>
					</PortalCard>
				</div>
			</div>
		</div>
	);
}
