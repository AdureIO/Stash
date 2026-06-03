import Script from "next/script";
import { PORTAL_THEME_STORAGE_KEY } from "@/lib/portal-theme";

/** Runs before paint to avoid a light flash when dark mode is saved. */
export function PortalThemeScript() {
	const code = `(function(){try{var k=${JSON.stringify(PORTAL_THEME_STORAGE_KEY)};var t=localStorage.getItem(k);if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.dataset.portalTheme=t;document.documentElement.style.colorScheme=t;}catch(e){document.documentElement.dataset.portalTheme="dark";document.documentElement.style.colorScheme="dark";}})();`;

	return <Script id="portal-theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: code }} />;
}
