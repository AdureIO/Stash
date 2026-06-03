import { db } from "./db";
import { enqueueScan } from "./scan-queue";
import { scanImageDirect } from "./trivy";
import { issueInternalRegistryToken } from "./token-auth";

const SETTING_KEY = "AUTO_SCAN_ON_PUSH";

/** Registry may notify before the tag is readable; retry transient pull failures. */
const SCAN_RETRY_DELAYS_MS = [0, 250, 1000, 3000];

export function isAutoScanOnPushEnabled(): boolean {
	return db.settings.get(SETTING_KEY) === "true";
}

function isRetryableScanError(err: unknown): boolean {
	const msg = ((err as Error)?.message || "").toLowerCase();
	return (
		msg.includes("manifest unknown") ||
		msg.includes("not found") ||
		msg.includes("404") ||
		msg.includes("no such manifest") ||
		msg.includes("connection refused") ||
		msg.includes("connection reset")
	);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
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
	let lastError: unknown;

	try {
		const token = await issueInternalRegistryToken([{ type: "repository", name: repository, actions: ["pull"] }]);

		for (const delayMs of SCAN_RETRY_DELAYS_MS) {
			if (delayMs > 0) await sleep(delayMs);
			try {
				const result = await scanImageDirect(registryUrl, repository, tag, token);
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
				return;
			} catch (e) {
				lastError = e;
				if (!isRetryableScanError(e)) break;
			}
		}
	} catch (e) {
		lastError = e;
	}

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
		raw_json: (lastError as Error)?.message || "auto-scan failed",
	});
}
