"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Copy, HardDrive, Layers, Calendar, ExternalLink } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Header } from "@/components/layout/header";
import { Table, Thead, Th, Tbody, Tr, Td } from "@/components/ui/table";
import { ListToolbar } from "@/components/list/list-toolbar";
import { compareDates, compareNumbers, compareStrings, useSortedFilteredList } from "@/hooks/use-sorted-filtered-list";
import { formatBytes, formatDate, formatRelative } from "@/lib/utils";
import type { MavenArtifactDetail, MavenVersionDetail } from "@/lib/maven-utils";
import { mavenRepositoryPath } from "@/lib/maven-utils";
import type { ScanInfo } from "@/app/(panel)/repositories/[name]/scan-status-badge";
import { ScanSecurityCell } from "@/components/security/scan-security-cell";
import { apiFetch } from "@/lib/api";
import { mavenScanApiPath } from "@/lib/maven-utils";

const VERSION_SORT_OPTIONS = [
	{ id: "version", label: "Version" },
	{ id: "size", label: "Size" },
	{ id: "modified", label: "Updated" },
] as const;

const VERSION_COMPARATORS = {
	version: (a: MavenVersionDetail, b: MavenVersionDetail) => compareStrings(a.version, b.version),
	size: (a: MavenVersionDetail, b: MavenVersionDetail) => compareNumbers(a.size, b.size),
	modified: (a: MavenVersionDetail, b: MavenVersionDetail) => compareDates(a.modified, b.modified),
};

const FILE_KIND_VARIANT: Record<string, "default" | "info" | "purple" | "success" | "warning"> = {
	jar: "info",
	pom: "purple",
	war: "warning",
	aar: "success",
	sources: "default",
	javadoc: "default",
	metadata: "default",
	module: "info",
	file: "default",
};

function versionSearchText(v: MavenVersionDetail) {
	return `${v.version} ${v.files.map((f) => f.name).join(" ")}`;
}

function isSnapshot(version: string) {
	return version.includes("SNAPSHOT");
}

function StatCard({ icon: Icon, value, label }: { icon: React.ElementType; value: React.ReactNode; label: string }) {
	return (
		<Card>
			<CardContent className="flex items-center gap-3 py-4">
				<Icon size={16} className="text-zinc-400 flex-shrink-0" />
				<div className="min-w-0">
					<p className="text-lg font-semibold text-zinc-900 truncate">{value}</p>
					<p className="text-xs text-zinc-500">{label}</p>
				</div>
			</CardContent>
		</Card>
	);
}

interface Props {
	artifact: MavenArtifactDetail;
	mavenBaseUrl: string;
	scansByVersion: Record<string, ScanInfo>;
	isAdmin: boolean;
}

