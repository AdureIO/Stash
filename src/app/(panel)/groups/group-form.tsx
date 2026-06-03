"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import type { Group, GroupRule, User } from "@/lib/db";

type RuleDraft = { repository: string; actions: string };
type MemberUser = Pick<User, "id" | "username" | "role">;

type Props =
	| {
			mode: "create";
			allUsers: Omit<User, "password_hash">[];
	  }
	| {
			mode: "edit";
			group: Group;
			members: MemberUser[];
			rules: GroupRule[];
			allUsers: Omit<User, "password_hash">[];
	  };

const emptyRule = (): RuleDraft => ({ repository: "", actions: "pull" });

export function GroupForm(props: Props) {
	const router = useRouter();
	const isEdit = props.mode === "edit";
	const group = isEdit ? props.group : null;
	const allUsers = props.allUsers;

	const [rules, setRules] = useState<RuleDraft[]>(
		isEdit ? props.rules.map((r) => ({ repository: r.repository, actions: r.actions })) : [emptyRule()],
	);
	const [memberIds, setMemberIds] = useState<number[]>(isEdit ? props.members.map((m) => m.id) : []);
	const [loading, setLoading] = useState(false);
	const [apiError, setApiError] = useState("");

	function toggleMember(userId: number) {
		setMemberIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
	}

	function updateRule(index: number, field: keyof RuleDraft, value: string) {
		setRules((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
	}

	function addRuleRow() {
		setRules((prev) => [...prev, emptyRule()]);
	}

	function removeRuleRow(index: number) {
		setRules((prev) => (prev.length <= 1 ? [emptyRule()] : prev.filter((_, i) => i !== index)));
	}

	async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setLoading(true);
		setApiError("");
		const fd = new FormData(e.currentTarget);
		const name = String(fd.get("name") || "").trim();
		const description = String(fd.get("description") || "").trim() || undefined;
		const payloadRules = rules
			.map((r) => ({ repository: r.repository.trim(), actions: r.actions }))
			.filter((r) => r.repository);

		if (!name) {
			setLoading(false);
			setApiError("Name is required");
			return;
		}

		if (isEdit) {
			const { ok, error } = await apiFetch(`/api/groups/${group!.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name, description, memberIds, rules: payloadRules }),
			});
			setLoading(false);
			if (!ok) {
				setApiError(error || "Failed to save");
				return;
			}
			router.push("/groups");
			router.refresh();
			return;
		}

		const { ok, error } = await apiFetch("/api/groups", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name, description, memberIds, rules: payloadRules }),
		});
		setLoading(false);
		if (!ok) {
			setApiError(error || "Failed to create group");
			return;
		}
		router.push("/groups");
		router.refresh();
	}

	async function handleDelete() {
		if (!isEdit || !group) return;
		if (!window.confirm(`Delete group "${group.name}"? This cannot be undone.`)) return;
		setLoading(true);
		const { ok } = await apiFetch(`/api/groups/${group.id}`, { method: "DELETE" });
		setLoading(false);
		if (ok) {
			router.push("/groups");
			router.refresh();
		}
	}

	return (
		<form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
			<Link href="/groups" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800">
				<ArrowLeft size={14} />
				Back to groups
			</Link>

			<Card>
				<div className="px-6 py-5 space-y-4">
					<h2 className="text-sm font-semibold text-zinc-900">Group details</h2>
					<Input
						label="Name"
						name="name"
						required
						defaultValue={isEdit ? group!.name : ""}
						placeholder="backend-team"
					/>
					<Input
						label="Description"
						name="description"
						defaultValue={isEdit ? (group!.description ?? "") : ""}
						placeholder="Optional description"
					/>
					<p className="text-xs text-zinc-500">
						A group defines repository access for all assigned members. Rules and membership are managed
						independently below.
					</p>
				</div>
			</Card>

			<Card>
				<div className="px-6 py-5 space-y-4">
					<div>
						<h2 className="text-sm font-semibold text-zinc-900">Repository access</h2>
						<p className="text-xs text-zinc-500 mt-1">
							Patterns for Docker (<code className="text-zinc-600">org/app/*</code>), Maven (
							<code className="text-zinc-600">com/example/*</code> or{" "}
							<code className="text-zinc-600">maven:com.example:*</code>), and NPM (
							<code className="text-zinc-600">@scope/*</code>). Members with default &quot;no access&quot;
							only reach matching repositories.
						</p>
					</div>
					<div className="space-y-3">
						{rules.map((rule, index) => (
							<div key={index} className="flex flex-wrap gap-2 items-end">
								<div className="flex-1 min-w-[180px]">
									{index === 0 && (
										<label className="block text-xs font-medium text-zinc-600 mb-1.5">
											Repository pattern
										</label>
									)}
									<input
										value={rule.repository}
										onChange={(e) => updateRule(index, "repository", e.target.value)}
										placeholder="org/team/* · maven:com.example:* · @scope/*"
										className="w-full text-sm px-3 py-2 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
									/>
								</div>
								<div className="w-44">
									{index === 0 && (
										<label className="block text-xs font-medium text-zinc-600 mb-1.5">
											Actions
										</label>
									)}
									<select
										value={rule.actions}
										onChange={(e) => updateRule(index, "actions", e.target.value)}
										className="w-full text-sm px-3 py-2 border border-zinc-200 rounded-lg focus:outline-none"
									>
										<option value="pull">pull</option>
										<option value="pull,push">pull, push</option>
										<option value="pull,push,delete">pull, push, delete</option>
									</select>
								</div>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => removeRuleRow(index)}
									className="text-red-400 hover:text-red-600 mb-0.5"
									aria-label="Remove rule"
								>
									<Trash2 size={14} />
								</Button>
							</div>
						))}
					</div>
					<Button type="button" variant="secondary" size="sm" onClick={addRuleRow}>
						<Plus size={14} /> Add repository rule
					</Button>
				</div>
			</Card>

			<Card>
				<div className="px-6 py-5 space-y-3">
					<div>
						<h2 className="text-sm font-semibold text-zinc-900">Members</h2>
						<p className="text-xs text-zinc-500 mt-1">
							Users assigned to this group. Membership only controls who receives the repository access
							above.
						</p>
					</div>
					{allUsers.length === 0 ? (
						<p className="text-sm text-zinc-400">
							No users yet.{" "}
							<Link href="/users/new" className="text-blue-600 hover:underline">
								Create a user
							</Link>
							.
						</p>
					) : (
						<div className="space-y-2 rounded-lg border border-zinc-100 p-4 max-h-64 overflow-y-auto">
							{allUsers.map((u) => (
								<label
									key={u.id}
									className="flex items-center justify-between gap-2 text-sm cursor-pointer py-1"
								>
									<span className="flex items-center gap-2.5">
										<input
											type="checkbox"
											checked={memberIds.includes(u.id)}
											onChange={() => toggleMember(u.id)}
											className="rounded border-zinc-300"
										/>
										<span className="text-zinc-800">{u.username}</span>
									</span>
									<span className="text-xs text-zinc-400 capitalize">{u.role}</span>
								</label>
							))}
						</div>
					)}
				</div>
			</Card>

			{apiError && <p className="text-sm text-red-600">{apiError}</p>}

			<div className="flex flex-wrap gap-2 items-center">
				<Button type="submit" disabled={loading}>
					{loading ? "Saving…" : isEdit ? "Save changes" : "Create group"}
				</Button>
				<Link
					href="/groups"
					className="inline-flex items-center justify-center h-8 px-3 text-sm font-medium rounded-md border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
				>
					Cancel
				</Link>
				{isEdit && (
					<Button
						type="button"
						variant="danger"
						className="ml-auto"
						disabled={loading}
						onClick={handleDelete}
					>
						Delete group
					</Button>
				)}
			</div>
		</form>
	);
}
