"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2, Pencil, Plus, Webhook, Activity, ArrowUp, ArrowDown, HardDrive, Layers, Calendar } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, Thead, Th, Tbody, Tr, Td } from "@/components/ui/table";
import { Header } from "@/components/layout/header";
import { ActivityTypeChart } from "@/components/dashboard/activity-type-chart";
import { DeleteTagButton } from "./delete-tag-button";
import { TagRetagButton } from "./tag-retag-button";
import type { ScanInfo } from "./scan-status-badge";
import { ScanSecurityCell } from "@/components/security/scan-security-cell";
import { apiFetch } from "@/lib/api";
import { formatBytes, formatRelative, shortDigest, formatDate } from "@/lib/utils";
import { ListToolbar } from "@/components/list/list-toolbar";
import { compareDates, compareNumbers, compareStrings, useSortedFilteredList } from "@/hooks/use-sorted-filtered-list";
import type { WebhookTarget } from "@/lib/db";
import type { TagDetail } from "@/lib/registry";

const TAG_SORT_OPTIONS = [
	{ id: "tag", label: "Tag" },
	{ id: "size", label: "Size" },
	{ id: "created", label: "Created" },
] as const;

const TAG_COMPARATORS = {
	tag: (a: TagDetail, b: TagDetail) => compareStrings(a.tag, b.tag),
	size: (a: TagDetail, b: TagDetail) => compareNumbers(a.size, b.size),
	created: (a: TagDetail, b: TagDetail) => compareDates(a.created, b.created),
};

function tagSearchText(t: TagDetail) {
	return `${t.tag} ${t.digest || ""} ${t.os || ""} ${t.architecture || ""}`;
}

interface EventRow {
	id: number;
	action: string;
	repository: string;
	tag: string | null;
	actor: string | null;
	timestamp: string;
}

interface Props {
	repoName: string;
	subtitle: string;
	tagCount: number;
	totalSize: number;
	lastPush: string | null;
	details: TagDetail[];
	isAdmin: boolean;
	scansByTag: Record<string, ScanInfo>;
	webhooks: WebhookTarget[];
	eventStats: { total: number; pushes: number; pulls: number; deletes: number };
	activityByAction: { day: string; action: string; count: number }[];
	recentEvents: EventRow[];
}

const actionBadge = (action: string) => {
	if (action === "push") return <Badge variant="success">push</Badge>;
	if (action === "pull") return <Badge variant="info">pull</Badge>;
	if (action === "delete") return <Badge variant="danger">delete</Badge>;
	return <Badge>{action}</Badge>;
};

