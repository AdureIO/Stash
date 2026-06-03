"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { StashLogo } from "@/components/brand/stash-logo";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

export default function TotpPage() {
	const router = useRouter();
	const [code, setCode] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setLoading(true);
		setError("");
		const { ok, error: err } = await apiFetch("/api/auth/totp/verify", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ code }),
		});
		if (ok) {
			router.push("/dashboard");
			router.refresh();
		} else {
			setError(err || "Invalid code");
			setCode("");
			inputRef.current?.focus();
		}
		setLoading(false);
	}

	return (
		<div className="min-h-screen bg-zinc-900 flex items-center justify-center p-4">
			<div className="w-full max-w-sm">
				<div className="flex flex-col items-center mb-8">
					<StashLogo size="lg" className="mb-4" />
					<h1 className="text-xl font-semibold text-white">Two-Factor Authentication</h1>
					<p className="text-zinc-400 text-sm mt-1">Enter the 6-digit code from your authenticator app</p>
				</div>
				<form onSubmit={handleSubmit} className="bg-zinc-800 rounded-xl p-6 space-y-4 border border-zinc-700">
					<input
						ref={inputRef}
						type="text"
						inputMode="numeric"
						pattern="[0-9]{6}"
						maxLength={6}
						value={code}
						onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
						placeholder="000000"
						autoFocus
						required
						className="w-full px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] rounded-lg border border-zinc-600 bg-zinc-700 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
					/>
					{error && <p className="text-sm text-red-400 text-center">{error}</p>}
					<Button type="submit" className="w-full justify-center" disabled={loading || code.length !== 6}>
						{loading ? "Verifying…" : "Verify"}
					</Button>
					<button
						type="button"
						onClick={() => {
							document.cookie = "ra_session=; Max-Age=0";
							router.push("/login");
						}}
						className="w-full text-center text-sm text-zinc-500 hover:text-zinc-300"
					>
						Back to login
					</button>
				</form>
			</div>
		</div>
	);
}
