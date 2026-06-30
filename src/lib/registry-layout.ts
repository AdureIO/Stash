import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "fs";
import path from "path";

const REGISTRY_DATA_ROOT = process.env.REGISTRY_DATA_ROOT || "/data/registry";

export function getRepositoriesRoots(): string[] {
	return [
		path.join(REGISTRY_DATA_ROOT, "docker", "registry", "v2", "repositories"),
		path.join(REGISTRY_DATA_ROOT, "repositories"),
	].filter((root, index, arr) => arr.indexOf(root) === index && existsSync(root));
}

export function getBlobsRoots(): string[] {
	return [
		path.join(REGISTRY_DATA_ROOT, "docker", "registry", "v2", "blobs"),
		path.join(REGISTRY_DATA_ROOT, "blobs"),
	].filter((root, index, arr) => arr.indexOf(root) === index && existsSync(root));
}

export function normalizeDigest(digest: string): string {
	const trimmed = digest.trim();
	if (/^sha256:[a-f0-9]{64}$/i.test(trimmed)) return trimmed.toLowerCase();
	if (/^[a-f0-9]{64}$/i.test(trimmed)) return `sha256:${trimmed.toLowerCase()}`;
	return trimmed;
}

export function normalizeRepoPath(repo: string): string {
	return repo.replace(/^\/+|\/+$/g, "");
}

function readDirsSafe(dir: string): string[] {
	try {
		return readdirSync(dir).filter((entry) => {
			try {
				return statSync(path.join(dir, entry)).isDirectory();
			} catch {
				return false;
			}
		});
	} catch {
		return [];
	}
}

export function listRepositoriesFromFs(): string[] {
	const repos = new Set<string>();

	const walk = (dir: string, rel = "") => {
		const entries = readDirsSafe(dir);
		if (entries.includes("_manifests")) {
			if (rel) repos.add(rel);
			return;
		}
		for (const entry of entries) {
			if (entry.startsWith("_")) continue;
			const nextRel = rel ? `${rel}/${entry}` : entry;
			walk(path.join(dir, entry), nextRel);
		}
	};

	for (const root of getRepositoriesRoots()) walk(root);
	return Array.from(repos).sort();
}

export function listTagsFromFs(repo: string): string[] {
	const tags = new Set<string>();
	const repoPath = normalizeRepoPath(repo);

	for (const root of getRepositoriesRoots()) {
		const tagsDir = path.join(root, repoPath, "_manifests", "tags");
		for (const tag of readDirsSafe(tagsDir)) tags.add(tag);
	}

	return Array.from(tags).sort();
}

export function digestFromTagLink(repoPath: string, tag: string): string | null {
	for (const root of getRepositoriesRoots()) {
		const tagLinkPath = path.join(root, repoPath, "_manifests", "tags", tag, "current", "link");
		if (!existsSync(tagLinkPath)) continue;
		try {
			const content = readFileSync(tagLinkPath, "utf8").trim();
			if (/^(sha256:)?[a-f0-9]{64}$/i.test(content)) {
				return normalizeDigest(content);
			}
		} catch {
			/* try next root */
		}
	}
	return null;
}

export function blobDataPath(blobsRoot: string, digest: string): string | null {
	const normalized = normalizeDigest(digest);
	const match = normalized.match(/^sha256:([a-f0-9]{64})$/i);
	if (!match) return null;
	const hash = match[1];
	return path.join(blobsRoot, "sha256", hash.slice(0, 2), hash.slice(2), "data");
}

export function readJsonBlob(digest: string): Record<string, unknown> | null {
	for (const root of getBlobsRoots()) {
		const blobPath = blobDataPath(root, digest);
		if (!blobPath || !existsSync(blobPath)) continue;
		try {
			return JSON.parse(readFileSync(blobPath, "utf8")) as Record<string, unknown>;
		} catch {
			return null;
		}
	}
	return null;
}

