import { existsSync } from "fs";
import { execSync, spawnSync } from "child_process";
import { db } from "./db";
import { regenerateConfig, registryCliEnv } from "./registry-config";

const SUPERVISOR_CONF = "/tmp/supervisord.conf";
const REGISTRY_BIN = "/usr/local/bin/registry";
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

function runRegistryGc(args: string[]): { ok: boolean; output: string; code: number | null } {
	const result = spawnSync(REGISTRY_BIN, ["garbage-collect", ...args, REGISTRY_CONFIG], {
		encoding: "utf8",
		timeout: 300_000,
		env: registryCliEnv(),
	});
	const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
	return { ok: result.status === 0, output, code: result.status };
}

export async function runGarbageCollection(dryRun = false): Promise<GcResult> {
	const gcArgs = dryRun ? ["--dry-run"] : ["--delete-untagged"];

	if (!existsSync(REGISTRY_BIN)) {
		return {
			ok: false,
			output: `Registry binary not found at ${REGISTRY_BIN}. Docker registry is only available inside the Stash container.`,
			dryRun,
		};
	}
	if (!existsSync(REGISTRY_CONFIG)) {
		return {
			ok: false,
			output: `${REGISTRY_CONFIG} not found. Enable Docker registry (ENABLE_DOCKER=true) and restart Stash.`,
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

		const gc = runRegistryGc(gcArgs);
		if (!gc.ok) {
			return {
				ok: false,
				output:
					gc.output ||
					`registry garbage-collect exited with code ${gc.code ?? "unknown"}. No additional output.`,
				dryRun,
			};
		}

		return {
			ok: true,
			output: gc.output || "Garbage collection completed successfully.",
			dryRun,
		};
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
