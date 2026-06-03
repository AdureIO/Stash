/** JWT subject used for server-side registry API calls (UI, cron). */
export const INTERNAL_REGISTRY_ACTOR = "stash-internal";

const LOOPBACK_IPS = new Set(["127.0.0.1", "::1"]);

export function isLoopbackIp(ip: string | null | undefined): boolean {
	return ip != null && LOOPBACK_IPS.has(ip);
}

/** Pulls from the stash process itself (manifest/tag reads), not end users. */
export function isInternalRegistryPull(params: { action: string; actor?: string | null; ip?: string | null }): boolean {
	if (params.action !== "pull") return false;
	return params.actor === INTERNAL_REGISTRY_ACTOR || isLoopbackIp(params.ip);
}

/** SQL fragment (no leading WHERE) — excludes internal pulls from lists and stats. */
export const EVENTS_PUBLIC_SQL = `NOT (action = 'pull' AND (actor = '${INTERNAL_REGISTRY_ACTOR}' OR ip IN ('127.0.0.1', '::1')))`;
