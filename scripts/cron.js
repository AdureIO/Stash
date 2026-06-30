// Background cron — supervisord process; uses HTTP only (no SQLite / src imports).
const cron = require("node-cron");

const base = `http://127.0.0.1:${process.env.PORT || 3000}`;
const headers = { "x-internal": "cron" };

console.log("[cron] Starting scheduler...");

cron.schedule("0 2 * * *", async () => {
	console.log("[cron] Running scheduled cleanup...");
	try {
		const res = await fetch(`${base}/api/admin/cleanup-cron`, { method: "POST", headers });
		if (!res.ok) throw new Error(`status ${res.status}`);
		const body = await res.json();
		const gcNote = body.gc?.skipped
			? ""
			: body.gc?.ok === false
				? ", GC failed"
				: body.deleted > 0
					? ", GC ok"
					: "";
		console.log(`[cron] Cleanup done — ${body.deleted ?? 0} tags deleted${gcNote}`);
	} catch (e) {
		console.error("[cron] Cleanup failed:", e.message || e);
	}
});

cron.schedule("30 * * * *", async () => {
	try {
		const res = await fetch(`${base}/api/admin/storage?refresh=1`, { headers });
		if (!res.ok) throw new Error(`status ${res.status}`);
	} catch (e) {
		console.error("[cron] Storage snapshot failed:", e.message || e);
	}
});

// Refresh Trivy vuln/Java DBs daily; re-download binary when TRIVY_VERSION changes
const trivyUpdateCron = process.env.TRIVY_UPDATE_CRON || "15 3 * * *";
if (trivyUpdateCron.toLowerCase() !== "off") {
	cron.schedule(trivyUpdateCron, async () => {
		console.log("[cron] Running scheduled Trivy update...");
		try {
			const res = await fetch(`${base}/api/admin/trivy-update-cron`, {
				method: "POST",
				headers,
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error || `status ${res.status}`);
			}
			const body = await res.json();
			console.log(`[cron] Trivy update done — ${body.message ?? "ok"}`);
		} catch (e) {
			console.error("[cron] Trivy update failed:", e.message || e);
		}
	});
	console.log(`[cron] Trivy update scheduled (${trivyUpdateCron})`);
}

console.log("[cron] Scheduled jobs registered");
