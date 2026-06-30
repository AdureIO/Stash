// Shared cleanup logic — used by both the API (manual run) and cron (scheduled)
import { db } from "./db";
import { listRepositories, listTags, getManifest, getImageConfig, deleteTag } from "./registry";
import { matchesPattern } from "./utils";
import { getFeatures } from "./features";
import { runGarbageCollection } from "./gc";

export interface CleanupResult {
	deleted: number;
	repos: number;
	gc?: { ok: boolean; output: string; skipped?: boolean };
}

export async function runCleanup(ruleId?: number): Promise<CleanupResult> {
	const rules = ruleId ? [db.cleanup.findById(ruleId)].filter(Boolean) : db.cleanup.findActive();

	const repos = await listRepositories();
	let deleted = 0;
	let reposProcessed = 0;

	for (const rule of rules) {
		if (!rule) continue;
		const matchingRepos = repos.filter((r) => matchesPattern(rule.repository_pattern, r));

		for (const repo of matchingRepos) {
			reposProcessed++;
			const tags = await listTags(repo);
			const tagDetails: { tag: string; digest: string; created: string | null }[] = [];

			for (const tag of tags) {
				const m = await getManifest(repo, tag);
				if (!m) continue;
				const cfg = await getImageConfig(repo, m.manifest.config.digest);
				tagDetails.push({ tag, digest: m.digest, created: cfg?.created ?? null });
			}

			tagDetails.sort((a, b) => {
				if (!a.created && !b.created) return 0;
				if (!a.created) return 1;
				if (!b.created) return -1;
				return new Date(b.created).getTime() - new Date(a.created).getTime();
			});

			const toDelete = new Set<string>();
			if (rule.keep_last_n != null) tagDetails.slice(rule.keep_last_n).forEach((t) => toDelete.add(t.tag));
			if (rule.max_age_days != null) {
				const cutoff = Date.now() - rule.max_age_days * 86400000;
				tagDetails.forEach((t) => {
					if (t.created && new Date(t.created).getTime() < cutoff) toDelete.add(t.tag);
				});
			}

			for (const tag of toDelete) {
				if (await deleteTag(repo, tag)) deleted++;
			}
		}

		db.cleanup.update(rule.id, { last_run: new Date().toISOString(), last_deleted: deleted });
	}

	let gc: CleanupResult["gc"];
	if (deleted > 0 && getFeatures().docker) {
		const gcResult = await runGarbageCollection(false);
		gc = { ok: gcResult.ok, output: gcResult.output };
		if (!gcResult.ok) {
			console.error("[cleanup] Post-cleanup garbage collection failed:", gcResult.output);
		}
	} else if (deleted > 0) {
		gc = { ok: true, output: "Skipped — Docker registry is disabled.", skipped: true };
	} else {
		gc = { ok: true, output: "Skipped — no tags were deleted.", skipped: true };
	}

	return { deleted, repos: reposProcessed, gc };
}
