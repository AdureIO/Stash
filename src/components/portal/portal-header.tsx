import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { StashLogo } from "@/components/brand/stash-logo";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { PortalThemeToggle } from "@/components/portal/portal-theme";

export async function PortalHeader() {
	const session = await getSession();
	const signedIn = session && session.totpVerified !== false;

	return (
		<header className="portal-header sticky top-0 z-20 backdrop-blur-md">
			<div className="max-w-6xl mx-auto px-6 py-3.5 flex items-center justify-between gap-4">
				<Link href="/" className="flex items-center gap-2.5 shrink-0">
					<StashLogo size="sm" showWordmark wordmarkClassName="text-sm portal-wordmark" />
				</Link>
				<div className="flex items-center gap-2">
					<PortalThemeToggle />
					{signedIn ? (
						<Link href="/dashboard">
							<Button size="sm" className="gap-1.5">
								<LayoutDashboard size={14} />
								Dashboard
							</Button>
						</Link>
					) : (
						<Link href="/login">
							<Button size="sm" variant="secondary" className="portal-sign-in-btn">
								Sign in
							</Button>
						</Link>
					)}
				</div>
			</div>
		</header>
	);
}
