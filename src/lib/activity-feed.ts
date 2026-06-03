import type { Event, ScanResult, WebhookDelivery } from "./db";

export type SafeScan = Omit<ScanResult, "raw_json">;

export type ActivityFeedItem =
	| ({ kind: "registry" } & Event)
	| ({ kind: "scan" } & SafeScan)
	| ({ kind: "webhook" } & WebhookDelivery);

export function buildActivityFeed(
	events: Event[],
	scans: SafeScan[],
	webhooks: WebhookDelivery[],
	limit: number,
): ActivityFeedItem[] {
	const items: ActivityFeedItem[] = [
		...events.map((e) => ({ kind: "registry" as const, ...e })),
		...scans.map((s) => ({ kind: "scan" as const, ...s })),
		...webhooks.map((w) => ({ kind: "webhook" as const, ...w })),
	];
	items.sort((a, b) => activityTimestamp(b).localeCompare(activityTimestamp(a)));
	return items.slice(0, limit);
}

export function activityTimestamp(item: ActivityFeedItem): string {
	if (item.kind === "registry") return item.timestamp;
	if (item.kind === "scan") return item.scanned_at;
	return item.delivered_at;
}
