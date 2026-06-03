"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { StashLogo } from "@/components/brand/stash-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

interface SsoProvider {
	id: number;
	name: string;
	type: string;
}
interface Props {
	ssoProviders: SsoProvider[];
}

const SSO_ICONS: Record<string, string> = {
	google: "G",
	github: "⌬",
	gitlab: "⬡",
	oidc: "◎",
};

export function LoginForm({ ssoProviders }: Props) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const ssoError = searchParams.get("error");

	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState(ssoError ? `SSO error: ${ssoError.replace(/_/g, " ")}` : "");
	const [loading, setLoading] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setLoading(true);
		setError("");

		try {
			const res = await fetch("/api/auth/login", {
				method: "POST",
				credentials: "same-origin",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username, password }),
			});

			if (res.status === 202) {
				// 2FA required
				router.push("/login/totp");
				return;
			}

			if (res.ok) {
				router.push("/dashboard");
				router.refresh();
				return;
			}

			let message = "Invalid credentials";
			try {
				const d = await res.json();
				message = d.error || message;
			} catch {}
			setError(message);
		} catch {
			setError("Could not reach server");
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="min-h-screen bg-zinc-900 flex items-center justify-center p-4">
			<div className="w-full max-w-sm">
				<div className="flex flex-col items-center mb-8">
					<StashLogo size="lg" className="mb-4" />
					<h1 className="text-xl font-semibold text-white">Stash</h1>
					<p className="text-zinc-400 text-sm mt-1">Sign in to manage your registry</p>
					<Link
						href="/"
						className="text-sm text-blue-400 hover:text-blue-300 mt-2 inline-block transition-colors"
					>
						Browse public pull packages →
					</Link>
				</div>

				<form onSubmit={handleSubmit} className="bg-zinc-800 rounded-xl p-6 space-y-4 border border-zinc-700">
					<Input
						id="username"
						label="Username"
						labelClassName="text-zinc-300"
						type="text"
						value={username}
						onChange={(e) => setUsername(e.target.value)}
						placeholder="admin"
						autoComplete="username"
						required
						className="bg-zinc-700 border-zinc-600 text-white placeholder:text-zinc-500 focus:border-blue-500"
					/>
					<Input
						id="password"
						label="Password"
						labelClassName="text-zinc-300"
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						placeholder="••••••••"
						autoComplete="current-password"
						required
						className="bg-zinc-700 border-zinc-600 text-white placeholder:text-zinc-500 focus:border-blue-500"
					/>

					{error && (
						<p className="text-sm text-red-400 flex items-center gap-1.5">
							<AlertCircle size={13} />
							{error}
						</p>
					)}

					<Button type="submit" className="w-full justify-center" disabled={loading}>
						{loading ? "Signing in…" : "Sign in"}
					</Button>
				</form>

				{ssoProviders.length > 0 && (
					<div className="mt-4 space-y-2">
						<div className="flex items-center gap-3 text-zinc-600 text-xs">
							<div className="flex-1 h-px bg-zinc-700" />
							or continue with
							<div className="flex-1 h-px bg-zinc-700" />
						</div>
						{ssoProviders.map((p) => (
							<a
								key={p.id}
								href={`/api/auth/sso/${p.id}`}
								className="flex items-center justify-center gap-2.5 w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-sm font-medium text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
							>
								<span className="w-5 h-5 bg-zinc-700 rounded text-xs flex items-center justify-center font-bold">
									{SSO_ICONS[p.type] || p.type[0].toUpperCase()}
								</span>
								{p.name}
							</a>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
