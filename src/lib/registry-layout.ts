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

/** OCI referrers (signatures, SBOMs, attestations) attach to a manifest via `subject`. */
function subjectDigest(body: Record<string, unknown>): string | null {
	const subject = body.subject as { digest?: string } | undefined;
	return subject?.digest ? normalizeDigest(subject.digest) : null;
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

export interface ReachableSet {
	/** Every blob digest a live tag can reach: manifests, configs and layers. */
	blobs: Set<string>;
	/** Manifest digests that must keep their revision link, keyed by repository path. */
	manifests: Map<string, Set<string>>;
}

/**
 * Walk every tag link and collect what has to survive a sweep.
 *
 * A tag points at one manifest, but a multi-arch tag points at an *index* whose children
 * are manifests in their own right: they have revision links and no tag of their own.
 * Treating "not pointed at by a tag" as "unreferenced" deletes them, and the pull then
 * fails with MANIFEST_UNKNOWN on the per-architecture fetch even though every blob is
 * still on disk. Reachability, not taggedness, is what decides.
 */
export function collectReachable(): ReachableSet {
	const blobs = new Set<string>();
	const manifests = new Map<string, Set<string>>();

	const manifestsFor = (repoPath: string): Set<string> => {
		let set = manifests.get(repoPath);
		if (!set) {
			set = new Set<string>();
			manifests.set(repoPath, set);
		}
		return set;
	};

	// Memoised per repository, not globally: the same digest can be mounted into several
	// repositories and each one needs its own revision link kept.
	const mark = (repoPath: string, digest: string) => {
		const normalized = normalizeDigest(digest);
		const repoManifests = manifestsFor(repoPath);
		if (repoManifests.has(normalized)) return;
		repoManifests.add(normalized);
		blobs.add(normalized);

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
		blobs.add(normalizeDigest(manifest.config.digest));
		for (const layer of manifest.layers) blobs.add(normalizeDigest(layer.digest));
	};

	for (const repo of listRepositoriesFromFs()) {
		const repoPath = normalizeRepoPath(repo);
		manifestsFor(repoPath);
		for (const tag of listTagsFromFs(repo)) {
			const digest = digestFromTagLink(repoPath, tag);
			if (digest) mark(repoPath, digest);
		}
	}

	// Referrers hang off a reachable manifest instead of a tag. Repeat until nothing new
	// attaches, so a signature of a signature is kept too.
	let changed = true;
	while (changed) {
		changed = false;
		forEachRepositoryPath((root, repoPath) => {
			const keep = manifestsFor(repoPath);
			for (const digest of listRevisionDigests(root, repoPath)) {
				if (keep.has(digest)) continue;
				const body = readManifestBlob(repoPath, digest);
				const subject = body ? subjectDigest(body) : null;
				if (subject && keep.has(subject)) {
					mark(repoPath, digest);
					changed = true;
				}
			}
		});
	}

	return { blobs, manifests };
}

/** Blob digests reachable from current tags. */
export function collectTaggedDigests(): Set<string> {
	return collectReachable().blobs;
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

export function runStashGarbageCollection(dryRun = false, deleteUntagged = false): StashGcResult {
	const repoRoots = getRepositoriesRoots();
	const blobRoots = getBlobsRoots();

	const fail = (output: string): StashGcResult => ({
		ok: false,
		output,
		marked: 0,
		untaggedManifestsRemoved: 0,
		blobsRemoved: 0,
		bytesFreed: 0,
		dryRun,
	});

	if (repoRoots.length === 0) {
		return fail("No repository metadata directories found under /data/registry.");
	}
	if (blobRoots.length === 0) {
		return fail("No blob store directories found under /data/registry.");
	}

	// Computed before anything is deleted: the sweeps below must not remove a manifest
	// that resolving a later one depends on.
	const reachable = collectReachable();
	const marked = reachable.blobs;
	const repositories = listRepositoriesFromFs();

	// A sweep that marks nothing would delete the entire blob store. That is a legitimate
	// outcome only when there is nothing left to serve; with repositories still on disk it
	// means reachability failed to resolve, so stop instead of emptying the registry.
	if (marked.size === 0 && repositories.length > 0) {
		return fail(
			[
				`Refusing to sweep: ${repositories.length} repositor${repositories.length === 1 ? "y is" : "ies are"} still on disk but no blob is reachable from any tag.`,
				"Every blob would be deleted. Check that the tag links under _manifests/tags are intact before running garbage collection again.",
			].join("\n\n"),
		);
	}

	let untaggedManifestsRemoved = 0;

	if (deleteUntagged) {
		forEachRepositoryPath((root, repoPath) => {
			const keep = reachable.manifests.get(repoPath) ?? new Set<string>();
			for (const digest of listRevisionDigests(root, repoPath)) {
				if (keep.has(digest)) continue;
				if (!dryRun) removeRevision(root, repoPath, digest);
				untaggedManifestsRemoved++;
			}
		});
	}

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
			? `${untaggedManifestsRemoved} unreachable manifest revision(s) ${dryRun ? "eligible" : "removed"}.`
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
