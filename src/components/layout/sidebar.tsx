"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
	LayoutDashboard,
	Package,
	Users,
	Activity,
	Webhook,
	Trash2,
	Settings,
	LogOut,
	Box,
	Key,
	ShieldCheck,
	BarChart2,
	BookOpen,
	Users2,
	FileText,
	UserCircle,
} from "lucide-react";
import type { Features } from "@/lib/features";
import { GlobalSearch } from "@/components/layout/global-search";
import { StashLogo } from "@/components/brand/stash-logo";
import { isPanelAdminRole, isSuperAdminRole } from "@/lib/roles";

interface NavLink {
	type: "link";
	href: string;
	label: string;
	icon: React.ElementType;
	feature?: keyof Features;
	/** Omit = any logged-in user */
	require?: "panelAdmin" | "superAdmin";
}

interface NavSection {
	type: "section";
	label: string;
	require?: "panelAdmin" | "superAdmin";
}

type NavItem = NavLink | NavSection;

function buildNav(features: Features, role: string | null): NavItem[] {
	const panelAdmin = role ? isPanelAdminRole(role) : false;
	const superAdmin = role ? isSuperAdminRole(role) : false;

	const items: NavItem[] = [
		{ type: "link", href: "/", label: "Dashboard", icon: LayoutDashboard },

		{ type: "section" as const, label: "Registries" },
		...(features.docker
			? [{ type: "link" as const, href: "/repositories", label: "Docker Images", icon: Package }]
			: []),
		...(features.maven
			? [{ type: "link" as const, href: "/packages", label: "Maven Packages", icon: BookOpen }]
			: []),
		...(features.npm ? [{ type: "link" as const, href: "/npm", label: "NPM Packages", icon: Box }] : []),

		{ type: "section" as const, label: "Access" },
		{ type: "link", href: "/account", label: "My account", icon: UserCircle },
		...(panelAdmin
			? [
					{
						type: "link" as const,
						href: "/users",
						label: "Users",
						icon: Users,
						require: "panelAdmin" as const,
					},
					{
						type: "link" as const,
						href: "/groups",
						label: "Groups",
						icon: Users2,
						require: "panelAdmin" as const,
					},
				]
			: []),
		{ type: "link", href: "/tokens", label: "Access Tokens", icon: Key },

		{ type: "section" as const, label: "Operations" },
		{ type: "link", href: "/activity", label: "Activity", icon: Activity },
		...(superAdmin
			? [
					{
						type: "link" as const,
						href: "/audit",
						label: "Audit Log",
						icon: FileText,
						require: "superAdmin" as const,
					},
					{
						type: "link" as const,
						href: "/security",
						label: "Security",
						icon: ShieldCheck,
						require: "superAdmin" as const,
					},
					{
						type: "link" as const,
						href: "/storage",
						label: "Storage",
						icon: BarChart2,
						require: "superAdmin" as const,
					},
				]
			: []),

		...(superAdmin
			? [
					{ type: "section" as const, label: "Configuration", require: "superAdmin" as const },
					...(features.docker
						? [
								{
									type: "link" as const,
									href: "/webhooks",
									label: "Webhooks",
									icon: Webhook,
									require: "superAdmin" as const,
								},
								{
									type: "link" as const,
									href: "/cleanup",
									label: "Cleanup",
									icon: Trash2,
									require: "superAdmin" as const,
								},
							]
						: []),
					{
						type: "link" as const,
						href: "/settings",
						label: "Settings",
						icon: Settings,
						require: "superAdmin" as const,
					},
				]
			: []),
	];
	return items;
}

export function Sidebar({ features, role }: { features: Features; role: string | null }) {
	const pathname = usePathname();
	const navItems = buildNav(features, role);

	async function handleLogout() {
		await fetch("/api/auth/logout", { method: "POST" });
		window.location.href = "/login";
	}

	return (
		<aside className="w-[220px] min-h-screen bg-zinc-950 flex flex-col shrink-0">
			<div className="flex items-center gap-2.5 px-4 py-4 border-b border-zinc-800/60">
				<StashLogo size="sm" showWordmark wordmarkClassName="text-sm" />
				<span className="ml-auto text-[10px] font-medium text-zinc-600 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 leading-none">
					v0.1
				</span>
			</div>

			<GlobalSearch />

			<nav className="flex-1 py-3 overflow-y-auto">
				{navItems.map((item, i) => {
					if (item.type === "section") {
						return (
							<p
								key={`section-${i}`}
								className="px-4 pt-4 pb-1 text-[10px] font-semibold text-zinc-600 uppercase tracking-widest"
							>
								{item.label}
							</p>
						);
					}

					const { href, label, icon: Icon } = item;
					const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

					return (
						<Link
							key={href}
							href={href}
							className={[
								"sidebar-text flex items-center gap-2.5 mx-2 px-3 py-2 rounded-md text-[13px] font-medium transition-colors",
								active
									? "bg-zinc-800 text-zinc-100"
									: "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300",
							].join(" ")}
						>
							<Icon size={14} strokeWidth={1.75} />
							{label}
						</Link>
					);
				})}
			</nav>

			<div className="p-2 border-t border-zinc-800/60">
				<button
					onClick={handleLogout}
					className="sidebar-text w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300 transition-colors"
				>
					<LogOut size={14} strokeWidth={1.75} />
					Sign out
				</button>
			</div>
		</aside>
	);
}
