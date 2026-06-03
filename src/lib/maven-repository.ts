import { createHash } from "crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import path from "path";

export function resolveMavenPath(segments: string[], root: string): string | null {
	if (segments.some((s) => s.includes("..") || s.includes("\0"))) return null;
	const resolvedRoot = path.resolve(root);
	const resolved = path.resolve(resolvedRoot, ...segments);
	return resolved === resolvedRoot || resolved.startsWith(resolvedRoot + "/") ? resolved : null;
}

export function buildMavenMetadata(artifactDir: string, segments: string[]): string {
	const artifactId = segments[segments.length - 1];
	const groupId = segments.slice(0, -1).join(".");

	let versions: string[] = [];
	try {
		versions = readdirSync(artifactDir)
			.filter((f) => {
				try {
					return statSync(path.join(artifactDir, f)).isDirectory();
				} catch {
					return false;
				}
			})
			.sort();
	} catch {
		/* dir may not exist yet */
	}

	const release = [...versions].filter((v) => !v.includes("SNAPSHOT")).pop() ?? "";
	const latest = versions.at(-1) ?? "";
	const lastUpdated = new Date().toISOString().replace(/\D/g, "").slice(0, 14);

	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		"<metadata>",
		`  <groupId>${groupId}</groupId>`,
		`  <artifactId>${artifactId}</artifactId>`,
		"  <versioning>",
		`    <latest>${latest}</latest>`,
		`    <release>${release}</release>`,
		"    <versions>",
		...versions.map((v) => `      <version>${v}</version>`),
		"    </versions>",
		`    <lastUpdated>${lastUpdated}</lastUpdated>`,
		"  </versioning>",
		"</metadata>",
	].join("\n");
}

export function hashAlgo(algo: string): string {
	return algo === "sha1" ? "sha1" : algo === "md5" ? "md5" : algo.replace("-", "");
}

export function checksumBuffer(buf: Buffer, algo: string): string {
	return createHash(hashAlgo(algo)).update(buf).digest("hex");
}

export function checksumFile(filePath: string, algo: string): string {
	return checksumBuffer(readFileSync(filePath), algo);
}

const CHECKSUM_SUFFIX = /\.(md5|sha1|sha256|sha512)$/;

export type MavenGetResult =
	| { kind: "not-found" }
	| { kind: "forbidden" }
	| { kind: "checksum"; body: string }
	| { kind: "metadata"; body: string }
	| { kind: "file"; body: Buffer; contentLength: number };

/** Resolves a Maven repository GET (metadata, checksum sidecars, artifacts). */
export function resolveMavenGet(segments: string[], root: string): MavenGetResult {
	if (!segments.length) return { kind: "not-found" };

	const filePath = resolveMavenPath(segments, root);
	if (!filePath) return { kind: "forbidden" };

	const filename = segments.at(-1)!;
	const checksumMatch = filename.match(CHECKSUM_SUFFIX);

	if (checksumMatch) {
		const baseName = filename.slice(0, -checksumMatch[0].length);
		const algo = checksumMatch[1];
		const body = resolveChecksumBody(segments, root, filePath, baseName, algo);
		return body ? { kind: "checksum", body } : { kind: "not-found" };
	}

	if (filename === "maven-metadata.xml") {
		const body = resolveMetadataBody(filePath, segments, root);
		return { kind: "metadata", body };
	}

	if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
		return { kind: "not-found" };
	}

	const content = readFileSync(filePath);
	return { kind: "file", body: content, contentLength: content.length };
}

function resolveMetadataBody(filePath: string, segments: string[], root: string): string {
	if (existsSync(filePath) && statSync(filePath).isFile()) {
		return readFileSync(filePath, "utf-8");
	}
	const artifactDir = path.dirname(filePath);
	return buildMavenMetadata(artifactDir, segments.slice(0, -1));
}

function resolveChecksumBody(
	segments: string[],
	root: string,
	checksumPath: string,
	baseName: string,
	algo: string,
): string | null {
	if (baseName === "maven-metadata.xml") {
		const metadataPath = path.join(path.dirname(checksumPath), baseName);
		const metaSegments = [...segments.slice(0, -1), baseName];
		const body = resolveMetadataBody(metadataPath, metaSegments, root);
		return checksumBuffer(Buffer.from(body, "utf-8"), algo);
	}

	const baseFile = resolveMavenPath([...segments.slice(0, -1), baseName], root);
	if (!baseFile || !existsSync(baseFile) || statSync(baseFile).isDirectory()) {
		return null;
	}
	return checksumFile(baseFile, algo);
}
