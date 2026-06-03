export interface MavenArtifactSummary {
	groupId: string;
	artifactId: string;
	versions: string[];
	size: number;
	lastModified: string | null;
}

export interface MavenFileChecksums {
	md5: string;
	sha1: string;
	sha256: string;
}

export interface MavenFileInfo {
	name: string;
	size: number;
	modified: string;
	extension: string;
	kind: string;
	checksums?: MavenFileChecksums;
}

export interface MavenVersionDetail {
	version: string;
	size: number;
	modified: string | null;
	files: MavenFileInfo[];
}

export interface MavenArtifactDetail {
	groupId: string;
	artifactId: string;
	versions: MavenVersionDetail[];
	size: number;
	firstPublished: string | null;
	releaseCount: number;
	snapshotCount: number;
}

const CHECKSUM_FILE = /\.(md5|sha1|sha256|sha512)$/i;

export function isMavenChecksumFile(name: string): boolean {
	return CHECKSUM_FILE.test(name);
}

/** Human-readable file kind for UI badges. */
export function mavenFileKind(filename: string): string {
	const lower = filename.toLowerCase();
	if (lower.endsWith(".pom")) return "pom";
	if (lower.endsWith(".war")) return "war";
	if (lower.endsWith(".aar")) return "aar";
	if (lower.endsWith(".module")) return "module";
	if (lower.endsWith("-sources.jar") || lower.includes("-sources.")) return "sources";
	if (lower.endsWith("-javadoc.jar") || lower.includes("-javadoc.")) return "javadoc";
	if (lower.endsWith(".jar")) return "jar";
	if (lower === "maven-metadata.xml") return "metadata";
	return "file";
}

export function mavenArtifactCoords(groupId: string, artifactId: string): string {
	return `${groupId}:${artifactId}`;
}

/** Stable scan_results.repository key for a Maven artifact. */
export function mavenScanRepository(groupId: string, artifactId: string): string {
	return `maven:${mavenArtifactCoords(groupId, artifactId)}`;
}

export function mavenScanApiPath(coords: string, version: string): string {
	return `/api/admin/scan/maven/${encodeURIComponent(coords)}/${encodeURIComponent(version)}`;
}

export function parseMavenArtifactCoords(coords: string): { groupId: string; artifactId: string } | null {
	const decoded = decodeURIComponent(coords);
	const idx = decoded.indexOf(":");
	if (idx <= 0 || idx === decoded.length - 1) return null;
	return { groupId: decoded.slice(0, idx), artifactId: decoded.slice(idx + 1) };
}

export function groupIdToSegments(groupId: string): string[] {
	return groupId.split(".");
}

export function mavenRepositoryPath(groupId: string, artifactId: string, version?: string, filename?: string): string {
	const segments = [...groupIdToSegments(groupId), artifactId];
	if (version) segments.push(version);
	if (filename) segments.push(filename);
	return segments.join("/");
}
