import { redirect } from "next/navigation";
import { SettingsPanel } from "./settings-panel";
import { Header } from "@/components/layout/header";
import { healthCheck } from "@/lib/registry";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
	try {
		await requireSuperAdmin();
	} catch {
		redirect("/dashboard");
	}

	const healthy = await healthCheck();
	const publicUrl = process.env.PUBLIC_URL || "http://localhost:3000";
	const registryUrl = process.env.REGISTRY_URL || "http://127.0.0.1:5000";

	return (
		<div>
			<Header title="Settings" subtitle="Registry configuration, SSO, and system operations" />
			<SettingsPanel
				healthy={healthy}
				publicUrl={publicUrl}
				registryUrl={registryUrl}
				autoScanOnPush={db.settings.get("AUTO_SCAN_ON_PUSH") === "true"}
			/>
		</div>
	);
}
