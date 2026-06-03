// Trivy vulnerability scanner integration
// Uses spawnSync with separate args — never interpolates user input into shell strings
import { randomBytes } from "crypto";
import { spawnSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "fs";
import { resolve } from "path";
import { join } from "path";

// Trivy 0.71 defaults to mirror.gcr.io first, which often fails with UNAUTHORIZED without fallback
const DEFAULT_DB_REPOSITORY = "public.ecr.aws/aquasecurity/trivy-db:2,ghcr.io/aquasecurity/trivy-db:2";
const DEFAULT_JAVA_DB_REPOSITORY = "public.ecr.aws/aquasecurity/trivy-java-db:1,ghcr.io/aquasecurity/trivy-java-db:1";
const DEFAULT_CACHE_DIR = "/data/trivy/cache";
const DEFAULT_MODULE_DIR = "/data/trivy/modules";
const SCAN_TIMEOUT_MS = 300_000;
const STDERR_MAX_BUFFER = 8 * 1024 * 1024;
const STDOUT_MAX_BUFFER = 512 * 1024 * 1024;
const REPORT_WAIT_MS = 8_000;

function trivyEnv(): NodeJS.ProcessEnv {
	return {
		...process.env,
		TRIVY_INSECURE: "true",
		TRIVY_LOG_LEVEL: process.env.TRIVY_LOG_LEVEL ?? "error",
		TRIVY_CACHE_DIR: process.env.TRIVY_CACHE_DIR ?? DEFAULT_CACHE_DIR,
		TRIVY_MODULE_DIR: process.env.TRIVY_MODULE_DIR ?? DEFAULT_MODULE_DIR,
		TRIVY_DB_REPOSITORY: process.env.TRIVY_DB_REPOSITORY ?? DEFAULT_DB_REPOSITORY,
		TRIVY_JAVA_DB_REPOSITORY: process.env.TRIVY_JAVA_DB_REPOSITORY ?? DEFAULT_JAVA_DB_REPOSITORY,
	};
}

export interface Vulnerability {
	VulnerabilityID: string;
	PkgName: string;
	InstalledVersion: string;
	FixedVersion?: string;
	Severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
	Title?: string;
}

export interface TrivyReport {
	SchemaVersion?: number;
	Results?: { Vulnerabilities?: Vulnerability[] | null }[];
}

export interface ScanSummary {
	critical: number;
	high: number;
	medium: number;
	low: number;
	unknown: number;
	vulns: Vulnerability[];
}

function normalizeReportText(raw: string): string {
	return raw.replace(/^\uFEFF/, "").trim();
}

function looksLikeCompleteJson(raw: string): boolean {
	const t = normalizeReportText(raw);
	return t.length > 0 && (t.endsWith("}") || t.endsWith("]"));
}

export function parseTrivyReport(raw: string): TrivyReport {
	const trimmed = normalizeReportText(raw);
	if (!trimmed) throw new Error("trivy returned empty report");
	if (!looksLikeCompleteJson(trimmed)) {
		throw new Error(
			`trivy report appears truncated (${trimmed.length} bytes) — scan may have timed out or been killed`,
		);
	}

	try {
		return JSON.parse(trimmed) as TrivyReport;
	} catch (first) {
		const start = trimmed.indexOf("{");
		const end = trimmed.lastIndexOf("}");
		if (start >= 0 && end > start) {
			try {
				return JSON.parse(trimmed.slice(start, end + 1)) as TrivyReport;
			} catch {
				/* fall through */
			}
		}
		const reason = first instanceof Error ? first.message : "parse error";
		throw new Error(`trivy returned invalid JSON (${reason}, ${trimmed.length} bytes): ${trimmed.slice(0, 200)}`);
	}
}

export function extractVulnerabilities(report: TrivyReport): Vulnerability[] {
	return report.Results?.flatMap((r) => (Array.isArray(r.Vulnerabilities) ? r.Vulnerabilities : [])) ?? [];
}

function countSeverities(vulns: Vulnerability[]): Omit<ScanSummary, "vulns"> {
	const counts = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
	for (const v of vulns) {
		const key = (v.Severity || "UNKNOWN").toLowerCase() as keyof typeof counts;
		counts[key] = (counts[key] ?? 0) + 1;
	}
	return counts;
}

function trivyExitOk(status: number | null): boolean {
	return status === 0 || status === 1;
}

function sleepMs(ms: number): void {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		/* busy wait — short poll between stat checks */
	}
}

function uniqueReportPath(reportDir: string): string {
	const id = randomBytes(6).toString("hex");
	return resolve(reportDir, `scan-${Date.now()}-${process.pid}-${id}.json`);
}

