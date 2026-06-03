// Trivy vulnerability scanner integration
// Uses spawn with separate args — never interpolates user input into shell strings
import { randomBytes } from "crypto";
import { spawn } from "child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

// Trivy 0.71 defaults to mirror.gcr.io first, which often fails with UNAUTHORIZED without fallback
const DEFAULT_DB_REPOSITORY = "public.ecr.aws/aquasecurity/trivy-db:2,ghcr.io/aquasecurity/trivy-db:2";
const DEFAULT_JAVA_DB_REPOSITORY = "public.ecr.aws/aquasecurity/trivy-java-db:1,ghcr.io/aquasecurity/trivy-java-db:1";
const SCAN_TIMEOUT_MS = 300_000;
const REPORT_WAIT_MS = 8_000;

function resolveTrivyBin(): string {
	if (process.env.TRIVY_BIN && existsSync(process.env.TRIVY_BIN)) return process.env.TRIVY_BIN;
	const root = process.env.TRIVY_ROOT || join(process.env.DATA || "/data", "trivy");
	const candidate = join(root, "bin/trivy");
	if (existsSync(candidate)) return candidate;
	return "trivy";
}

function resolveCacheDir(): string {
	if (process.env.TRIVY_CACHE_DIR) return process.env.TRIVY_CACHE_DIR;
	const preferred = join(process.env.DATA || "/data", "trivy/cache");
	try {
		mkdirSync(preferred, { recursive: true });
		return preferred;
	} catch {
		const fallback = join(tmpdir(), "stash-trivy-cache");
		mkdirSync(fallback, { recursive: true });
		return fallback;
	}
}

function resolveModuleDir(): string {
	if (process.env.TRIVY_MODULE_DIR) return process.env.TRIVY_MODULE_DIR;
	return join(process.env.DATA || "/data", "trivy/modules");
}

function trivyEnv(): NodeJS.ProcessEnv {
	const cacheDir = resolveCacheDir();
	return {
		...process.env,
		TRIVY_INSECURE: "true",
		TRIVY_LOG_LEVEL: process.env.TRIVY_LOG_LEVEL ?? "error",
		TRIVY_CACHE_DIR: cacheDir,
		TRIVY_MODULE_DIR: resolveModuleDir(),
		TRIVY_DB_REPOSITORY: process.env.TRIVY_DB_REPOSITORY ?? DEFAULT_DB_REPOSITORY,
		TRIVY_JAVA_DB_REPOSITORY: process.env.TRIVY_JAVA_DB_REPOSITORY ?? DEFAULT_JAVA_DB_REPOSITORY,
		PATH: process.env.PATH,
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

function uniqueReportPath(reportDir: string): string {
	const id = randomBytes(6).toString("hex");
	return resolve(reportDir, `scan-${Date.now()}-${process.pid}-${id}.json`);
}

async function waitMs(ms: number): Promise<void> {
	await new Promise((r) => setTimeout(r, ms));
}

async function readReportFile(reportPath: string, maxWaitMs = REPORT_WAIT_MS): Promise<string | null> {
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
		await waitMs(100);
	}
	return null;
}

type TrivyRun = {
	status: number | null;
	signal: NodeJS.Signals | null;
};

/** Run Trivy without piping stdio — piping can hit maxBuffer and SIGKILL Trivy mid-scan. */
async function runTrivy(args: string[]): Promise<TrivyRun> {
	const bin = resolveTrivyBin();
	return new Promise((resolve, reject) => {
		const child = spawn(bin, args, {
			env: trivyEnv(),
			shell: false,
			stdio: "ignore",
		});

		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill("SIGTERM");
			setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
		}, SCAN_TIMEOUT_MS);

		child.on("error", (err) => {
			clearTimeout(timer);
			reject(err);
		});

		child.on("close", (status, signal) => {
			clearTimeout(timer);
			if (timedOut && status === null) {
				reject(new Error(`trivy scan timed out after ${SCAN_TIMEOUT_MS / 1000}s`));
				return;
			}
			resolve({ status: signal ? null : status, signal: signal ?? null });
		});
	});
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

function throwScanFailure(status: number | null, signal: NodeJS.Signals | null, extra?: string): never {
	const parts = [`trivy scan failed: exit code ${status ?? "unknown"}`];
	if (signal) parts.push(`signal ${signal}`);
	if (extra) parts.push(extra);
	throw new Error(parts.join(" — "));
}

