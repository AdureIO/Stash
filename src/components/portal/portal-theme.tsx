"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import {
	PORTAL_THEME_COLORS,
	PORTAL_THEME_STORAGE_KEY,
	resolvePortalTheme,
	type PortalThemeMode,
} from "@/lib/portal-theme";

const PortalThemeContext = createContext<{
	theme: PortalThemeMode;
	toggle: () => void;
} | null>(null);

function applyDocumentTheme(theme: PortalThemeMode) {
	const html = document.documentElement;
	html.dataset.portalTheme = theme;
	html.style.colorScheme = theme;

	const meta = document.querySelector('meta[name="theme-color"]');
	if (meta) meta.setAttribute("content", PORTAL_THEME_COLORS[theme]);
}

export function PortalThemeProvider({ children }: { children: React.ReactNode }) {
	const [theme, setTheme] = useState<PortalThemeMode>("dark");

	useEffect(() => {
		const initial = resolvePortalTheme(localStorage.getItem(PORTAL_THEME_STORAGE_KEY));
		setTheme(initial);
		applyDocumentTheme(initial);

		return () => {
			delete document.documentElement.dataset.portalTheme;
			document.documentElement.style.colorScheme = "";
		};
	}, []);

	const toggle = useCallback(() => {
		setTheme((prev) => {
			const next: PortalThemeMode = prev === "dark" ? "light" : "dark";
			localStorage.setItem(PORTAL_THEME_STORAGE_KEY, next);
			applyDocumentTheme(next);
			return next;
		});
	}, []);

	return <PortalThemeContext.Provider value={{ theme, toggle }}>{children}</PortalThemeContext.Provider>;
}

export function usePortalTheme() {
	const ctx = useContext(PortalThemeContext);
	if (!ctx) throw new Error("usePortalTheme must be used within PortalThemeProvider");
	return ctx;
}

export function PortalThemeToggle() {
	const { theme, toggle } = usePortalTheme();
	const isDark = theme === "dark";

	return (
		<button
			type="button"
			onClick={toggle}
			className="portal-theme-toggle"
			title={isDark ? "Switch to light mode" : "Switch to dark mode"}
			aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
		>
			{isDark ? <Sun size={15} strokeWidth={1.75} /> : <Moon size={15} strokeWidth={1.75} />}
		</button>
	);
}
