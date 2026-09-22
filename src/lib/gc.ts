import { existsSync } from "fs";
import { execSync } from "child_process";
import { db } from "./db";
import { regenerateConfig } from "./registry-config";
import { findBrokenTags, listRepositories } from "./registry";
import { getBlobsRoots, getRepositoriesRoots, runStashGarbageCollection } from "./registry-layout";

const SUPERVISOR_CONF = "/tmp/supervisord.conf";
const REGISTRY_CONFIG = "/data/registry.yml";

export interface GcResult {
	ok: boolean;
	output: string;
	dryRun: boolean;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function supervisorctl(cmd: string): { ok: boolean; output: string } {
	try {
		const output = execSync(`supervisorctl -c ${SUPERVISOR_CONF} ${cmd}`, {
			encoding: "utf8",
			timeout: 15_000,
			stdio: ["pipe", "pipe", "pipe"],
		});
		return { ok: true, output: output.trim() };
	} catch (err) {
		const e = err as { stdout?: string; stderr?: string; message?: string };
		const output = [e.stdout, e.stderr, e.message].filter(Boolean).join("\n").trim();
		return { ok: false, output };
	}
}

export async function runGarbageCollection(dryRun = false, deleteUntagged = false): Promise<GcResult> {
	if (!existsSync(REGISTRY_CONFIG)) {
		return {
			ok: false,
			output: `${REGISTRY_CONFIG} not found. Enable Docker registry (ENABLE_DOCKER=true) and restart Stash.`,
			dryRun,
		};
	}

	if (getRepositoriesRoots().length === 0 || getBlobsRoots().length === 0) {
		return {
			ok: false,
			output: "No registry storage layout found under /data/registry.",
			dryRun,
		};
	}

	const wasReadonly = db.settings.get("REGISTRY_READONLY") === "true";
	const toggledReadonly = !wasReadonly;

	try {
		regenerateConfig(true);
		await sleep(2000);

		const status = supervisorctl("status registry");
		if (!status.ok || !status.output.includes("RUNNING")) {
			return {
				ok: false,
				output: [
					"Could not confirm the registry restarted in read-only mode.",
					"Garbage collection requires the registry to reject writes during the sweep.",
					status.output,
				].join("\n\n"),
				dryRun,
			};
		}

		const gc = runStashGarbageCollection(dryRun, deleteUntagged);
		if (!gc.ok) {
			return { ok: false, output: gc.output, dryRun };
		}

		// Reported, never deleted: a tag that stops resolving is the symptom of a problem
		// elsewhere, and removing it destroys the only record of what the tag pointed at.
		let output = gc.output;
		if (!dryRun) {
			const broken: string[] = [];
			for (const repo of await listRepositories()) {
				broken.push(...(await findBrokenTags(repo)).map((tag) => `${repo}:${tag}`));
			}
			if (broken.length > 0) {
				output += [
					``,
					``,
					`${broken.length} tag(s) no longer resolve to a manifest: ${broken.join(", ")}`,
					`They were left in place — nothing was deleted on their behalf.`,
				].join("\n");
			}
		}

		return { ok: true, output, dryRun };
	} finally {
		if (toggledReadonly) {
			try {
				regenerateConfig(false);
			} catch (e) {
				console.error("[gc] Failed to restore registry write mode:", e);
			}
		}
	}
}
