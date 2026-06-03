/** Base URL for registry → stash notification callbacks (same container). */
export function getInternalStashBaseUrl(): string {
	const fromEnv = process.env.STASH_INTERNAL_URL?.replace(/\/$/, "");
	if (fromEnv) return fromEnv;
	// With Docker enabled, front-proxy listens on :3000 and forwards to Next on :3001.
	if (process.env.ENABLE_DOCKER !== "false") {
		return "http://127.0.0.1:3000";
	}
	return `http://127.0.0.1:${process.env.PORT || "3000"}`;
}

export function getRegistryWebhookEventsUrl(): string {
	return `${getInternalStashBaseUrl()}/api/webhook/events`;
}