function handleSpawnError(err: Error): never {
	const msg = err.message;
	if (msg.includes("ENOENT"))
		throw new Error("Trivy is not installed — wait for first-boot download or check /data/trivy");
	if (msg.includes("ETIMEDOUT") || msg.includes("timed out")) {
		throw new Error(`trivy scan timed out after ${SCAN_TIMEOUT_MS / 1000}s`);
	}
	throw new Error(`trivy exec failed: ${msg}`);
}

async function scanToFile(args: string[], reportPath: string): Promise<TrivyRun> {
	return runTrivy([...args, "--output", reportPath]);
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

/** Run a registry image scan without queueing (caller manages concurrency). */
export async function scanImageDirect(
	registryUrl: string,
	repo: string,
	tag: string,
	registryToken?: string,
): Promise<ScanSummary & { raw: string }> {
	return scanImageInner(registryUrl, repo, tag, registryToken);
}

function fsBaseArgs(): string[] {
	return ["fs", "--scanners", "vuln", "--format", "json", "--quiet", "--no-progress", ...skipDbUpdateArgs()];
}

async function runScanToReportFile(
	baseScanArgs: string[],
	targetArg: string,
	reportDir: string,
): Promise<{ raw: string; lastRun: TrivyRun }> {
	const paths = [uniqueReportPath(reportDir), uniqueReportPath(reportDir), uniqueReportPath(reportDir)];
	let lastRun: TrivyRun = { status: null, signal: null };
	let raw: string | null = null;

	for (const reportPath of paths) {
		try {
			lastRun = await scanToFile([...baseScanArgs, targetArg], reportPath);
			raw = await readReportFile(reportPath);
			if (raw) return { raw, lastRun };
		} catch (e) {
			if (e instanceof Error && e.message.includes("ENOENT")) handleSpawnError(e);
			throw e;
		} finally {
			try {
				rmSync(reportPath, { force: true });
			} catch {
				/* ignore */
			}
		}
	}

	if (!raw) {
		if (!trivyExitOk(lastRun.status)) {
			throwScanFailure(lastRun.status, lastRun.signal, "no report file after retries");
		}
		throw new Error("trivy did not produce a report file after retries");
	}

	return { raw, lastRun };
}

async function scanFilesystemInner(targetPath: string): Promise<ScanSummary & { raw: string }> {
	const resolved = resolve(targetPath);
	if (!existsSync(resolved)) throw new Error("Scan target not found");
	if (resolved.includes("..")) throw new Error("Invalid scan path");

	const reportDir = resolve(resolveCacheDir(), "reports");
	mkdirSync(reportDir, { recursive: true });

	const { raw, lastRun } = await runScanToReportFile(fsBaseArgs(), resolved, reportDir);

	if (!trivyExitOk(lastRun.status)) {
		const preview = normalizeReportText(raw).slice(0, 300);
		throwScanFailure(lastRun.status, lastRun.signal, preview);
	}

	const parsed = parseTrivyReport(raw);
	const vulns = extractVulnerabilities(parsed);
	return { ...countSeverities(vulns), vulns, raw };
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

	const image = tag.startsWith("sha256:") ? `${host}/${repo}@${tag}` : `${host}/${repo}:${tag}`;
	const reportDir = resolve(resolveCacheDir(), "reports");
	mkdirSync(reportDir, { recursive: true });

	const bin = resolveTrivyBin();
	console.info(`[trivy] scanning ${image} via ${bin}`);

	let raw: string;
	let lastRun: TrivyRun;
	try {
		({ raw, lastRun } = await runScanToReportFile(baseArgs(registryToken), image, reportDir));
	} catch (e) {
		console.error(`[trivy] scan failed for ${image}:`, e);
		if (e instanceof Error && e.message.includes("ENOENT")) handleSpawnError(e);
		throw e;
	}

	if (!trivyExitOk(lastRun.status)) {
		const preview = normalizeReportText(raw).slice(0, 300);
		throwScanFailure(lastRun.status, lastRun.signal, preview);
	}

	const parsed = parseTrivyReport(raw);
	const vulns = extractVulnerabilities(parsed);
	console.info(`[trivy] scan complete for ${image}: ${vulns.length} vulnerabilities`);
	return { ...countSeverities(vulns), vulns, raw };
}
