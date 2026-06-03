"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, Thead, Th, Tbody, Tr, Td } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import type { Group, GroupRule, User } from "@/lib/db";

type GroupWithDetails = Group & {
	members: Pick<User, "id" | "username" | "role">[];
	rules: GroupRule[];
};

interface Props {
	groups: GroupWithDetails[];
}

export function GroupList({ groups: initial }: Props) {
	const [groups, setGroups] = useState(initial);
	const [loading, setLoading] = useState(false);

	async function refresh() {
		const { ok, data } = await apiFetch<GroupWithDetails[]>("/api/groups");
		if (ok && data) setGroups(data);
	}

	async function handleDelete(g: GroupWithDetails) {
		if (!window.confirm(`Delete group "${g.name}"? This cannot be undone.`)) return;
		setLoading(true);
		await apiFetch(`/api/groups/${g.id}`, { method: "DELETE" });
		setLoading(false);
		await refresh();
	}

	return (
		<>
			<p className="text-sm text-zinc-600 mb-4 max-w-3xl">
				A <strong>group</strong> defines which repositories its members may access.{" "}
				<strong>Repository rules</strong> belong to the group; assign users separately on each group page.
			</p>

			<div className="flex justify-end mb-4">
				<Link href="/groups/new">
					<Button>
						<Plus size={14} /> New group
					</Button>
				</Link>
			</div>

			<Card>
				<Table>
					<Thead>
						<tr>
							<Th>Name</Th>
							<Th>Repository rules</Th>
							<Th>Members</Th>
							<Th />
						</tr>
					</Thead>
					<Tbody>
						{groups.map((g) => (
							<Tr key={g.id}>
								<Td>
									<Link href={`/groups/${g.id}`} className="block min-w-0">
										<p className="font-medium text-zinc-900 text-sm hover:text-blue-600">
											{g.name}
										</p>
										{g.description && (
											<p className="text-xs text-zinc-400 truncate">{g.description}</p>
										)}
									</Link>
								</Td>
								<Td>
									<Badge variant="info">{g.rules.length}</Badge>
								</Td>
								<Td>
									<Badge variant="default">{g.members.length}</Badge>
								</Td>
								<Td>
									<div className="flex items-center gap-1 justify-end">
										<Link href={`/groups/${g.id}`}>
											<Button variant="ghost" size="sm">
												<Pencil size={13} />
											</Button>
										</Link>
										<Button
											variant="ghost"
											size="sm"
											disabled={loading}
											onClick={() => handleDelete(g)}
											className="text-red-400 hover:text-red-600 hover:bg-red-50"
										>
											<Trash2 size={13} />
										</Button>
									</div>
								</Td>
							</Tr>
						))}
						{groups.length === 0 && (
							<Tr>
								<Td className="py-8 text-center text-zinc-400" colSpan={4}>
									No groups yet.{" "}
									<Link href="/groups/new" className="text-blue-600 hover:underline">
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