export function MavenArtifactDetailView({ artifact, mavenBaseUrl, scansByVersion, isAdmin }: Props) {
	const router = useRouter();
	const [expanded, setExpanded] = useState<Record<string, boolean>>({});
	const [copied, setCopied] = useState<string | null>(null);
	const [scanning, setScanning] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);

	const releaseVersion = [...artifact.versions]
		.filter((v) => !isSnapshot(v.version))
		.map((v) => v.version)
		.pop();
	const latestVersion = artifact.versions.at(-1)?.version ?? null;
	const depVersion = releaseVersion ?? latestVersion ?? "VERSION";

	const lastModified = artifact.versions.reduce<string | null>((latest, v) => {
		if (!v.modified) return latest;
		if (!latest || v.modified > latest) return v.modified;
		return latest;
	}, null);

	const versionList = useSortedFilteredList(artifact.versions, versionSearchText, "version", VERSION_COMPARATORS);

	const coords = `${artifact.groupId}:${artifact.artifactId}`;
	const repositoryUrl = `${mavenBaseUrl}/${mavenRepositoryPath(artifact.groupId, artifact.artifactId)}`;
	const metadataUrl = `${repositoryUrl}/maven-metadata.xml`;
	const subtitle = `${artifact.versions.length} version${artifact.versions.length !== 1 ? "s" : ""} · ${formatBytes(artifact.size)}`;

	async function copyText(label: string, text: string) {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(label);
			setTimeout(() => setCopied(null), 2000);
		} catch {
			/* ignore */
		}
	}

	function fileUrl(version: string, filename: string) {
		return `${mavenBaseUrl}/${mavenRepositoryPath(artifact.groupId, artifact.artifactId, version, filename)}`;
	}

	async function handleScan(version: string) {
		setScanning(version);
		setMessage(null);
		const { ok, error } = await apiFetch(mavenScanApiPath(coords, version), { method: "POST" });
		setScanning(null);
		if (!ok) setMessage(error || "Scan failed");
		else router.refresh();
	}

	return (
		<div>
			<Header title={coords} subtitle={subtitle} />

			{message && (
				<p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
					{message}
				</p>
			)}

			<div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
				<StatCard icon={HardDrive} value={formatBytes(artifact.size)} label="Total size" />
				<StatCard
					icon={Layers}
					value={artifact.versions.length}
					label={`Versions · ${artifact.releaseCount} release${artifact.releaseCount !== 1 ? "s" : ""}, ${artifact.snapshotCount} snapshot${artifact.snapshotCount !== 1 ? "s" : ""}`}
				/>
				<StatCard icon={Calendar} value={formatRelative(lastModified)} label="Last updated" />
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
				<Card>
					<CardHeader>
						<CardTitle>Repository</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3 text-sm">
						<div>
							<p className="text-xs font-medium text-zinc-500 mb-1">Base URL</p>
							<code className="text-xs font-mono text-zinc-800 break-all block">{repositoryUrl}</code>
							<div className="flex items-center gap-3 mt-1.5">
								<button
									type="button"
									onClick={() => copyText("repo", repositoryUrl)}
									className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
								>
									<Copy size={12} />
									{copied === "repo" ? "Copied" : "Copy"}
								</button>
								<a
									href={metadataUrl}
									target="_blank"
									rel="noreferrer"
									className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
								>
									<ExternalLink size={12} /> maven-metadata.xml
								</a>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-1">
							<div>
								<p className="text-xs text-zinc-500">Group ID</p>
								<code className="text-xs font-mono text-zinc-900">{artifact.groupId}</code>
							</div>
							<div>
								<p className="text-xs text-zinc-500">Artifact ID</p>
								<code className="text-xs font-mono text-zinc-900">{artifact.artifactId}</code>
							</div>
							<div>
								<p className="text-xs text-zinc-500">Release</p>
								<p className="text-xs font-mono text-zinc-900">{releaseVersion ?? "—"}</p>
							</div>
							<div>
								<p className="text-xs text-zinc-500">Latest</p>
								<p className="text-xs font-mono text-zinc-900 flex items-center gap-1.5">
									{latestVersion ?? "—"}
									{latestVersion && isSnapshot(latestVersion) && (
										<Badge variant="warning">SNAPSHOT</Badge>
									)}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Usage snippets</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div>
							<p className="text-xs font-medium text-zinc-500 mb-1.5">Maven</p>
							<pre className="text-xs bg-zinc-900 text-zinc-300 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{`<dependency>
  <groupId>${artifact.groupId}</groupId>
  <artifactId>${artifact.artifactId}</artifactId>
  <version>${depVersion}</version>
</dependency>`}</pre>
							<button
								type="button"
								onClick={() =>
									copyText(
										"pom",
										`<dependency>\n  <groupId>${artifact.groupId}</groupId>\n  <artifactId>${artifact.artifactId}</artifactId>\n  <version>${depVersion}</version>\n</dependency>`,
									)
								}
								className="mt-1.5 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
							>
								<Copy size={12} />
								{copied === "pom" ? "Copied" : "Copy"}
							</button>
						</div>
						<div>
							<p className="text-xs font-medium text-zinc-500 mb-1.5">Gradle</p>
							<pre className="text-xs bg-zinc-900 text-zinc-300 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{`implementation "${artifact.groupId}:${artifact.artifactId}:${depVersion}"`}</pre>
							<button
								type="button"
								onClick={() =>
									copyText(
										"gradle",
										`implementation "${artifact.groupId}:${artifact.artifactId}:${depVersion}"`,
									)
								}
								className="mt-1.5 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
							>
								<Copy size={12} />
								{copied === "gradle" ? "Copied" : "Copy"}
							</button>
						</div>
					</CardContent>
				</Card>
			</div>

			<Card className="mb-6">
				<CardHeader>
					<CardTitle>Versions</CardTitle>
				</CardHeader>
				{artifact.versions.length > 0 && (
					<div className="px-5 pb-4">
						<ListToolbar
							search={versionList.search}
							onSearchChange={versionList.setSearch}
							searchPlaceholder="Filter versions…"
							sortId={versionList.sortId}
							onSortChange={versionList.setSortId}
							sortOptions={[...VERSION_SORT_OPTIONS]}
							direction={versionList.direction}
							onToggleDirection={versionList.toggleDirection}
							visibleCount={versionList.visibleCount}
							totalCount={versionList.totalCount}
						/>
					</div>
				)}
				<Table>
					<Thead>
						<tr>
							<Th className="w-8" />
							<Th>Version</Th>
							<Th>Security</Th>
							<Th>Files</Th>
							<Th>Size</Th>
							<Th>Updated</Th>
							<Th>Dependency</Th>
						</tr>
					</Thead>
					<Tbody>
						{versionList.items.length === 0 ? (
							<Tr>
								<Td colSpan={7} className="text-center text-zinc-400 py-8">
									No versions match your search
								</Td>
							</Tr>
						) : (
							versionList.items.map((v) => {
								const open = expanded[v.version] ?? false;
								const scan = scansByVersion[v.version];
								const depSnippet = `${artifact.groupId}:${artifact.artifactId}:${v.version}`;

								return (
									<Fragment key={v.version}>
										<Tr>
											<Td>
												<button
													type="button"
													onClick={() =>
														setExpanded((prev) => ({ ...prev, [v.version]: !open }))
													}
													className="p-1 text-zinc-400 hover:text-zinc-600"
													aria-expanded={open}
													aria-label={open ? "Collapse files" : "Expand files"}
												>
													{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
												</button>
											</Td>
											<Td>
												<div className="flex items-center gap-2">
													<span className="font-mono text-sm font-medium text-zinc-900">
														{v.version}
													</span>
													{isSnapshot(v.version) && <Badge variant="warning">SNAPSHOT</Badge>}
												</div>
											</Td>
											<Td>
												<ScanSecurityCell
													repository={coords}
													tag={v.version}
													scan={scan}
													isAdmin={isAdmin}
													onScan={() => handleScan(v.version)}
													scanning={scanning === v.version}
													scanApiPath={mavenScanApiPath(coords, v.version)}
												/>
											</Td>
											<Td className="text-zinc-600 text-sm">{v.files.length}</Td>
											<Td>{formatBytes(v.size)}</Td>
											<Td className="text-zinc-500 text-xs">{formatDate(v.modified)}</Td>
											<Td>
												<code className="text-xs bg-zinc-50 border border-zinc-100 rounded px-2 py-0.5 text-zinc-600">
													{depSnippet}
												</code>
											</Td>
										</Tr>
										{open &&
											v.files.map((f) => (
												<Tr key={`${v.version}-${f.name}`} className="bg-zinc-50/80">
													<Td />
													<Td colSpan={3}>
														<div className="flex items-center gap-2 flex-wrap">
															<code className="text-xs font-mono text-zinc-700">
																{f.name}
															</code>
															<Badge variant={FILE_KIND_VARIANT[f.kind] ?? "default"}>
																{f.kind}
															</Badge>
														</div>
														{f.checksums && (
															<div className="mt-2 space-y-0.5 text-[11px] font-mono text-zinc-500">
																<p>
																	<span className="text-zinc-400">SHA-256</span>{" "}
																	<button
																		type="button"
																		className="hover:text-zinc-800 break-all text-left"
																		onClick={() =>
																			copyText(
																				`sha256-${f.name}`,
																				f.checksums!.sha256,
																			)
																		}
																	>
																		{f.checksums.sha256}
																	</button>
																</p>
																<p className="flex flex-wrap gap-x-3 gap-y-0.5">
																	<a
																		href={fileUrl(v.version, `${f.name}.md5`)}
																		className="text-blue-600 hover:underline"
																		target="_blank"
																		rel="noreferrer"
																	>
																		.md5
																	</a>
																	<a
																		href={fileUrl(v.version, `${f.name}.sha1`)}
																		className="text-blue-600 hover:underline"
																		target="_blank"
																		rel="noreferrer"
																	>
																		.sha1
																	</a>
																	<a
																		href={fileUrl(v.version, `${f.name}.sha256`)}
																		className="text-blue-600 hover:underline"
																		target="_blank"
																		rel="noreferrer"
																	>
																		.sha256
																	</a>
																</p>
															</div>
														)}
													</Td>
													<Td className="text-xs text-zinc-500">{formatBytes(f.size)}</Td>
													<Td colSpan={2}>
														<a
															href={fileUrl(v.version, f.name)}
															className="text-xs text-blue-600 hover:underline"
															target="_blank"
															rel="noreferrer"
														>
															Download
														</a>
													</Td>
												</Tr>
											))}
									</Fragment>
								);
							})
						)}
					</Tbody>
				</Table>
			</Card>
		</div>
	);
}
