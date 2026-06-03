import { cn } from "@/lib/utils";

interface ShellProps {
	className?: string;
	children: React.ReactNode;
}

export function PortalCard({ className, children }: ShellProps) {
	return <div className={cn("portal-card", className)}>{children}</div>;
}

export function PortalCardHover({
	className,
	accent,
	children,
}: ShellProps & { accent?: "blue" | "purple" | "emerald" }) {
	return (
		<div className={cn("group portal-card-hover", accent && `portal-card-hover--${accent}`, className)}>
			{children}
		</div>
	);
}

export function PortalCardHeader({ className, children }: ShellProps) {
	return <div className={cn("portal-card-header", className)}>{children}</div>;
}

export function PortalCardTitle({ className, children }: ShellProps) {
	return <h2 className={cn("portal-card-title", className)}>{children}</h2>;
}

export function PortalCardContent({ className, children }: ShellProps) {
	return <div className={cn("portal-card-content", className)}>{children}</div>;
}

export function PortalTable({ children, className }: ShellProps) {
	return (
		<div className="overflow-x-auto">
			<table className={cn("w-full text-sm border-collapse", className)}>{children}</table>
		</div>
	);
}

export function PortalTh({ children, className }: { children?: React.ReactNode; className?: string }) {
	return <th className={cn("portal-th", className)}>{children}</th>;
}

export function PortalTd({ children, className }: { children?: React.ReactNode; className?: string }) {
	return <td className={cn("portal-td", className)}>{children}</td>;
}

export function PortalTr({ children, className }: { children: React.ReactNode; className?: string }) {
	return <tr className={cn("portal-tr", className)}>{children}</tr>;
}

export function PortalTbody({ children }: { children: React.ReactNode }) {
	return <tbody className="portal-tbody">{children}</tbody>;
}

export function PortalThead({ children }: { children: React.ReactNode }) {
	return <thead>{children}</thead>;
}

type BadgeVariant = "default" | "info" | "success" | "purple";

export function PortalBadge({
	variant = "default",
	children,
	className,
}: {
	variant?: BadgeVariant;
	children: React.ReactNode;
	className?: string;
}) {
	return <span className={cn("portal-badge", `portal-badge--${variant}`, className)}>{children}</span>;
}