function revisionLinkPath(repoPath: string, digest: string): string | null {
	const normalized = normalizeDigest(digest);
	const match = normalized.match(/^sha256:([a-f0-9]{64})$/i);
	if (!match) return null;
	const hash = match[1];
	for (const root of getRepositoriesRoots()) {
		const linkPath = path.join(
			root,
			repoPath,
			"_manifests",
			"revisions",
			"sha256",
			hash.slice(0, 2),
			hash.slice(2),
			"link",
		);
		if (existsSync(linkPath)) return linkPath;
	}
	return null;
}

function readManifestJsonFromRevision(repoPath: string, digest: string): Record<string, unknown> | null {
	const linkPath = revisionLinkPath(repoPath, digest);
	if (!linkPath) return null;
	try {
		const rel = readFileSync(linkPath, "utf8").trim();
		const manifestPath = path.resolve(path.dirname(linkPath), rel);
		if (!existsSync(manifestPath)) return null;
		return JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
	} catch {
		return null;
	}
}

export function readManifestBlob(repoPath: string, manifestDigest: string): Record<string, unknown> | null {
	const normalized = normalizeDigest(manifestDigest);
	return readJsonBlob(normalized) ?? readManifestJsonFromRevision(repoPath, normalized);
}

const MANIFEST_LIST_MEDIA_TYPES = new Set([
	"application/vnd.docker.distribution.manifest.list.v2+json",
	"application/vnd.oci.image.index.v1+json",
]);

function isManifestListBody(mediaType: string, body: Record<string, unknown>): boolean {
	if (MANIFEST_LIST_MEDIA_TYPES.has(mediaType)) return true;
	return Array.isArray(body.manifests) && !("config" in body);
}

interface ManifestDescriptor {
	digest: string;
}

function asManifestV2(
	body: Record<string, unknown>,
): { config: { digest: string }; layers: { digest: string }[] } | null {
	const config = body.config as { digest?: string } | undefined;
	const layers = body.layers as { digest: string }[] | undefined;
	if (!config?.digest || !Array.isArray(layers)) return null;
	return { config: { digest: config.digest }, layers };
}

/** All digests reachable from current tags (all repository roots, all manifest-list architectures). */
export function collectTaggedDigests(): Set<string> {
	const seen = new Set<string>();

	const mark = (repoPath: string, digest: string) => {
		const normalized = normalizeDigest(digest);
		if (seen.has(normalized)) return;
		seen.add(normalized);

		const body = readManifestBlob(repoPath, normalized);
		if (!body) return;

		const mediaType = typeof body.mediaType === "string" ? body.mediaType : "";
		if (isManifestListBody(mediaType, body)) {
			for (const child of body.manifests as ManifestDescriptor[]) {
				if (child?.digest) mark(repoPath, child.digest);
			}
			return;
		}

		const manifest = asManifestV2(body);
		if (!manifest) return;
		mark(repoPath, manifest.config.digest);
		for (const layer of manifest.layers) mark(repoPath, layer.digest);
	};

	for (const repo of listRepositoriesFromFs()) {
		const repoPath = normalizeRepoPath(repo);
		for (const tag of listTagsFromFs(repo)) {
			const digest = digestFromTagLink(repoPath, tag);
			if (digest) mark(repoPath, digest);
		}
	}

	return seen;
}

function forEachRepositoryPath(cb: (root: string, repoPath: string) => void) {
	const walk = (root: string, dir: string, rel = "") => {
		const entries = readDirsSafe(dir);
		if (entries.includes("_manifests")) {
			if (rel) cb(root, rel);
			return;
		}
		for (const entry of entries) {
			if (entry.startsWith("_")) continue;
			walk(root, path.join(dir, entry), rel ? `${rel}/${entry}` : entry);
		}
	};

	for (const root of getRepositoriesRoots()) walk(root, root);
}

function listRevisionDigests(root: string, repoPath: string): string[] {
	const revRoot = path.join(root, repoPath, "_manifests", "revisions", "sha256");
	const digests: string[] = [];
	for (const prefix of readDirsSafe(revRoot)) {
		for (const hash of readDirsSafe(path.join(revRoot, prefix))) {
			digests.push(normalizeDigest(`sha256:${prefix}${hash}`));
		}
	}
	return digests;
}

