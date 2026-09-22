// Shared cleanup logic — used by both the API (manual run) and cron (scheduled)
import { db } from "./db";
import { listRepositories, listTags, getManifest, getImageConfig, deleteTag } from "./registry";
import { matchesPattern } from "./utils";
import { getFeatures } from "./features";
import { runGarbageCollection } from "./gc";
import { logAction } from "./audit";

export interface CleanupResult {
	deleted: number;
	repos: number;
	gc?: { ok: boolean; output: string; skipped?: boolean };
}

interface TagAge {
	tag: string;
	digest: string;
	/** When the tag landed in this registry, or null when nothing recorded it. */
	age: number | null;
}

/**
 * Age of a tag, in epoch millis.
 *
 * The push time from the event log is authoritative. The config blob's `created` is the
 * *build* date, and reproducible builds (buildx with SOURCE_DATE_EPOCH, distroless, ko,
 * buildpacks) stamp it 1970-01-01 — using it as the age makes every such tag instantly
 * older than any retention window. It is only a fallback for tags pushed before the event
 * log existed.
 */
function resolveAge(pushedAt: string | undefined, created: string | null): number | null {
	for (const candidate of [pushedAt, created]) {
		if (!candidate) continue;
		const ms = new Date(candidate).getTime();
		if (Number.isFinite(ms)) return ms;
	}
	return null;
}

/** Tags a retention rule must never remove: the newest one, and `latest`. */
function protectedTags(sortedByAge: TagAge[]): string[] {
	const keep = [];
	if (sortedByAge.length > 0) keep.push(sortedByAge[0].tag);
	if (sortedByAge.some((t) => t.tag === "latest")) keep.push("latest");
	return keep;
}

export async function runCleanup(ruleId?: number): Promise<CleanupResult> {
	const rules = ruleId ? [db.cleanup.findById(ruleId)].filter(Boolean) : db.cleanup.findActive();

	const repos = await listRepositories();
	let deleted = 0;
	let reposProcessed = 0;
	let sweepUnreachable = false;

	for (const rule of rules) {
		if (!rule) continue;

		// keep_last_n below 1 would empty every matching repository in one pass. The form
		// enforces a minimum of 1; a rule that got past it is a mistake, not an intent.
		const keepLastN = rule.keep_last_n != null && rule.keep_last_n >= 1 ? rule.keep_last_n : null;
		if (rule.keep_last_n != null && keepLastN == null) {
			console.error(
				`[cleanup] Rule "${rule.name}" (#${rule.id}) has keep_last_n=${rule.keep_last_n}; ignoring it rather than deleting every tag.`,
			);
		}
		if (keepLastN == null && rule.max_age_days == null) continue;

		if (rule.delete_untagged) sweepUnreachable = true;

		const matchingRepos = repos.filter((r) => matchesPattern(rule.repository_pattern, r));
		let deletedByRule = 0;

		for (const repo of matchingRepos) {
			reposProcessed++;
			const tags = await listTags(repo);
			const pushTimes = new Map(db.events.pushTimesByRepo(repo).map((r) => [r.tag, r.pushed_at]));
			const tagAges: TagAge[] = [];

			for (const tag of tags) {
				// A tag that will not resolve is left alone: it may be repairable, and its
				// age cannot be established either way.
				const m = await getManifest(repo, tag);
				if (!m) continue;
				const cfg = await getImageConfig(repo, m.manifest.config.digest);
				tagAges.push({ tag, digest: m.digest, age: resolveAge(pushTimes.get(tag), cfg?.created ?? null) });
			}

			// Newest first; tags of unknown age sort last so keep_last_n drops them first.
			tagAges.sort((a, b) => {
				if (a.age == null && b.age == null) return 0;
				if (a.age == null) return 1;
				if (b.age == null) return -1;
				return b.age - a.age;
			});

			const toDelete = new Set<string>();
			if (keepLastN != null) tagAges.slice(keepLastN).forEach((t) => toDelete.add(t.tag));
			if (rule.max_age_days != null) {
				const cutoff = Date.now() - rule.max_age_days * 86400000;
				tagAges.forEach((t) => {
					if (t.age != null && t.age < cutoff) toDelete.add(t.tag);
				});
			}

			// Retention prunes history, it never empties a repository. The newest tag stays
			// whatever its age, and so does `latest`, which is what a bare `docker pull`
			// resolves to — an age rule that removed either would break every consumer.
			for (const protectedTag of protectedTags(tagAges)) toDelete.delete(protectedTag);

			for (const tag of toDelete) {
				if (!(await deleteTag(repo, tag))) continue;
				deleted++;
				deletedByRule++;
				logAction("cleanup", "cleanup.tag.delete", "tag", `${repo}:${tag}`, {
					rule: rule.name,
					ruleId: rule.id,
					digest: tagAges.find((t) => t.tag === tag)?.digest ?? null,
				});
			}

		}

		db.cleanup.update(rule.id, { last_run: new Date().toISOString(), last_deleted: deletedByRule });
	}

	// Re-pushing a tag leaves the manifest it used to point at behind, so a run that
	// deleted no tags can still have overwritten versions to reclaim.
	const shouldCollect = deleted > 0 || sweepUnreachable;

	let gc: CleanupResult["gc"];
	if (!shouldCollect) {
		gc = { ok: true, output: "Skipped — nothing was deleted and no rule sweeps old versions.", skipped: true };
	} else if (!getFeatures().docker) {
		gc = { ok: true, output: "Skipped — Docker registry is disabled.", skipped: true };
	} else {
		const gcResult = await runGarbageCollection(false, sweepUnreachable);
		gc = { ok: gcResult.ok, output: gcResult.output };
		if (!gcResult.ok) {
			console.error("[cleanup] Post-cleanup garbage collection failed:", gcResult.output);
		}
	}

	return { deleted, repos: reposProcessed, gc };
}
