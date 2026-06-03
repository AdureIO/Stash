import { spawnSync } from "child_process";
import { resolve } from "path";

const UPDATE_TIMEOUT_MS = 600_000;

export type TrivyUpdateResult = {
	ok: boolean;
	stdout: string;
	stderr: string;
	error?: string;
};

/** Refresh Trivy binary (when TRIVY_VERSION changes) and vulnerability DBs on /data. */
export function runTrivyUpdate(): TrivyUpdateResult {
	const script = resolve(process.cwd(), "scripts/trivy-install.sh");
	const result = spawnSync("sh", [script, "update"], {
		env: {
			...process.env,
			DATA: process.env.DATA ?? "/data",
		},
		encoding: "utf8",
		timeout: UPDATE_TIMEOUT_MS,
	});

	const stdout = (result.stdout || "").trim();
	const stderr = (result.stderr || "").trim();

	if (result.error) {
		return {
			ok: false,
			stdout,
			stderr,
			error: result.error.message,
		};
	}

	if (result.status !== 0) {
		return {
			ok: false,
			stdout,
			stderr,
			error: stderr || stdout || `exit ${result.status ?? "unknown"}`,
		};
	}

	return { ok: true, stdout, stderr };
}
