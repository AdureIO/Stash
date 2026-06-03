export type PortalThemeMode = "light" | "dark";

export const PORTAL_THEME_STORAGE_KEY = "stash-portal-theme";

export function resolvePortalTheme(stored: string | null): PortalThemeMode {
	if (stored === "light" || stored === "dark") return stored;
	if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
		return "dark";
	}
	return "dark";
}

export const PORTAL_THEME_COLORS: Record<PortalThemeMode, string> = {
	dark: "#09090b",
	light: "#fafafa",
};
