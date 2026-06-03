"use client";
import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import {
	Server,
	Copy,
	Shield,
	ShieldCheck,
	ShieldOff,
	Trash2,
	Plus,
	Play,
	AlertTriangle,
	Pencil,
	Users2,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

interface Props {
	healthy: boolean;
	publicUrl: string;
	registryUrl: string;
	autoScanOnPush: boolean;
}

const SSO_TYPES = [
	{ value: "google", label: "Google" },
	{ value: "github", label: "GitHub" },
	{ value: "gitlab", label: "GitLab" },
	{ value: "oidc", label: "Generic OIDC" },
];

interface GroupOption {
	id: number;
	name: string;
}

interface SsoRow {
	id: number;
	name: string;
	type: string;
	client_id: string;
	domain_whitelist?: string | null;
	default_role: string;
	default_group_id?: number | null;
	default_group_name?: string | null;
}

function SsoGroupSelect({ groups, defaultValue }: { groups: GroupOption[]; defaultValue?: string }) {
	return (
		<Select label="Default group" name="default_group_id" defaultValue={defaultValue ?? ""}>
			<option value="">None — role only</option>
			{groups.map((g) => (
				<option key={g.id} value={g.id}>
					{g.name}
				</option>
			))}
		</Select>
	);
}

const CI_SNIPPETS = {
	"GitHub Actions": (url: string) => `- uses: docker/login-action@v3
  with:
    registry: ${url.replace(/^https?:\/\//, "")}
    username: token
    password: \${{ secrets.REGISTRY_TOKEN }}`,
	"GitLab CI": (url: string) => `before_script:
  - docker login ${url.replace(/^https?:\/\//, "")} -u token -p $REGISTRY_TOKEN`,
	"Jenkins (Groovy)": (
		url: string,
	) => `withCredentials([string(credentialsId: 'registry-token', variable: 'TOKEN')]) {
  sh "docker login ${url.replace(/^https?:\/\//, "")} -u token -p $TOKEN"
}`,
	"Drone CI": (url: string) => `- name: push
  image: plugins/docker
  settings:
    registry: ${url.replace(/^https?:\/\//, "")}
    username: token
    password:
      from_secret: registry_token`,
};

export function SettingsPanel({ healthy, publicUrl, registryUrl, autoScanOnPush: initialAutoScan }: Props) {
	const [copied, setCopied] = useState<string | null>(null);
	const [readonly, setReadonly] = useState(false);
	const [autoScanOnPush, setAutoScanOnPush] = useState(initialAutoScan);
	const [autoScanSaving, setAutoScanSaving] = useState(false);
	const [gcLoading, setGcLoading] = useState(false);
	const [gcResult, setGcResult] = useState<{ ok: boolean; output: string } | null>(null);
	const [ssoProviders, setSsoProviders] = useState<SsoRow[]>([]);
	const [groups, setGroups] = useState<GroupOption[]>([]);
	const [ssoOpen, setSsoOpen] = useState(false);
	const [editSso, setEditSso] = useState<SsoRow | null>(null);
	const [activeCI, setActiveCI] = useState("GitHub Actions");

	async function refreshSso() {
		const { data } = await apiFetch<SsoRow[]>("/api/settings/sso");
		if (data) setSsoProviders(data);
	}

	useEffect(() => {
		apiFetch<{ readonly: boolean }>("/api/admin/readonly").then(({ data }) => {
			if (data) setReadonly(data.readonly);
		});
		refreshSso();
		apiFetch<{ id: number; name: string }[]>("/api/groups").then(({ data }) => {
			if (data) setGroups(data.map((g) => ({ id: g.id, name: g.name })));
		});
	}, []);

	function copy(text: string, key: string) {
		navigator.clipboard.writeText(text);
		setCopied(key);
		setTimeout(() => setCopied(null), 2000);
	}

	async function toggleAutoScan() {
		setAutoScanSaving(true);
		const next = !autoScanOnPush;
		const { ok, data } = await apiFetch<{ autoScanOnPush: boolean }>("/api/settings/security", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ autoScanOnPush: next }),
		});
		setAutoScanSaving(false);
		if (ok && data) setAutoScanOnPush(data.autoScanOnPush);
	}

	async function toggleReadonly() {
		const { ok, data } = await apiFetch<{ readonly: boolean }>("/api/admin/readonly", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ readonly: !readonly }),
		});
		if (ok && data) setReadonly(data.readonly);
	}

	async function runGc(dryRun: boolean) {
		setGcLoading(true);
		setGcResult(null);
		const { ok, data } = await apiFetch<{ ok: boolean; output: string }>("/api/admin/gc", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ dryRun }),
		});
		if (ok && data) setGcResult(data);
		setGcLoading(false);
	}

	async function deleteSso(id: number) {
		await apiFetch(`/api/settings/sso/${id}`, { method: "DELETE" });
		await refreshSso();
	}

	async function handleAddSso(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const fd = new FormData(e.currentTarget);
		const payload = Object.fromEntries(fd) as Record<string, string>;
		await apiFetch("/api/settings/sso", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ ...payload, active: 1 }),
		});
		await refreshSso();
		setSsoOpen(false);
	}

	async function handleEditSso(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		if (!editSso) return;
		const fd = new FormData(e.currentTarget);
		const payload = Object.fromEntries(fd) as Record<string, string>;
		await apiFetch(`/api/settings/sso/${editSso.id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});
		await refreshSso();
		setEditSso(null);
	}

	return (
		<div className="space-y-4 max-w-2xl">
			{/* Registry status */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center justify-between">
						<span className="flex items-center gap-2">
							<Server size={14} /> Registry
						</span>
						<Badge variant={healthy ? "success" : "danger"}>{healthy ? "Online" : "Offline"}</Badge>
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					{[
						["Internal URL", registryUrl],
						["Public URL", publicUrl],
					].map(([label, val]) => (
						<div key={label} className="flex items-center justify-between text-sm">
							<span className="text-zinc-500">{label}</span>
							<code className="text-xs bg-zinc-50 border border-zinc-100 px-2 py-0.5 rounded">{val}</code>
						</div>
					))}
					{/* Read-only toggle */}
					<div className="flex items-center justify-between pt-1 border-t border-zinc-100">
						<div>
							<p className="text-sm font-medium text-zinc-700">Read-only mode</p>
							<p className="text-xs text-zinc-400">Blocks all pushes and deletes</p>
						</div>
						<Button variant={readonly ? "danger" : "secondary"} size="sm" onClick={toggleReadonly}>
							{readonly ? (
								<>
									<ShieldOff size={13} /> Disable
								</>
							) : (
								<>
									<ShieldCheck size={13} /> Enable
								</>
							)}
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* Security scanning */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Shield size={14} /> Security scanning
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					<label className="flex items-start gap-3 cursor-pointer">
						<input
							type="checkbox"
							checked={autoScanOnPush}
							disabled={autoScanSaving}
							onChange={toggleAutoScan}
							className="mt-0.5 rounded"
						/>
						<div>
							<p className="text-sm font-medium text-zinc-800">Auto-scan on push</p>
							<p className="text-xs text-zinc-500 mt-0.5">
								After each image push, run Trivy in the background and store results. Does not block the
								push.
							</p>
						</div>
					</label>
				</CardContent>
			</Card>

			{/* Garbage Collection */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Trash2 size={14} /> Garbage Collection
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					<p className="text-xs text-zinc-500">
						Remove unreferenced blobs from storage. Stops the registry briefly during collection.
					</p>
					<div className="flex gap-2">
						<Button variant="secondary" size="sm" onClick={() => runGc(true)} disabled={gcLoading}>
							<Play size={13} className={gcLoading ? "animate-pulse" : ""} /> Dry run
						</Button>
						<Button variant="danger" size="sm" onClick={() => runGc(false)} disabled={gcLoading}>
							<Trash2 size={13} /> Run GC
						</Button>
					</div>
					{gcResult && (
						<div
							className={`rounded-lg p-3 text-xs font-mono whitespace-pre-wrap max-h-40 overflow-y-auto ${gcResult.ok ? "bg-zinc-900 text-zinc-300" : "bg-red-50 text-red-800"}`}
						>
							{gcResult.output || "(no output)"}
						</div>
					)}
				</CardContent>
			</Card>

			{/* CI/CD Snippets */}
			<Card>
				<CardHeader>
					<CardTitle>CI/CD Integration</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					<div className="flex gap-2 flex-wrap">
						{Object.keys(CI_SNIPPETS).map((k) => (
							<button
								key={k}
								onClick={() => setActiveCI(k)}
								className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${activeCI === k ? "bg-blue-600 text-white border-blue-600" : "text-zinc-600 border-zinc-200 hover:border-blue-300"}`}
							>
								{k}
							</button>
						))}
					</div>
					<div className="relative">
						<pre className="text-xs bg-zinc-900 text-zinc-300 rounded-lg p-3 pr-10 overflow-x-auto whitespace-pre-wrap">
							{CI_SNIPPETS[activeCI as keyof typeof CI_SNIPPETS]?.(publicUrl)}
						</pre>
						<button
							onClick={() => copy(CI_SNIPPETS[activeCI as keyof typeof CI_SNIPPETS]?.(publicUrl), "ci")}
							className="absolute top-2 right-2 text-zinc-500 hover:text-zinc-300"
						>
							<Copy size={13} />
						</button>
					</div>
					{copied === "ci" && <p className="text-xs text-green-600">Copied!</p>}
					<div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-2">
						<AlertTriangle size={13} className="text-amber-600 flex-shrink-0 mt-0.5" />
						<p className="text-xs text-amber-700">
							Store your registry token in CI secrets/variables, never in source code. Create tokens in
							the <strong>Access Tokens</strong> page.
						</p>
					</div>
				</CardContent>
			</Card>

			{/* SSO Providers */}
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle>SSO Providers</CardTitle>
						<Button size="sm" onClick={() => setSsoOpen(true)}>
							<Plus size={13} /> Add provider
						</Button>
					</div>
				</CardHeader>
				<CardContent className="space-y-2">
					<p className="text-xs text-zinc-500 mb-2">
						Link a group to apply its repository access rules when users sign in via this provider.
					</p>
					{ssoProviders.length === 0 && <p className="text-sm text-zinc-400">No SSO providers configured</p>}
					{ssoProviders.map((p) => (
						<div
							key={p.id}
							className="flex items-center justify-between gap-2 text-sm p-2 border border-zinc-100 rounded-lg"
						>
							<div className="min-w-0">
								<span className="font-medium text-zinc-800">{p.name}</span>
								<Badge variant="default" className="ml-2">
									{p.type}
								</Badge>
								<div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-zinc-500">
									<span>role: {p.default_role}</span>
									{p.default_group_name ? (
										<span className="inline-flex items-center gap-1 text-violet-700">
											<Users2 size={11} /> group: {p.default_group_name}
										</span>
									) : (
										<span className="text-zinc-400">no group</span>
									)}
									{p.domain_whitelist ? <span>domains: {p.domain_whitelist}</span> : null}
								</div>
							</div>
							<div className="flex items-center gap-1 shrink-0">
								<Button variant="ghost" size="sm" onClick={() => setEditSso(p)}>
									<Pencil size={12} />
								</Button>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => deleteSso(p.id)}
									className="text-red-400 hover:text-red-600"
								>
									<Trash2 size={12} />
								</Button>
							</div>
						</div>
					))}
				</CardContent>
			</Card>

			{/* Add SSO dialog */}
			<Dialog open={ssoOpen} onClose={() => setSsoOpen(false)} title="Add SSO provider">
				<form onSubmit={handleAddSso} className="space-y-3">
					<Input label="Display name" name="name" required placeholder="Google Workspace" />
					<Select label="Type" name="type">
						<option value="">Select…</option>
						{SSO_TYPES.map((t) => (
							<option key={t.value} value={t.value}>
								{t.label}
							</option>
						))}
					</Select>
					<Input label="Client ID" name="client_id" required />
					<Input label="Client Secret" name="client_secret" type="password" required />
					<Input label="Issuer URL (OIDC only)" name="issuer_url" placeholder="https://accounts.google.com" />
					<Input
						label="Domain whitelist"
						name="domain_whitelist"
						placeholder="acme.com,acme.org (empty = allow all)"
					/>
					<Select label="Default role for new users" name="default_role" defaultValue="viewer">
						<option value="viewer">Viewer</option>
						<option value="push">Push</option>
						<option value="superadmin">Super-admin</option>
						<option value="admin">Admin (space)</option>
					</Select>
					<SsoGroupSelect groups={groups} />
					<p className="text-xs text-zinc-500">
						Group rules grant repository access (default for new users is no access). Create groups and
						rules under Access → Groups.
					</p>
					<div className="flex gap-2 justify-end pt-1">
						<Button variant="secondary" size="sm" type="button" onClick={() => setSsoOpen(false)}>
							Cancel
						</Button>
						<Button size="sm" type="submit">
							Add provider
						</Button>
					</div>
				</form>
			</Dialog>

			<Dialog open={!!editSso} onClose={() => setEditSso(null)} title="Edit SSO provider">
				{editSso && (
					<form onSubmit={handleEditSso} className="space-y-3">
						<Input label="Display name" name="name" required defaultValue={editSso.name} />
						<Input
							label="Domain whitelist"
							name="domain_whitelist"
							defaultValue={editSso.domain_whitelist || ""}
							placeholder="acme.com (empty = allow all)"
						/>
						<Select
							label="Default role for new users"
							name="default_role"
							defaultValue={editSso.default_role}
						>
							<option value="viewer">Viewer</option>
							<option value="push">Push</option>
							<option value="superadmin">Super-admin</option>
							<option value="admin">Admin (space)</option>
						</Select>
						<SsoGroupSelect
							groups={groups}
							defaultValue={editSso.default_group_id ? String(editSso.default_group_id) : ""}
						/>
						<div className="flex gap-2 justify-end pt-1">
							<Button variant="secondary" size="sm" type="button" onClick={() => setEditSso(null)}>
								Cancel
							</Button>
							<Button size="sm" type="submit">
								Save
							</Button>
						</div>
					</form>
				)}
			</Dialog>
		</div>
	);
}