function readReportFile(reportPath: string, maxWaitMs = REPORT_WAIT_MS): string | null {
	const deadline = Date.now() + maxWaitMs;
	while (Date.now() < deadline) {
		try {
			if (existsSync(reportPath)) {
				const size = statSync(reportPath).size;
				if (size > 0) return readFileSync(reportPath, "utf8");
			}
		} catch {
			/* retry */
		}
		sleepMs(100);
	}
	return null;
}

type TrivyRun = {
	status: number | null;
	stderr: string;
	spawnError?: Error;
};

function runTrivy(args: string[], captureStdout: boolean): TrivyRun & { stdout?: string } {
	const result = spawnSync("trivy", args, {
		timeout: SCAN_TIMEOUT_MS,
		env: trivyEnv(),
		shell: false,
		stdio: captureStdout ? ["ignore", "pipe", "pipe"] : ["ignore", "ignore", "pipe"],
		encoding: "utf8",
		maxBuffer: captureStdout ? STDOUT_MAX_BUFFER : STDERR_MAX_BUFFER,
	});

	return {
		status: result.status,
		stderr: (result.stderr || "").trim(),
		stdout: captureStdout ? (result.stdout || "").trim() : undefined,
		spawnError: result.error,
	};
}

function skipDbUpdateArgs(): string[] {
	// Entrypoint pre-downloads vuln + Java DBs to /data; skipping avoids flaky runtime OCI pulls.
	if (process.env.TRIVY_SKIP_DB_UPDATE === "true") {
		return ["--skip-db-update", "--skip-java-db-update"];
	}
	return [];
}

function baseArgs(registryToken?: string): string[] {
	const args = [
		"image",
		"--scanners",
		"vuln",
		"--format",
		"json",
		"--quiet",
		"--no-progress",
		"--insecure",
		...skipDbUpdateArgs(),
	];
	if (registryToken) args.push("--registry-token", registryToken);
	return args;
}

function throwScanFailure(status: number | null, stderr: string, extra?: string): never {
	const parts = [`trivy scan failed: exit code ${status ?? "unknown"}`];
	if (extra) parts.push(extra);
	const errLine = stderr.split("\n").find((l) => /error|fatal|failed/i.test(l)) || stderr.slice(0, 400);
	if (errLine) parts.push(errLine);
	throw new Error(parts.join(" — "));
}

function handleSpawnError(err: Error): never {
	const msg = err.message;
	if (msg.includes("ENOENT"))
		throw new Error("Trivy is not installed — wait for first-boot download or check /data/trivy");
	if (msg.includes("ETIMEDOUT") || msg.includes("timed out")) {
		throw new Error(`trivy scan timed out after ${SCAN_TIMEOUT_MS / 1000}s`);
	}
	if (msg.includes("maxBuffer")) throw new Error("trivy stderr output exceeded buffer limit");
	throw new Error(`trivy exec failed: ${msg}`);
}

function scanToFile(image: string, reportPath: string, registryToken?: string): TrivyRun {
	const args = [...baseArgs(registryToken), "--output", reportPath, image];
	return runTrivy(args, false);
}

function scanToStdout(image: string, registryToken?: string): TrivyRun & { stdout: string } {
	const args = [...baseArgs(registryToken), image];
	const run = runTrivy(args, true);
	return { ...run, stdout: run.stdout ?? "" };
}

// Validate image reference — only allow safe characters
function validateImageRef(value: string, label: string): void {
	if (!/^[a-z0-9._:/@-]+$/i.test(value)) {
		throw new Error(`Invalid ${label}: contains disallowed characters`);
	}
	if (value.length > 256) throw new Error(`${label} too long`);
}

export async function scanFilesystem(targetPath: string): Promise<ScanSummary & { raw: string }> {
	const { enqueueScan } = await import("./scan-queue");
	return enqueueScan(() => scanFilesystemInner(targetPath));
}

export async function scanImage(
	registryUrl: string,
	repo: string,
	tag: string,
	registryToken?: string,
): Promise<ScanSummary & { raw: string }> {
	const { enqueueScan } = await import("./scan-queue");
	return enqueueScan(() => scanImageInner(registryUrl, repo, tag, registryToken));
}

function fsBaseArgs(): string[] {
	return ["fs", "--scanners", "vuln", "--format", "json", "--quiet", "--no-progress", ...skipDbUpdateArgs()];
}

