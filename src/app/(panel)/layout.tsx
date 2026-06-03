import { Sidebar } from "@/components/layout/sidebar";
import { getFeatures } from "@/lib/features";
import { getSession } from "@/lib/auth";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
	const features = getFeatures();
	const session = await getSession();
	return (
		<div className="flex h-screen overflow-hidden bg-zinc-50">
			<Sidebar features={features} role={session?.role ?? null} />
			<main className="flex-1 min-h-0 p-6 overflow-auto min-w-0">{children}</main>
		</div>
	);
}
