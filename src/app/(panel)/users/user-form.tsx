"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import type { DefaultAccess, User, UserRole } from "@/lib/db";
import type { AccessRuleSource } from "@/lib/access-control";
import { UserInheritedAccess } from "./user-inherited-access";

type GroupRef = { id: number; name: string };

const ROLE_LABELS: Record<UserRole, string> = {
	superadmin: "Super-admin — global access and configuration",
	admin: "Admin — manage users/groups in assigned spaces; registry access via groups",
	push: "Push — pull + push (when access granted)",
	viewer: "Viewer — pull only (when access granted)",
};

type Props =
	| {
			mode: "create";
			allGroups: GroupRef[];
			assignableRoles: UserRole[];
	  }
	| {
			mode: "edit";
			user: Omit<User, "password_hash"> & { groups: GroupRef[] };
			allGroups: GroupRef[];
			inheritedRules: AccessRuleSource[];
			assignableRoles: UserRole[];
	  };

export function UserForm(props: Props) {
	const router = useRouter();
	const isEdit = props.mode === "edit";
	const user = isEdit ? props.user : null;
	const allGroups = props.allGroups;

	const [groupIds, setGroupIds] = useState<number[]>(isEdit ? user!.groups.map((g) => g.id) : []);
	const [loading, setLoading] = useState(false);
	const [apiError, setApiError] = useState("");

	function toggleGroup(groupId: number) {
		setGroupIds((prev) => (prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]));
	}

	async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setLoading(true);
		setApiError("");
		const fd = new FormData(e.currentTarget);
		const role = fd.get("role") as UserRole;
		const default_access = (fd.get("default_access") as DefaultAccess) || "deny";
		const password = String(fd.get("password") || "");

		if (isEdit) {
			const { ok, error } = await apiFetch(`/api/users/${user!.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					role,
					default_access,
					password: password || undefined,
					groupIds,
				}),
			});
			setLoading(false);
			if (!ok) {
				setApiError(error || "Failed to save");
				return;
			}
			router.push("/users");
			router.refresh();
			return;
		}

		const username = String(fd.get("username") || "").trim();
		if (!username || !password) {
			setLoading(false);
			setApiError("Username and password are required");
			return;
		}
		const { ok, error } = await apiFetch("/api/users", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ username, password, role, default_access, groupIds }),
		});
		setLoading(false);
		if (!ok) {
			setApiError(error || "Failed to create user");
			return;
		}
		router.push("/users");
		router.refresh();
	}

	return (
		<form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
			<Link href="/users" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800">
				<ArrowLeft size={14} />
				Back to users
			</Link>

			<Card>
				<div className="px-6 py-5 space-y-4">
					<h2 className="text-sm font-semibold text-zinc-900">Account</h2>
					{isEdit ? (
						<Input label="Username" name="username" value={user!.username} disabled />
					) : (
						<Input label="Username" name="username" required placeholder="username" />
					)}
					<Input
						label={isEdit ? "New password" : "Password"}
						name="password"
						type="password"
						required={!isEdit}
						placeholder={isEdit ? "Leave blank to keep current" : "••••••••"}
					/>
					<Select label="Role" name="role" defaultValue={isEdit ? user!.role : "viewer"}>
						{props.assignableRoles.map((r) => (
							<option key={r} value={r}>
								{ROLE_LABELS[r]}
							</option>
						))}
					</Select>
					<Select
						label="Default repository access"
						name="default_access"
						defaultValue={isEdit ? user!.default_access || "deny" : "deny"}
					>
						<option value="deny">No access — only groups / rules grant access</option>
						<option value="allow">All repositories — role applies everywhere</option>
					</Select>
					<p className="text-xs text-zinc-500">
						Role caps which actions are allowed (pull, push, delete). With default &quot;no access&quot;,
						repositories must match a group or user rule. Admins always have full access.
					</p>
				</div>
			</Card>

			{isEdit && (
				<UserInheritedAccess defaultAccess={user!.default_access || "deny"} rules={props.inheritedRules} />
			)}

			<Card>
				<div className="px-6 py-5 space-y-3">
					<h2 className="text-sm font-semibold text-zinc-900">Group membership</h2>
					<p className="text-xs text-zinc-500">
						Assign this user to groups. They inherit each group&apos;s repository rules; this does not
						change the groups themselves.
					</p>
					{allGroups.length === 0 ? (
						<p className="text-sm text-zinc-400">
							No groups yet.{" "}
							<Link href="/groups/new" className="text-blue-600 hover:underline">
								Create a group
							</Link>
							.
						</p>
					) : (
						<div className="space-y-2 rounded-lg border border-zinc-100 p-4">
							{allGroups.map((g) => (
								<label key={g.id} className="flex items-center gap-2.5 text-sm cursor-pointer py-1">
									<input
										type="checkbox"
										checked={groupIds.includes(g.id)}
										onChange={() => toggleGroup(g.id)}
										className="rounded border-zinc-300"
									/>
									<span className="text-zinc-800">{g.name}</span>
								</label>
							))}
						</div>
					)}
				</div>
			</Card>

			{apiError && <p className="text-sm text-red-600">{apiError}</p>}

			<div className="flex gap-2">
				<Button type="submit" disabled={loading}>
					{loading ? "Saving…" : isEdit ? "Save changes" : "Create user"}
				</Button>
				<Link
					href="/users"
					className="inline-flex items-center justify-center h-8 px-3 text-sm font-medium rounded-md border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
				>
					Cancel
				</Link>
			</div>
		</form>
	);
}
