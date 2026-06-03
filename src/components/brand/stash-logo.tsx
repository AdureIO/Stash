import { cn } from "@/lib/utils";

const sizeMap = {
	sm: 28,
	md: 40,
	lg: 48,
} as const;

type StashLogoProps = {
	size?: keyof typeof sizeMap;
	className?: string;
	/** Show "Stash" wordmark beside the mark */
	showWordmark?: boolean;
	wordmarkClassName?: string;
};

function StashMark({ px }: { px: number }) {
	return (
		<svg width={px} height={px} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
			<rect width="32" height="32" rx="8" className="fill-blue-600" />
			<rect x="8" y="7" width="16" height="18" rx="2.5" stroke="white" strokeWidth="2" />
			<path d="M8 11.5H24" stroke="white" strokeWidth="2" strokeLinecap="round" />
			<rect x="10.5" y="14" width="11" height="2" rx="1" fill="white" fillOpacity="0.95" />
			<rect x="10.5" y="17.5" width="11" height="2" rx="1" fill="white" fillOpacity="0.75" />
			<rect x="10.5" y="21" width="11" height="2" rx="1" fill="white" fillOpacity="0.55" />
		</svg>
	);
}

export function StashLogo({ size = "sm", className, showWordmark = false, wordmarkClassName }: StashLogoProps) {
	const px = sizeMap[size];

	if (!showWordmark) {
		return (
			<span className={cn("inline-flex shrink-0", className)} role="img" aria-label="Stash">
				<StashMark px={px} />
			</span>
		);
	}

	return (
		<span className={cn("inline-flex items-center gap-2.5", className)}>
			<StashMark px={px} />
			<span className={cn("font-semibold tracking-tight text-white", wordmarkClassName)}>Stash</span>
		</span>
	);
}
