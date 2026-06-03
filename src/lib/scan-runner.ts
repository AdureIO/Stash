import { db } from "./db";
import { enqueueScan } from "./scan-queue";
import { scanImage } from "./trivy";
import { issueInternalRegistryToken } from "./token-auth";

const SETTING_KEY = "AUTO_SCAN_ON_PUSH";

export function isAutoScanOnPushEnabled(): boolean {
	return db.settings.get(SETTING_KEY) === "true";
}

/** Fire-and-forget Trivy scan after a registry push (does not block the webhook). */
export function queueScanOnPush(repository: string, tag: string | null | undefined): void {
	if (!isAutoScanOnPushEnabled() || !tag) return;
	void enqueueScan(() => runScanAsync(repository, tag)).catch((err) => {
		console.error(`[stash] auto-scan failed for ${repository}:${tag}`, err);
	});
}

async function runScanAsync(repository: string, tag: string): Promise<void> {
	const registryUrl = process.env.REGISTRY_URL || "http://127.0.0.1:5000";
	const token = await issueInternalRegistryToken([{ type: "repository", name: repository, actions: ["pull"] }]);

	try {
		const result = await scanImage(registryUrl, repository, tag, token);
		db.scans.insert({
			repository,
			tag,
			digest: "",
			scanned_at: new Date().toISOString(),
			status: "ok",
			critical: result.critical,
			high: result.high,
			medium: result.medium,
			low: result.low,
			raw_json: result.raw,
		});
	} catch (e) {
		db.scans.insert({
			repository,
			tag,
			digest: "",
			scanned_at: new Date().toISOString(),
			status: "error",
			critical: 0,
			high: 0,
			medium: 0,
			low: 0,
			raw_json: (e as Error).message,
		});
	}
}