async function scanFilesystemInner(targetPath: string): Promise<ScanSummary & { raw: string }> {
	const resolved = resolve(targetPath);
	if (!existsSync(resolved)) throw new Error("Scan target not found");
	if (resolved.includes("..")) throw new Error("Invalid scan path");

	const cacheDir = process.env.TRIVY_CACHE_DIR ?? DEFAULT_CACHE_DIR;
	const reportDir = resolve(cacheDir, "reports");
	mkdirSync(reportDir, { recursive: true });

	const reportPath = uniqueReportPath(reportDir);
	let raw: string | null = null;
	let lastRun: TrivyRun | null = null;

	const runFsToFile = (outPath: string) => {
		const args = [...fsBaseArgs(), "--output", outPath, resolved];
		return runTrivy(args, false);
	};

	try {
		lastRun = runFsToFile(reportPath);
		if (lastRun.spawnError) handleSpawnError(lastRun.spawnError);
		raw = readReportFile(reportPath);

		if (!raw) {
			const retryPath = uniqueReportPath(reportDir);
			try {
				lastRun = runFsToFile(retryPath);
				if (lastRun.spawnError) handleSpawnError(lastRun.spawnError);
				raw = readReportFile(retryPath);
			} finally {
				try {
					rmSync(retryPath, { force: true });
				} catch {
					/* ignore */
				}
			}
		}

		if (!raw) {
			const args = [...fsBaseArgs(), resolved];
			const stdoutRun = runTrivy(args, true);
			lastRun = stdoutRun;
			if (stdoutRun.spawnError) handleSpawnError(stdoutRun.spawnError);
			if (stdoutRun.stdout && looksLikeCompleteJson(stdoutRun.stdout)) raw = stdoutRun.stdout;
		}

		if (!raw) {
			if (!trivyExitOk(lastRun?.status ?? null)) {
				throwScanFailure(lastRun?.status ?? null, lastRun?.stderr ?? "", "no report file");
			}
			throw new Error(
				`trivy did not produce a report${lastRun?.stderr ? ` — ${lastRun.stderr.slice(0, 400)}` : ""}`,
			);
		}

		if (!trivyExitOk(lastRun?.status ?? null)) {
			const preview = normalizeReportText(raw).slice(0, 300);
			throwScanFailure(lastRun?.status ?? null, lastRun?.stderr ?? "", preview);
		}

		const parsed = parseTrivyReport(raw);
		const vulns = extractVulnerabilities(parsed);
		return { ...countSeverities(vulns), vulns, raw };
	} finally {
		try {
			rmSync(reportPath, { force: true });
		} catch {
			/* ignore */
		}
	}
}

async function scanImageInner(
	registryUrl: string,
	repo: string,
	tag: string,
	registryToken?: string,
): Promise<ScanSummary & { raw: string }> {
	validateImageRef(repo, "repository");
	validateImageRef(tag, "tag");

	const host = registryUrl.replace(/^https?:\/\//, "");
	validateImageRef(host, "registry host");

	const image = `${host}/${repo}:${tag}`;
	const cacheDir = process.env.TRIVY_CACHE_DIR ?? DEFAULT_CACHE_DIR;
	const reportDir = resolve(cacheDir, "reports");
	mkdirSync(reportDir, { recursive: true });

	const reportPath = uniqueReportPath(reportDir);
	let raw: string | null = null;
	let lastRun: TrivyRun | null = null;

	try {
		// 1) Prefer --output file (avoids huge stdout buffers). Poll until Trivy flushes the file.
		lastRun = scanToFile(image, reportPath, registryToken);
		if (lastRun.spawnError) handleSpawnError(lastRun.spawnError);
		raw = readReportFile(reportPath);

		// 2) One retry with a fresh path (occasional race when multiple scans run in parallel)
		if (!raw) {
			const retryPath = uniqueReportPath(reportDir);
			try {
				lastRun = scanToFile(image, retryPath, registryToken);
				if (lastRun.spawnError) handleSpawnError(lastRun.spawnError);
				raw = readReportFile(retryPath);
			} finally {
				try {
					rmSync(retryPath, { force: true });
				} catch {
					/* ignore */
				}
			}
		}

		// 3) Fallback: JSON on stdout (stderr capped separately so it cannot kill the process)
		if (!raw) {
			const stdoutRun = scanToStdout(image, registryToken);
			lastRun = stdoutRun;
			if (stdoutRun.spawnError) handleSpawnError(stdoutRun.spawnError);
			if (stdoutRun.stdout && looksLikeCompleteJson(stdoutRun.stdout)) {
				raw = stdoutRun.stdout;
			}
		}

		if (!raw) {
			if (!trivyExitOk(lastRun?.status ?? null)) {
				throwScanFailure(lastRun?.status ?? null, lastRun?.stderr ?? "", "no report file");
			}
			throw new Error(
				`trivy did not produce a report${lastRun?.stderr ? ` — ${lastRun.stderr.slice(0, 400)}` : ""}`,
			);
		}

		if (!trivyExitOk(lastRun?.status ?? null)) {
			const preview = normalizeReportText(raw).slice(0, 300);
			throwScanFailure(lastRun?.status ?? null, lastRun?.stderr ?? "", preview);
		}

		const parsed = parseTrivyReport(raw);
		const vulns = extractVulnerabilities(parsed);
		return { ...countSeverities(vulns), vulns, raw };
	} finally {
		try {
			rmSync(reportPath, { force: true });
		} catch {
			/* report may not exist */
		}
	}
}
