import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { requireSession } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, Thead, Th, Tbody, Tr, Td } from "@/components/ui/table";
import { ScanStatusBadge } from "@/app/(panel)/repositories/[name]/scan-status-badge";
import { db } from "@/lib/db";
import { activityTimestamp } from "@/lib/activity-feed";
import { getFeatures } from "@/lib/features";
import { formatDate, formatBytes, shortDigest } from "@/lib/utils";

export const dynamic = "force-dynamic";

const actionBadge = (action: string) => {
	if (action === "push") return <Badge variant="success">push</Badge>;
	if (action === "pull") return <Badge variant="info">pull</Badge>;
	if (action === "delete") return <Badge variant="danger">delete</Badge>;
	if (action === "scan") return <Badge variant="purple">scan</Badge>;
	if (action === "webhook") return <Badge variant="warning">webhook</Badge>;
	return <Badge>{action}</Badge>;
};

const webhookStatusBadge = (status: number) => {
	if (status >= 200 && status < 300) return <Badge variant="success">{status}</Badge>;
	if (status === 0) return <Badge variant="danger">Failed</Badge>;
	return <Badge variant="warning">{status}</Badge>;
};

export default async function ActivityPage() {
	try {
		await requireSession();
	} catch {
		redirect("/login");
	}

	const features = getFeatures();
	const items = features.docker
		? db.activity.findRecent(200)
		: db.events.findRecent(200).map((e) => ({ kind: "registry" as const, ...e }));
	const stats = features.docker ? db.activity.stats() : { ...db.events.stats(), scans: 0, webhooks: 0 };

	const summaryCards = [
		{ label: "Pushes", value: stats.pushes, variant: "success" as const },
		{ label: "Pulls", value: stats.pulls, variant: "info" as const },
		{ label: "Deletes", value: stats.deletes, variant: "danger" as const },
		...(features.docker
			? [
					{ label: "Scans", value: stats.scans, variant: "purple" as const },
					{ label: "Webhooks", value: stats.webhooks, variant: "warning" as const },
				]
			: []),
	];

	return (
		<div>
			<Header title="Activity Log" subtitle="Registry events, security scans, and outbound webhook deliveries" />

			<div
				className={`grid gap-4 mb-6 ${
					summaryCards.length >= 5
						? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
						: summaryCards.length === 4
							? "grid-cols-2 sm:grid-cols-4"
							: "grid-cols-3"
				}`}
			>
				{summaryCards.map(({ label, value, variant }) => (
					<Card key={label}>
						<div className="px-5 py-4 flex items-center justify-between">
							<span className="text-sm text-zinc-500">{label}</span>
							<Badge variant={variant}>{value}</Badge>
						</div>
					</Card>
				))}
			</div>

			<Card>
				<Table>
					<Thead>
						<tr>
							<Th>Action</Th>
							<Th>Repository</Th>
							<Th>Tag</Th>
							<Th>Digest</Th>
							{features.docker && <Th>Security</Th>}
							<Th>Actor</Th>
							<Th>Info</Th>
							<Th>Size</Th>
							<Th>Timestamp</Th>
						</tr>
					</Thead>
					<Tbody>
						{items.map((item) => {
							if (item.kind === "webhook") {
								return (
									<Tr key={`webhook-${item.id}`}>
										<Td>
											<span className="inline-flex items-center gap-1">
												{actionBadge("webhook")}
												<span className="text-[10px] text-zinc-400 font-mono">
													{item.registry_action}
												</span>
											</span>
										</Td>
										<Td className="font-medium text-zinc-900">{item.repository}</Td>
										<Td className="font-mono text-xs">{item.tag || "—"}</Td>
										<Td className="font-mono text-xs text-zinc-400">
											{item.digest ? shortDigest(item.digest) : "—"}
										</Td>
										{features.docker && <Td className="text-zinc-400">—</Td>}
										<Td className="text-zinc-500">{item.webhook_name}</Td>
										<Td>{webhookStatusBadge(item.status)}</Td>
										<Td className="text-zinc-400">—</Td>
										<Td className="text-xs text-zinc-400">{formatDate(item.delivered_at)}</Td>
									</Tr>
								);
							}

							if (item.kind === "scan") {
								return (
									<Tr key={`scan-${item.id}`}>
										<Td>{actionBadge("scan")}</Td>
										<Td className="font-medium text-zinc-900">{item.repository}</Td>
										<Td className="font-mono text-xs">{item.tag}</Td>
										<Td className="font-mono text-xs text-zinc-400">
											{item.digest ? shortDigest(item.digest) : "—"}
										</Td>
										{features.docker && (
											<Td>
												<ScanStatusBadge scan={item} />
											</Td>
										)}
										<Td className="text-zinc-400">—</Td>
										<Td className="text-zinc-400 text-xs">—</Td>
										<Td className="text-zinc-400">—</Td>
										<Td className="text-xs text-zinc-400">{formatDate(item.scanned_at)}</Td>
									</Tr>
								);
							}

							return (
								<Tr key={item.id}>
									<Td>{actionBadge(item.action)}</Td>
									<Td className="font-medium text-zinc-900">{item.repository}</Td>
									<Td className="font-mono text-xs">{item.tag || "—"}</Td>
									<Td className="font-mono text-xs text-zinc-400">{shortDigest(item.digest)}</Td>
									{features.docker && <Td className="text-zinc-400">—</Td>}
									<Td className="text-zinc-500">{item.actor || "—"}</Td>
									<Td className="text-zinc-400 text-xs font-mono">{item.ip || "—"}</Td>
									<Td className="text-zinc-500">{item.size ? formatBytes(item.size) : "—"}</Td>
									<Td className="text-xs text-zinc-400">{formatDate(activityTimestamp(item))}</Td>
								</Tr>
							);
						})}
						{items.length === 0 && (
							<Tr>
								<Td className="py-10 text-center text-zinc-400" colSpan={features.docker ? 9 : 8}>
									No activity yet. Registry events, Trivy scans, and webhook deliveries appear here as
									they occur.
								</Td>
							</Tr>
						)}
					</Tbody>
				</Table>
			</Card>
		</div>
	);
}
