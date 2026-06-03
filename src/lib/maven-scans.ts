import { db } from "@/lib/db";
import type { ScanInfo } from "@/app/(panel)/repositories/[name]/scan-status-badge";
import { mavenScanRepository } from "./maven-utils";

export { mavenScanRepository } from "./maven-utils";

export function toScanInfo(row: {
	status: string;
	critical: number;
	high: number;
	medium: number;
	low: number;
	scanned_at: string;
}): ScanInfo {
	return {
		status: row.status,
		critical: row.critical,
		high: row.high,
		medium: row.medium,
		low: row.low,
		scanned_at: row.scanned_at,
	};
}

export function buildScansByVersion(groupId: string, artifactId: string, versions: string[]): Record<string, ScanInfo> {
	const repo = mavenScanRepository(groupId, artifactId);
	const all = db.scans.findByRepository(repo, 200);
	const byVersion: Record<string, ScanInfo> = {};
	for (const version of versions) {
		const latest = all.filter((s) => s.tag === version).sort((a, b) => b.scanned_at.localeCompare(a.scanned_at))[0];
		if (latest) byVersion[version] = toScanInfo(latest);
	}
	return byVersion;
}

export function latestVersionScan(
	groupId: string,
	artifactId: string,
	versions: string[],
): { latestVersion: string | null; latestScan: ScanInfo | null } {
	const latestVersion = versions.at(-1) ?? null;
	if (!latestVersion) return { latestVersion: null, latestScan: null };
	const byVersion = buildScansByVersion(groupId, artifactId, versions);
	return { latestVersion, latestScan: byVersion[latestVersion] ?? null };
}
