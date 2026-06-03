"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, Shield, Eye, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, Thead, Th, Tbody, Tr, Td } from "@/components/ui/table";
import { formatRelative } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import type { User, AccessRule } from "@/lib/db";

type GroupRef = { id: number; name: string };
type UserWithRules = Omit<User, "password_hash"> & {
	rules: AccessRule[];
	groups: GroupRef[];
};

const roleIcon = { superadmin: Shield, admin: Shield, push: Upload, viewer: Eye };
const roleBadge = { superadmin: "info", admin: "info", push: "success", viewer: "default" } as const;

interface Props {
	users: UserWithRules[];
}

export function UserList({ users: initial }: Props) {
	const [users, setUsers] = useState(initial);
	const [loading, setLoading] = useState(false);

	async function refresh() {
		const { ok, data } = await apiFetch<UserWithRules[]>("/api/users");
		if (ok && data) setUsers(data);
	}

	async function handleDelete(u: UserWithRules) {
		if (!window.confirm(`Delete user "${u.username}"? This cannot be undone.`)) return;
		setLoading(true);
		await apiFetch(`/api/users/${u.id}`, { method: "DELETE" });
		setLoading(false);
		await refresh();
	}

	return (
		<>
			<p className="text-sm text-zinc-600 mb-4 max-w-3xl">
				<strong>Role</strong> caps actions (pull / push / delete). <strong>Default access</strong> is deny
				unless set to allow all. <strong>Groups</strong> grant repository patterns to members.
			</p>

			<div className="flex justify-end mb-4">
				<Link href="/users/new">
					<Button>
						<Plus size={14} /> Add user
					</Button>
				</Link>
			</div>

			<Card>
				<Table>
					<Thead>
						<tr>
							<Th>Username</Th>
							<Th>Role</Th>
							<Th>Groups</Th>
							<Th>2FA</Th>
							<Th>Last login</Th>
							<Th />
						</tr>
					</Thead>
					<Tbody>
						{users.map((u) => {
							const Icon = roleIcon[u.role] || Eye;
							return (
								<Tr key={u.id}>
									<Td>
										<Link
											href={`/users/${u.id}`}
											className="flex items-center gap-2 font-medium text-zinc-900 hover:text-blue-600"
										>
											<Icon size={14} className="text-zinc-400" />
											{u.username}
										</Link>
									</Td>
									<Td>
										<Badge variant={roleBadge[u.role]}>{u.role}</Badge>
									</Td>
									<Td>
										{u.groups.length > 0 ? (
											<div className="flex flex-wrap gap-1">
												{u.groups.map((g) => (
													<Link key={g.id} href={`/groups/${g.id}`}>
														<Badge variant="default">{g.name}</Badge>
													</Link>
												))}
											</div>
										) : (
											<span className="text-xs text-zinc-400">—</span>
										)}
									</Td>
									<Td>
										{u.totp_enabled ? (
											<Badge variant="success">on</Badge>
										) : (
											<span className="text-xs text-zinc-400">off</span>
										)}
									</Td>
									<Td className="text-zinc-500 text-xs">{formatRelative(u.last_login)}</Td>
									<Td>
										<div className="flex items-center gap-1">
											<Link href={`/users/${u.id}`}>
												<Button variant="ghost" size="sm">
													<Pencil size={13} />
												</Button>
											</Link>
											<Button
												variant="ghost"
												size="sm"
												disabled={loading}
												onClick={() => handleDelete(u)}
												className="text-red-400 hover:text-red-600 hover:bg-red-50"
											>
												<Trash2 size={13} />
											</Button>
										</div>
									</Td>
								</Tr>
							);
						})}
						{users.length === 0 && (
							<Tr>
								<Td className="py-8 text-center text-zinc-400" colSpan={6}>
									No users yet.{" "}
									<Link href="/users/new" className="text-blue-600 hover:underline">
										Create one
									</Link>
									.
								</Td>
							</Tr>
						)}
					</Tbody>
				</Table>
			</Card>
		</>
	);
}
