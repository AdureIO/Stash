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
		console.log(`[cron] Cleanup done — ${body.deleted ?? 0} tags deleted`);
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

console.log("[cron] Scheduled jobs registered");