export function RepositoryDetailView({
	repoName,
	subtitle,
	tagCount,
	totalSize,
	lastPush,
	details,
	isAdmin,
	scansByTag,
	webhooks: initialWebhooks,
	eventStats,
	activityByAction,
	recentEvents,
}: Props) {
	const router = useRouter();
	const [webhooks, setWebhooks] = useState(initialWebhooks);
	const [renameOpen, setRenameOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [webhookOpen, setWebhookOpen] = useState(false);
	const [newName, setNewName] = useState(repoName);
	const [deleteConfirm, setDeleteConfirm] = useState("");
	const [renameLoading, setRenameLoading] = useState(false);
	const [deleteLoading, setDeleteLoading] = useState(false);
	const [webhookLoading, setWebhookLoading] = useState(false);
	const [scanning, setScanning] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [webhookError, setWebhookError] = useState("");

	const tagList = useSortedFilteredList(details, tagSearchText, "tag", TAG_COMPARATORS);

	const headerActions = isAdmin ? (
		<div className="flex items-center gap-2">
			<Button variant="secondary" size="sm" onClick={() => setRenameOpen(true)}>
				<Pencil size={14} /> Rename
			</Button>
			<Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
				<Trash2 size={14} /> Remove image
			</Button>
		</div>
	) : undefined;

	async function handleRename() {
		const name = newName.trim();
		if (!name || name === repoName) return;
		setRenameLoading(true);
		setMessage(null);
		const { ok, error } = await apiFetch<{ newName: string }>(
			`/api/registry/repositories/${encodeURIComponent(repoName)}/rename`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ newName: name }),
			},
		);
		setRenameLoading(false);
		if (!ok) {
			setMessage(error || "Rename failed");
			return;
		}
		setRenameOpen(false);
		router.push(`/repositories/${encodeURIComponent(name)}`);
		router.refresh();
	}

	async function handleDeleteRepo() {
		if (deleteConfirm !== repoName) return;
		setDeleteLoading(true);
		const { ok, error, data } = await apiFetch<{ failed?: number }>(
			`/api/registry/repositories/${encodeURIComponent(repoName)}`,
			{ method: "DELETE" },
		);
		setDeleteLoading(false);
		if (!ok || (data?.failed ?? 0) > 0) {
			setMessage(error || "Delete failed");
			return;
		}
		router.push("/repositories");
	}

	async function handleScan(tag: string) {
		setScanning(tag);
		setMessage(null);
		const { ok, error } = await apiFetch(
			`/api/admin/scan/${encodeURIComponent(repoName)}/${encodeURIComponent(tag)}`,
			{ method: "POST" },
		);
		setScanning(null);
		if (!ok) setMessage(error || "Scan failed");
		else router.refresh();
	}

	async function handleAddWebhook(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setWebhookLoading(true);
		setWebhookError("");
		const fd = new FormData(e.currentTarget);
		const events = ["push", "pull", "delete"].filter((ev) => fd.get(ev) === "on").join(",");
		const { ok, error } = await apiFetch("/api/webhooks", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: fd.get("name"),
				repository_pattern: fd.get("repository_pattern") || repoName,
				url: fd.get("url"),
				secret: fd.get("secret") || null,
				events: events || "push",
				active: 1,
			}),
		});
		setWebhookLoading(false);
		if (!ok) {
			setWebhookError(error || "Failed");
			return;
		}
		setWebhookOpen(false);
		router.refresh();
	}

	const colSpan = isAdmin ? 8 : 7;

	return (
		<div>
			<Header title={repoName} subtitle={subtitle} actions={headerActions} />

			{message && (
				<p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
					{message}
				</p>
			)}

			<div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
				<Card>
					<CardContent className="flex items-center gap-3 py-4">
						<HardDrive size={16} className="text-zinc-400" />
						<div>
							<p className="text-lg font-semibold text-zinc-900">{formatBytes(totalSize)}</p>
							<p className="text-xs text-zinc-500">Total size</p>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="flex items-center gap-3 py-4">
						<Layers size={16} className="text-zinc-400" />
						<div>
							<p className="text-lg font-semibold text-zinc-900">{tagCount}</p>
							<p className="text-xs text-zinc-500">Tags</p>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="flex items-center gap-3 py-4">
						<Calendar size={16} className="text-zinc-400" />
						<div>
							<p className="text-sm font-semibold text-zinc-900">{formatRelative(lastPush)}</p>
							<p className="text-xs text-zinc-500">Last push</p>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Activity overview */}
			<div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
				<Card>
					<CardContent className="py-4">
						<p className="text-xl font-semibold tabular-nums">{eventStats.total}</p>
						<p className="text-xs text-zinc-500 mt-0.5">Total events</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="py-4 flex items-center gap-2">
						<ArrowUp size={14} className="text-green-600" />
						<div>
							<p className="text-xl font-semibold tabular-nums">{eventStats.pushes}</p>
							<p className="text-xs text-zinc-500">Pushes</p>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="py-4 flex items-center gap-2">
						<ArrowDown size={14} className="text-amber-600" />
						<div>
							<p className="text-xl font-semibold tabular-nums">{eventStats.pulls}</p>
							<p className="text-xs text-zinc-500">Pulls</p>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="py-4">
						<p className="text-xl font-semibold tabular-nums">{eventStats.deletes}</p>
						<p className="text-xs text-zinc-500 mt-0.5">Deletes</p>
					</CardContent>
				</Card>
			</div>

			<Card className="mb-6">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Activity size={14} className="text-zinc-400" />
						Activity — last 30 days
					</CardTitle>
				</CardHeader>
				<CardContent>
					<ActivityTypeChart data={activityByAction} />
				</CardContent>
			</Card>

			{/* Tags */}
			<Card className="mb-6">
				<CardHeader>
					<CardTitle>Tags</CardTitle>
				</CardHeader>
				{details.length > 0 && (
					<div className="px-5 pb-4">
						<ListToolbar
							search={tagList.search}
							onSearchChange={tagList.setSearch}
							searchPlaceholder="Filter tags…"
							sortId={tagList.sortId}
							onSortChange={tagList.setSortId}
							sortOptions={[...TAG_SORT_OPTIONS]}
							direction={tagList.direction}
							onToggleDirection={tagList.toggleDirection}
							visibleCount={tagList.visibleCount}
							totalCount={tagList.totalCount}
						/>
					</div>
				)}
				<Table>
					<Thead>
						<tr>
							<Th>Tag</Th>
							<Th>Security</Th>
							<Th>Digest</Th>
							<Th>Size</Th>
							<Th>Platform</Th>
							<Th>Created</Th>
							<Th>Pull command</Th>
							{isAdmin && <Th />}
						</tr>
					</Thead>
					<Tbody>
						{tagList.items.map((tag) => {
							const scan = scansByTag[tag.tag];
							return (
								<Tr key={tag.tag}>
									<Td>
										<span className="font-mono text-sm font-medium text-zinc-900">{tag.tag}</span>
									</Td>
									<Td>
										<ScanSecurityCell
											repository={repoName}
											tag={tag.tag}
											scan={scan}
											isAdmin={isAdmin}
											onScan={() => handleScan(tag.tag)}
											scanning={scanning === tag.tag}
										/>
									</Td>
									<Td>
										<span className="font-mono text-xs text-zinc-500">
											{tag.digest ? shortDigest(tag.digest) : "—"}
										</span>
									</Td>
									<Td>{formatBytes(tag.size)}</Td>
									<Td>
										{tag.os && tag.architecture ? (
											<Badge variant="default">
												{tag.os}/{tag.architecture}
											</Badge>
										) : (
											<span className="text-zinc-400">—</span>
										)}
									</Td>
									<Td className="text-zinc-500 text-xs">{formatDate(tag.created)}</Td>
									<Td>
										<code className="text-xs bg-zinc-50 border border-zinc-100 rounded px-2 py-0.5 text-zinc-600">
											docker pull {repoName}:{tag.tag}
										</code>
									</Td>
									{isAdmin && (
										<Td>
											<div className="flex items-center gap-0.5 justify-end">
												<TagRetagButton repo={repoName} sourceTag={tag.tag} />
												{tag.digest && <DeleteTagButton repo={repoName} tag={tag.tag} />}
											</div>
										</Td>
									)}
								</Tr>
							);
						})}
						{details.length === 0 && (
							<Tr>
								<Td className="py-8 text-center text-zinc-400" colSpan={colSpan}>
									No tags found
								</Td>
							</Tr>
						)}
						{details.length > 0 && tagList.items.length === 0 && (
							<Tr>
								<Td className="py-8 text-center text-zinc-400" colSpan={colSpan}>
									No tags match your search
								</Td>
							</Tr>
						)}
					</Tbody>
				</Table>
			</Card>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
				{/* Webhooks */}
				<Card>
					<CardHeader>
						<div className="flex items-center justify-between gap-2">
							<CardTitle className="flex items-center gap-2">
								<Webhook size={14} className="text-zinc-400" />
								Webhooks
							</CardTitle>
							{isAdmin && (
								<Button size="sm" onClick={() => setWebhookOpen(true)}>
									<Plus size={13} /> Add webhook
								</Button>
							)}
						</div>
					</CardHeader>
					<CardContent>
						<p className="text-xs text-zinc-500 mb-3">
							Outgoing hooks scoped to <span className="font-mono">{repoName}</span> (exact name or
							wildcard match).
						</p>
						{webhooks.length > 0 ? (
							<ul className="space-y-2">
								{webhooks.map((w) => (
									<li key={w.id} className="border border-zinc-100 rounded-lg px-3 py-2.5 text-sm">
										<div className="flex items-start justify-between gap-2">
											<div className="min-w-0">
												<p className="font-medium text-zinc-900">{w.name}</p>
												<p className="text-xs text-zinc-400 truncate mt-0.5">{w.url}</p>
											</div>
											<Badge variant={w.active ? "success" : "default"}>
												{w.active ? "active" : "off"}
											</Badge>
										</div>
										<div className="flex flex-wrap gap-2 mt-2 text-xs text-zinc-500">
											<span className="font-mono bg-zinc-50 px-1.5 py-0.5 rounded">
												{w.repository_pattern}
											</span>
											<span>{w.events}</span>
											{w.last_triggered && <span>last: {formatRelative(w.last_triggered)}</span>}
										</div>
									</li>
								))}
							</ul>
						) : (
							<p className="text-sm text-zinc-400">No webhooks for this image.</p>
						)}
						<Link href="/webhooks" className="inline-block text-xs text-blue-600 hover:underline mt-3">
							All webhooks →
						</Link>
					</CardContent>
				</Card>

				{/* Recent activity */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Activity size={14} className="text-zinc-400" />
							Recent activity
						</CardTitle>
						<Link
							href="/activity"
							className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline shrink-0"
						>
							View all
						</Link>
					</CardHeader>
					<div className="divide-y divide-zinc-50 max-h-80 overflow-y-auto">
						{recentEvents.length === 0 && (
							<p className="px-5 py-8 text-sm text-center text-zinc-400">No events yet</p>
						)}
						{recentEvents.map((e) => (
							<div key={e.id} className="px-5 py-3 flex items-start justify-between gap-2">
								<div className="min-w-0">
									<p className="text-sm font-medium text-zinc-800">
										{e.tag ? (
											<span className="font-mono">:{e.tag}</span>
										) : (
											<span className="text-zinc-400">manifest</span>
										)}
									</p>
									<p className="text-xs text-zinc-400 mt-0.5">
										{e.actor || "unknown"} · {formatRelative(e.timestamp)}
									</p>
								</div>
								{actionBadge(e.action)}
							</div>
						))}
					</div>
				</Card>
			</div>

			{/* Rename modal */}
			<Dialog open={renameOpen} onClose={() => setRenameOpen(false)} title="Rename image">
				<p className="text-sm text-zinc-600 mb-3">
					Moves all tags from <span className="font-mono font-medium">{repoName}</span> to a new path.
				</p>
				<Input
					label="New image name"
					value={newName}
					onChange={(e) => setNewName(e.target.value)}
					placeholder="org/new-name"
				/>
				<div className="flex gap-2 justify-end mt-4">
					<Button variant="secondary" size="sm" onClick={() => setRenameOpen(false)}>
						Cancel
					</Button>
					<Button
						size="sm"
						onClick={handleRename}
						disabled={renameLoading || !newName.trim() || newName.trim() === repoName}
					>
						{renameLoading ? "Renaming…" : "Rename"}
					</Button>
				</div>
			</Dialog>

			{/* Delete modal */}
			<Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Remove image">
				<p className="text-sm text-zinc-600 mb-2">
					Permanently delete <span className="font-mono font-medium">{repoName}</span> and all{" "}
					<strong>{details.length} tags</strong>. This cannot be undone.
				</p>
				<p className="text-xs text-zinc-500 mb-3">Type the image name to confirm:</p>
				<input
					value={deleteConfirm}
					onChange={(e) => setDeleteConfirm(e.target.value)}
					className="w-full px-3 py-2 text-sm font-mono border border-zinc-200 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-red-500/20"
					placeholder={repoName}
				/>
				<div className="flex gap-2 justify-end">
					<Button variant="secondary" size="sm" onClick={() => setDeleteOpen(false)}>
						Cancel
					</Button>
					<Button
						variant="danger"
						size="sm"
						onClick={handleDeleteRepo}
						disabled={deleteLoading || deleteConfirm !== repoName}
					>
						{deleteLoading ? "Deleting…" : "Delete image"}
					</Button>
				</div>
			</Dialog>

			{/* Add webhook modal */}
			<Dialog open={webhookOpen} onClose={() => setWebhookOpen(false)} title="Add webhook">
				<form onSubmit={handleAddWebhook} className="space-y-3">
					<Input label="Name" name="name" required defaultValue={`${repoName} notifications`} />
					<Input label="URL" name="url" type="url" required placeholder="https://hooks.example.com/..." />
					<Input
						label="Image scope"
						name="repository_pattern"
						defaultValue={repoName}
						placeholder={repoName}
					/>
					<p className="text-xs text-zinc-500">
						Pre-filled to this image. Use <span className="font-mono">{repoName}/*</span> for namespace
						scope.
					</p>
					<Input label="Secret" name="secret" placeholder="Optional X-Webhook-Secret" />
					<div>
						<p className="text-sm font-medium text-zinc-700 mb-2">Trigger on</p>
						<div className="flex gap-4">
							{["push", "pull", "delete"].map((ev) => (
								<label
									key={ev}
									className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer"
								>
									<input
										type="checkbox"
										name={ev}
										defaultChecked={ev === "push"}
										className="rounded"
									/>
									{ev}
								</label>
							))}
						</div>
					</div>
					{webhookError && <p className="text-xs text-red-600">{webhookError}</p>}
					<div className="flex gap-2 justify-end pt-1">
						<Button variant="secondary" size="sm" type="button" onClick={() => setWebhookOpen(false)}>
							Cancel
						</Button>
						<Button size="sm" type="submit" disabled={webhookLoading}>
							{webhookLoading ? "Creating…" : "Create webhook"}
						</Button>
					</div>
				</form>
			</Dialog>
		</div>
	);
}