function isDigestTaggedInRepo(repo: string, digest: string): boolean {
	const repoPath = normalizeRepoPath(repo);
	const normalized = normalizeDigest(digest);
	for (const tag of listTagsFromFs(repo)) {
		const linked = digestFromTagLink(repoPath, tag);
		if (linked === normalized) return true;
	}
	return false;
}

function removeRevision(root: string, repoPath: string, digest: string): void {
	const match = normalizeDigest(digest).match(/^sha256:([a-f0-9]{64})$/i);
	if (!match) return;
	const hash = match[1];
	const dir = path.join(root, repoPath, "_manifests", "revisions", "sha256", hash.slice(0, 2), hash.slice(2));
	rmSync(dir, { recursive: true, force: true });
}

export interface StashGcResult {
	ok: boolean;
	output: string;
	marked: number;
	untaggedManifestsRemoved: number;
	blobsRemoved: number;
	bytesFreed: number;
	dryRun: boolean;
}

export function runStashGarbageCollection(dryRun = false, deleteUntagged = true): StashGcResult {
	const repoRoots = getRepositoriesRoots();
	const blobRoots = getBlobsRoots();

	if (repoRoots.length === 0) {
		return {
			ok: false,
			output: "No repository metadata directories found under /data/registry.",
			marked: 0,
			untaggedManifestsRemoved: 0,
			blobsRemoved: 0,
			bytesFreed: 0,
			dryRun,
		};
	}
	if (blobRoots.length === 0) {
		return {
			ok: false,
			output: "No blob store directories found under /data/registry.",
			marked: 0,
			untaggedManifestsRemoved: 0,
			blobsRemoved: 0,
			bytesFreed: 0,
			dryRun,
		};
	}

	let untaggedManifestsRemoved = 0;

	if (deleteUntagged) {
		forEachRepositoryPath((root, repoPath) => {
			for (const digest of listRevisionDigests(root, repoPath)) {
				if (isDigestTaggedInRepo(repoPath, digest)) continue;
				if (!dryRun) removeRevision(root, repoPath, digest);
				untaggedManifestsRemoved++;
			}
		});
	}

	const marked = collectTaggedDigests();
	let blobsRemoved = 0;
	let bytesFreed = 0;

	for (const blobsRoot of blobRoots) {
		const shaRoot = path.join(blobsRoot, "sha256");
		if (!existsSync(shaRoot)) continue;

		for (const prefix of readDirsSafe(shaRoot)) {
			for (const hash of readDirsSafe(path.join(shaRoot, prefix))) {
				const digest = normalizeDigest(`sha256:${prefix}${hash}`);
				const dataPath = path.join(shaRoot, prefix, hash, "data");
				if (!existsSync(dataPath)) continue;
				if (marked.has(digest)) continue;

				const size = statSync(dataPath).size;
				if (!dryRun) {
					rmSync(path.join(shaRoot, prefix, hash), { recursive: true, force: true });
				}
				blobsRemoved++;
				bytesFreed += size;
			}
		}
	}

	const layoutNote =
		repoRoots.length > 1 || blobRoots.length > 1
			? `\nLayouts scanned: ${[...repoRoots, ...blobRoots].join(", ")}`
			: "";

	const output = [
		dryRun ? "Dry run — nothing deleted." : "Garbage collection completed.",
		`${marked.size} blob(s) referenced by current tags.`,
		deleteUntagged
			? `${untaggedManifestsRemoved} untagged manifest revision(s) ${dryRun ? "eligible" : "removed"}.`
			: null,
		`${blobsRemoved} unreferenced blob(s) ${dryRun ? "eligible" : "removed"} (${formatBytes(bytesFreed)}).`,
		layoutNote.trim() || null,
	]
		.filter(Boolean)
		.join("\n");

	return {
		ok: true,
		output,
		marked: marked.size,
		untaggedManifestsRemoved,
		blobsRemoved,
		bytesFreed,
		dryRun,
	};
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
