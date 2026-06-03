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
import { getRepositoryDetail, listTags } from "@/lib/registry";
import { isResourcePublic } from "@/lib/visibility";
import { formatBytes, formatDate, shortDigest } from "@/lib/utils";
import { CopySnippet } from "@/components/portal/copy-snippet";

export const dynamic = "force-dynamic";

interface Props {
	params: Promise<{ name: string }>;
}

export default async function PortalDockerDetailPage({ params }: Props) {
	const { name } = await params;
	const repoName = decodeURIComponent(name);

	if (!isResourcePublic("docker", repoName)) notFound();

	const tags = await listTags(repoName);
	if (tags.length === 0) notFound();

	const details = await getRepositoryDetail(repoName);
	const publicUrl = (process.env.PUBLIC_URL || "http://localhost:3000").replace(/\/$/, "");
	const registryHost = publicUrl.replace(/^https?:\/\//, "");
	const pullExample = details[0]?.tag
		? `docker pull ${registryHost}/${repoName}:${details[0].tag}`
		: `docker pull ${registryHost}/${repoName}:TAG`;

	return (
		<div>
			<Link href="/" className="inline-flex items-center gap-1.5 text-sm mb-4 portal-muted-hover">
				<ArrowLeft size={14} /> Catalog
			</Link>

			<div className="mb-6">
				<h1 className="text-2xl font-semibold portal-heading font-mono">{repoName}</h1>
				<p className="text-sm mt-1 portal-muted">
					{tags.length} tag{tags.length !== 1 ? "s" : ""}
				</p>
			</div>

			<div className="grid gap-4 lg:grid-cols-3 mb-6">
				<PortalCard className="lg:col-span-2">
					<PortalCardHeader>
						<PortalCardTitle>Tags</PortalCardTitle>
					</PortalCardHeader>
					<PortalCardContent className="p-0">
						<PortalTable>
							<PortalThead>
								<PortalTr>
									<PortalTh>Tag</PortalTh>
									<PortalTh>Size</PortalTh>
									<PortalTh>Created</PortalTh>
									<PortalTh>Digest</PortalTh>
								</PortalTr>
							</PortalThead>
							<PortalTbody>
								{details.map((t) => (
									<PortalTr key={t.tag}>
										<PortalTd>
											<PortalBadge variant="info">{t.tag}</PortalBadge>
										</PortalTd>
										<PortalTd>{formatBytes(t.size)}</PortalTd>
										<PortalTd className="text-zinc-500">
											{t.created ? formatDate(t.created) : "—"}
										</PortalTd>
										<PortalTd className="font-mono text-xs text-zinc-500">
											{shortDigest(t.digest)}
										</PortalTd>
									</PortalTr>
								))}
							</PortalTbody>
						</PortalTable>
					</PortalCardContent>
				</PortalCard>

				<PortalCard>
					<PortalCardHeader>
						<PortalCardTitle>Pull</PortalCardTitle>
					</PortalCardHeader>
					<PortalCardContent>
						<CopySnippet label="Example" value={pullExample} />
					</PortalCardContent>
				</PortalCard>
			</div>
		</div>
	);
}
