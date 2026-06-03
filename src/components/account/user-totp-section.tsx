"use client";

import { useState } from "react";
import { ShieldCheck, ShieldOff, Eye, EyeOff } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

interface Props {
	username: string;
	initialEnabled: boolean;
}

export function UserTotpSection({ username, initialEnabled }: Props) {
	const [enabled, setEnabled] = useState(initialEnabled);
	const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
	const [code, setCode] = useState("");
	const [showSecret, setShowSecret] = useState(false);

	async function startSetup() {
		const { ok, data } = await apiFetch<{ secret: string; qr: string }>("/api/auth/totp/setup");
		if (ok && data) setSetup(data);
	}

	async function verifyAndEnable() {
		const { ok } = await apiFetch("/api/auth/totp/setup", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ code }),
		});
		if (ok) {
			setEnabled(true);
			setSetup(null);
			setCode("");
		}
	}

	async function disable() {
		const { ok } = await apiFetch("/api/auth/totp/setup", { method: "DELETE" });
		if (ok) setEnabled(false);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<ShieldCheck size={14} />
					Two-factor authentication
				</CardTitle>
			</CardHeader>
			<CardContent>
				<p className="text-xs text-zinc-500 mb-4">
					Per-user setting for <span className="font-medium text-zinc-700">{username}</span>. When enabled, a
					TOTP code is required after password or SSO login.
				</p>
				{!enabled ? (
					<div className="space-y-3">
						<p className="text-sm text-zinc-600">2FA is off for this account.</p>
						{!setup ? (
							<Button size="sm" onClick={startSetup}>
								<ShieldCheck size={13} /> Set up 2FA
							</Button>
						) : (
							<div className="space-y-3">
								<div className="flex gap-4 items-start">
									<img src={setup.qr} alt="QR code" className="w-36 h-36 rounded-lg border border-zinc-200" />
									<div className="space-y-2">
										<p className="text-xs text-zinc-600">
											Scan with your authenticator app (Google Authenticator, Authy, etc.)
										</p>
										<div className="flex items-center gap-1">
											<code className="text-xs bg-zinc-50 border px-2 py-1 rounded font-mono">
												{showSecret ? setup.secret : "••••••••••••••••"}
											</code>
											<button
												type="button"
												onClick={() => setShowSecret(!showSecret)}
												className="text-zinc-400 hover:text-zinc-600"
											>
												{showSecret ? <EyeOff size={12} /> : <Eye size={12} />}
											</button>
										</div>
									</div>
								</div>
								<div className="flex gap-2">
									<input
										value={code}
										onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
										placeholder="6-digit code"
										className="flex-1 px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
									/>
									<Button size="sm" onClick={verifyAndEnable} disabled={code.length !== 6}>
										Verify & enable
									</Button>
								</div>
							</div>
						)}
					</div>
				) : (
					<div className="flex items-center justify-between gap-4">
						<div className="flex items-center gap-2 text-sm text-green-700">
							<ShieldCheck size={16} className="text-green-600" />
							2FA is enabled on this account
						</div>
						<Button variant="secondary" size="sm" onClick={disable}>
							<ShieldOff size={13} /> Disable
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
