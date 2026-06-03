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

/** Manifest reference from a registry notification target URL (`.../manifests/<ref>`). */
export function parseManifestRefFromUrl(url?: string | null): string | null {
	if (!url) return null;
	const match = url.match(/\/manifests\/([^/?#]+)$/i);
	return match ? decodeURIComponent(match[1]) : null;
}

/** Tag or digest to scan after a manifest push (registry sometimes omits `target.tag`). */
export function resolveTaggedPushTarget(target: { tag?: string | null; url?: string | null }): string | null {
	if (target.tag) return target.tag;
	return parseManifestRefFromUrl(target.url);
}

/** Blob/layer pushes have no manifest tag; tagged manifest pushes do. */
export function isLayerPushEvent(params: { action: string; tag?: string | null; url?: string | null }): boolean {
	return params.action === "push" && !resolveTaggedPushTarget(params);
}

/** SQL fragment (no leading WHERE) — excludes internal pulls and layer pushes from lists and stats. */
export const EVENTS_PUBLIC_SQL = `NOT (action = 'pull' AND (actor = '${INTERNAL_REGISTRY_ACTOR}' OR ip IN ('127.0.0.1', '::1')))
  AND NOT (action = 'push' AND (tag IS NULL OR tag = ''))`;
