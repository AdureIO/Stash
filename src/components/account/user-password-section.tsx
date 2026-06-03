"use client";

import { useState } from "react";
import { Lock, RefreshCw } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

export function UserPasswordSection() {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [success, setSuccess] = useState(false);

	async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setLoading(true);
		setError("");
		setSuccess(false);
		const fd = new FormData(e.currentTarget);
		const { ok, error: err } = await apiFetch("/api/auth/password", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ current: fd.get("current"), next: fd.get("next") }),
		});
		setLoading(false);
		if (ok) {
			setSuccess(true);
			(e.target as HTMLFormElement).reset();
		} else {
			setError(err || "Failed to update password");
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Lock size={14} />
					Password
				</CardTitle>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit} className="space-y-3">
					<Input label="Current password" name="current" type="password" required autoComplete="current-password" />
					<Input label="New password" name="next" type="password" required autoComplete="new-password" />
					{error && <p className="text-xs text-red-600">{error}</p>}
					{success && <p className="text-xs text-green-600">Password updated</p>}
					<Button size="sm" type="submit" disabled={loading}>
						<RefreshCw size={13} />
						{loading ? "Updating…" : "Update password"}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
