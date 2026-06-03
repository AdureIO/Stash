import type { Metadata, Viewport } from "next";
import { PortalHeader } from "@/components/portal/portal-header";
import { PortalThemeProvider } from "@/components/portal/portal-theme";
import { PortalThemeScript } from "@/components/portal/portal-theme-script";
import "../portal-theme.css";

export const metadata: Metadata = {
	title: "Stash — Artifact registry",
	description: "Browse and pull public Docker images, Maven artifacts, and NPM packages.",
};

export const viewport: Viewport = {
	themeColor: [
		{ media: "(prefers-color-scheme: dark)", color: "#09090b" },
		{ media: "(prefers-color-scheme: light)", color: "#fafafa" },
	],
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
	return (
		<>
			<PortalThemeScript />
			<PortalThemeProvider>
				<div className="portal-root">
					<div className="portal-ambient" aria-hidden />
					<div className="portal-grid" aria-hidden />

					<div className="relative flex min-h-screen flex-col">
						<PortalHeader />
						<main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8 sm:py-10">{children}</main>
						<footer className="max-w-6xl mx-auto w-full px-6 pb-8 pt-2">
							<p className="text-center text-xs portal-footer-text">Stash · artifact registry</p>
						</footer>
					</div>
				</div>
			</PortalThemeProvider>
		</>
	);
}
