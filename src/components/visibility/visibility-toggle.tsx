"use client";

import { useState } from "react";
import { Globe, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import type { RegistryType } from "@/lib/db";

interface Props {
	registryType: RegistryType;
	resourceKey: string;
	initialPublic: boolean;
	canManage: boolean;
	compact?: boolean;
}

export function VisibilityToggle({ registryType, resourceKey, initialPublic, canManage, compact }: Props) {
	const [isPublicPull, setIsPublicPull] = useState(initialPublic);
	const [loading, setLoading] = useState(false);

	if (!canManage) {
		if (!isPublicPull) return null;
		return <PublicPullBadge />;
	}

	async function toggle() {
		setLoading(true);
		const next = !isPublicPull;
		const { ok, error } = await apiFetch<{ public: boolean }>("/api/visibility", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ registryType, resourceKey, isPublic: next }),
		});
		setLoading(false);
		if (ok) setIsPublicPull(next);
		else console.error(error);
	}

	if (compact) {
		return (
			<button
				type="button"
				onClick={toggle}
				disabled={loading}
				className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-800 disabled:opacity-50"
				title={
					isPublicPull
						? "Anyone can pull without signing in. Push still requires authentication."
						: "Only authenticated users with access can pull. Push always requires authentication."
				}
			>
				{isPublicPull ? (
					<>
						<Globe size={12} className="text-blue-600" /> Public pull
					</>
				) : (
					<>
						<Lock size={12} /> Private
					</>
				)}
			</button>
		);
	}

	return (
		<Button
			variant="secondary"
			size="sm"
			onClick={toggle}
			disabled={loading}
			title={
				isPublicPull
					? "Anyone can pull without signing in. Push still requires authentication."
					: "Allow anonymous pull (push always requires authentication)"
			}
		>
			{isPublicPull ? (
				<>
					<Globe size={14} /> Public pull
				</>
			) : (
				<>
					<Lock size={14} /> Private
				</>
			)}
		</Button>
	);
}

export function PublicPullBadge() {
	return (
		<Badge variant="info" className="gap-1">
			<Globe size={10} /> Public pull
		</Badge>
	);
}

/** @deprecated Use PublicPullBadge */
export const PublicBadge = PublicPullBadge;
