import { Package, BookOpen, Box } from "lucide-react";
import type { Features } from "@/lib/features";

interface Props {
	features: Features;
	totalCount: number;
}

export function PortalHero({ features, totalCount }: Props) {
	const enabled = [
		features.docker && { icon: Package, label: "Docker", color: "text-blue-500" },
		features.maven && { icon: BookOpen, label: "Maven", color: "text-purple-500" },
		features.npm && { icon: Box, label: "NPM", color: "text-emerald-500" },
	].filter(Boolean) as { icon: React.ElementType; label: string; color: string }[];

	return (
		<div className="portal-hero">
			<div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-500/70 to-transparent" />
			<div className="absolute inset-0 pointer-events-none portal-hero-glow" />

			<div className="relative px-6 py-9 sm:px-10 sm:py-11">
				<div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
					<div>
						<p className="text-xs font-semibold uppercase tracking-[0.2em] portal-hero-eyebrow mb-3">
							Public catalog
						</p>
						<h1 className="text-3xl sm:text-4xl font-semibold tracking-tight portal-hero-title">
							Artifact registry
						</h1>
						<p className="mt-2 text-sm portal-hero-sub max-w-md">
							{totalCount > 0
								? `${totalCount} public ${totalCount === 1 ? "package" : "packages"} available.`
								: "Shared packages appear here when published."}
						</p>
					</div>

					{enabled.length > 0 && (
						<div className="flex flex-wrap gap-2">
							{enabled.map(({ icon: Icon, label, color }) => (
								<span
									key={label}
									className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium portal-hero-pill"
								>
									<Icon size={13} strokeWidth={1.75} className={color} />
									{label}
								</span>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
