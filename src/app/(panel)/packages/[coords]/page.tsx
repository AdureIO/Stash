import Link from "next/link";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getFeatures } from "@/lib/features";
import { getActorUser } from "@/lib/auth";
import { canManageResource, userCanViewResource } from "@/lib/access-control";
import { mavenScanRepository } from "@/lib/maven-utils";
import { getMavenArtifactDetail, parseMavenArtifactCoords } from "@/lib/maven-storage";
import { buildScansByVersion } from "@/lib/maven-scans";
import { MavenArtifactDetailView } from "../maven-artifact-detail";

export const dynamic = "force-dynamic";

interface Props {
	params: Promise<{ coords: string }>;
}

export default async function MavenArtifactPage({ params }: Props) {
	if (!getFeatures().maven) redirect("/");

	const { coords } = await params;
	const parsed = parseMavenArtifactCoords(coords);
	if (!parsed) notFound();

	const artifact = getMavenArtifactDetail(parsed.groupId, parsed.artifactId);
	if (!artifact) notFound();

	const actor = await getActorUser();
	const mavenKeys = [
		mavenScanRepository(parsed.groupId, parsed.artifactId),
		`maven:${parsed.groupId}:${parsed.artifactId}`,
	];
	if (actor && !userCanViewResource(actor, mavenKeys)) notFound();
	const canManage = actor ? canManageResource(actor, mavenKeys) : false;
	const scansByVersion = buildScansByVersion(
		parsed.groupId,
		parsed.artifactId,
		artifact.versions.map((v) => v.version),
	);

	const publicUrl = process.env.PUBLIC_URL || "http://localhost:3000";
	const mavenBaseUrl = `${publicUrl}/api/maven`;

	return (
		<div>
			<Link
				href="/packages"
				className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 mb-4 transition-colors"
			>
				<ArrowLeft size={14} /> Maven packages
			</Link>

			<MavenArtifactDetailView
				artifact={artifact}
				mavenBaseUrl={mavenBaseUrl}
				scansByVersion={scansByVersion}
				isAdmin={canManage}
			/>
		</div>
	);
}
