/** Prefer `latest` when present; otherwise use the last sorted tag name. */
export function pickLatestTag(tags: string[]): string | null {
	if (tags.length === 0) return null;
	if (tags.includes("latest")) return "latest";
	return tags[tags.length - 1];
}
