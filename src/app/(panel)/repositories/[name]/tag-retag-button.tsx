"use client";

import { useState } from "react";
import { Tag } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

interface Props {
	repo: string;
	sourceTag: string;
}

export function TagRetagButton({ repo, sourceTag }: Props) {
	const [open, setOpen] = useState(false);
	const [targetTag, setTargetTag] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const router = useRouter();

	async function handleRetag() {
		const tag = targetTag.trim();
		if (!tag) return;
		setLoading(true);
		setError(null);
		const { ok, error: err } = await apiFetch(`/api/registry/repositories/${encodeURIComponent(repo)}/retag`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ sourceTag, targetTag: tag }),
		});
		setLoading(false);
		if (!ok) {
			setError(err || "Retag failed");
			return;
		}
		setOpen(false);
		setTargetTag("");
		router.refresh();
	}

	return (
		<>
			<Button
				variant="ghost"
				size="sm"
				onClick={() => {
					setTargetTag("");
					setError(null);
					setOpen(true);
				}}
				title="Retag"
			>
				<Tag size={13} />
			</Button>
			<Dialog open={open} onClose={() => setOpen(false)} title="Retag">
				<p className="text-sm text-zinc-600 mb-3">
					Rename <span className="font-mono font-medium">{sourceTag}</span> to a new tag. The old tag will be
					removed.
				</p>
				<Input
					label="New tag name"
					value={targetTag}
					onChange={(e) => setTargetTag(e.target.value)}
					placeholder="e.g. v1.2.0"
					autoFocus
				/>
				{error && <p className="text-xs text-red-600 mt-2">{error}</p>}
				<div className="flex gap-2 justify-end mt-4">
					<Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<Button size="sm" onClick={handleRetag} disabled={loading || !targetTag.trim()}>
						{loading ? "Saving…" : "Retag"}
					</Button>
				</div>
			</Dialog>
		</>
	);
}
