import { existsSync, readdirSync, statSync } from "fs";
import path from "path";
import { checksumFile } from "./maven-repository";
import type { MavenArtifactDetail, MavenArtifactSummary, MavenFileInfo, MavenVersionDetail } from "./maven-utils";
import { groupIdToSegments, isMavenChecksumFile, mavenFileKind } from "./maven-utils";

export type { MavenArtifactDetail, MavenArtifactSummary, MavenFileInfo, MavenVersionDetail } from "./maven-utils";
export { mavenArtifactCoords, parseMavenArtifactCoords, mavenRepositoryPath } from "./maven-utils";

export const MAVEN_ROOT = process.env.MAVEN_ROOT || "/data/maven";

const ARTIFACT_EXTENSIONS = new Set([".jar", ".pom", ".war", ".aar", ".module"]);

export function artifactDir(groupId: string, artifactId: string): string {
	return path.join(MAVEN_ROOT, ...groupIdToSegments(groupId), artifactId);
}

export function versionDir(groupId: string, artifactId: string, version: string): string {
	return path.join(artifactDir(groupId, artifactId), version);
}

/** Primary binary to scan (main jar/war, not sources/javadoc). */
export function resolvePrimaryArtifactFile(groupId: string, artifactId: string, version: string): string | null {
	const dir = versionDir(groupId, artifactId, version);
	if (!existsSync(dir)) return null;

	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return null;
	}

	const candidates = entries
		.filter((name) => {
			if (isMavenChecksumFile(name)) return false;
			const lower = name.toLowerCase();
			return (
				(lower.endsWith(".jar") || lower.endsWith(".war") || lower.endsWith(".aar")) &&
				!lower.includes("-sources") &&
				!lower.includes("-javadoc")
			);
		})
		.sort((a, b) => {
			const aMain = a.startsWith(`${artifactId}-${version}`) ? 0 : 1;
			const bMain = b.startsWith(`${artifactId}-${version}`) ? 0 : 1;
			return aMain - bMain || a.localeCompare(b);
		});

	const pick = candidates[0];
	return pick ? path.join(dir, pick) : null;
}

export function dirSize(dir: string): number {
	let total = 0;
	try {
		for (const f of readdirSync(dir)) {
			const full = path.join(dir, f);
			const s = statSync(full);
			total += s.isDirectory() ? dirSize(full) : s.size;
		}
	} catch {
		/* ignore */
	}
	return total;
}

function isVersionDir(dir: string, name: string): boolean {
	const full = path.join(dir, name);
	try {
		if (!statSync(full).isDirectory()) return false;
		return readdirSync(full).some((f) => ARTIFACT_EXTENSIONS.has(path.extname(f)));
	} catch {
		return false;
	}
}

function listVersionFiles(versionDir: string): MavenFileInfo[] {
	const files: MavenFileInfo[] = [];
	try {
		for (const name of readdirSync(versionDir)) {
			if (isMavenChecksumFile(name)) continue;
			const full = path.join(versionDir, name);
			try {
				const stat = statSync(full);
				if (!stat.isFile()) continue;
				const ext = path.extname(name);
				if (!ARTIFACT_EXTENSIONS.has(ext) && ext !== ".xml") continue;

				const kind = mavenFileKind(name);
				const shouldHash = ARTIFACT_EXTENSIONS.has(ext);
				files.push({
					name,
					size: stat.size,
					modified: stat.mtime.toISOString(),
					extension: ext || "(none)",
					kind,
					checksums: shouldHash
						? {
								md5: checksumFile(full, "md5"),
								sha1: checksumFile(full, "sha1"),
								sha256: checksumFile(full, "sha256"),
							}
						: undefined,
				});
			} catch {
				/* skip */
			}
		}
	} catch {
		/* ignore */
	}
	return files.sort((a, b) => a.name.localeCompare(b.name));
}

function scanArtifacts(root: string): MavenArtifactSummary[] {
	const artifacts: MavenArtifactSummary[] = [];
	if (!existsSync(root)) return artifacts;

	function walk(dir: string, segments: string[]) {
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			return;
		}

		const versionDirs = entries.filter((e) => isVersionDir(dir, e));

		if (versionDirs.length > 0 && segments.length >= 2) {
			const artifactId = segments.at(-1)!;
			const groupId = segments.slice(0, -1).join(".");
			const sortedVersions = versionDirs.sort();
			let lastModified: string | null = null;
			for (const v of sortedVersions) {
				try {
					const m = statSync(path.join(dir, v)).mtime.toISOString();
					if (!lastModified || m > lastModified) lastModified = m;
				} catch {
					/* skip */
				}
			}
			artifacts.push({
				groupId,
				artifactId,
				versions: sortedVersions,
				size: dirSize(dir),
				lastModified,
			});
			return;
		}

		for (const e of entries) {
			const full = path.join(dir, e);
			try {
				if (statSync(full).isDirectory()) walk(full, [...segments, e]);
			} catch {
				/* ignore */
			}
		}
	}

	walk(root, []);
	return artifacts.sort((a, b) => `${a.groupId}:${a.artifactId}`.localeCompare(`${b.groupId}:${b.artifactId}`));
}

export function listMavenArtifacts(): MavenArtifactSummary[] {
	return scanArtifacts(MAVEN_ROOT);
}

export function getMavenArtifactDetail(groupId: string, artifactId: string): MavenArtifactDetail | null {
	const dir = artifactDir(groupId, artifactId);
	if (!existsSync(dir)) return null;

	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return null;
	}

	const versionDirs = entries.filter((e) => isVersionDir(dir, e)).sort();
	if (versionDirs.length === 0) return null;

	const versions: MavenVersionDetail[] = versionDirs.map((version) => {
		const versionDir = path.join(dir, version);
		const files = listVersionFiles(versionDir);
		const modified =
			files.length > 0
				? files.reduce((latest, f) => (f.modified > latest ? f.modified : latest), files[0].modified)
				: null;
		return {
			version,
			size: dirSize(versionDir),
			modified,
			files,
		};
	});

	const allModified = versions.flatMap((v) => v.files.map((f) => f.modified));
	const firstPublished =
		allModified.length > 0
			? allModified.reduce((earliest, m) => (m < earliest ? m : earliest), allModified[0])
			: null;

	const snapshotCount = versions.filter((v) => v.version.includes("SNAPSHOT")).length;
	const releaseCount = versions.length - snapshotCount;

	return {
		groupId,
		artifactId,
		versions,
		size: dirSize(dir),
		firstPublished,
		releaseCount,
		snapshotCount,
	};
}
