// Docker Registry HTTP API V2 client
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from "fs";
import path from "path";
import { issueInternalRegistryToken, scopesToAccess } from "./token-auth";

const REGISTRY_URL = process.env.REGISTRY_URL || "http://127.0.0.1:5000";
const REGISTRY_DATA_ROOT = process.env.REGISTRY_DATA_ROOT || "/data/registry";

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

function getRepositoriesRoots(): string[] {
	// Support both common registry layouts:
	// - /data/registry/docker/registry/v2/repositories (default distribution layout)
	// - /data/registry/repositories (already mounted at v2 root)
	return [
		path.join(REGISTRY_DATA_ROOT, "docker", "registry", "v2", "repositories"),
		path.join(REGISTRY_DATA_ROOT, "repositories"),
	].filter((root, index, arr) => arr.indexOf(root) === index && existsSync(root));
}

function listRepositoriesFromFs(): string[] {
	const roots = getRepositoriesRoots();
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

	for (const root of roots) walk(root);
	return Array.from(repos).sort();
}

function listTagsFromFs(repo: string): string[] {
	const roots = getRepositoriesRoots();
	const tags = new Set<string>();
	const repoPath = repo.replace(/^\/+|\/+$/g, "");

	for (const root of roots) {
		const tagsDir = path.join(root, repoPath, "_manifests", "tags");
		for (const tag of readDirsSafe(tagsDir)) tags.add(tag);
	}

	return Array.from(tags).sort();
}

const MANIFEST_ACCEPT = [
	"application/vnd.docker.distribution.manifest.v2+json",
	"application/vnd.docker.distribution.manifest.list.v2+json",
	"application/vnd.oci.image.manifest.v1+json",
	"application/vnd.oci.image.index.v1+json",
].join(", ");

const MANIFEST_LIST_MEDIA_TYPES = new Set([
	"application/vnd.docker.distribution.manifest.list.v2+json",
	"application/vnd.oci.image.index.v1+json",
]);

interface ManifestDescriptor {
	mediaType: string;
	size: number;
	digest: string;
	platform?: { architecture?: string; os?: string };
}

interface ManifestList {
	schemaVersion: number;
	mediaType?: string;
	manifests: ManifestDescriptor[];
}

function normalizeRepoPath(repo: string): string {
	return repo.replace(/^\/+|\/+$/g, "");
}

function normalizeDigest(digest: string): string {
	const trimmed = digest.trim();
	if (/^sha256:[a-f0-9]{64}$/i.test(trimmed)) return trimmed.toLowerCase();
	if (/^[a-f0-9]{64}$/i.test(trimmed)) return `sha256:${trimmed.toLowerCase()}`;
	return trimmed;
}

function getBlobsRoot(): string {
	return path.join(REGISTRY_DATA_ROOT, "docker", "registry", "v2", "blobs");
}

function blobDataPath(digest: string): string | null {
	const normalized = normalizeDigest(digest);
	const match = normalized.match(/^sha256:([a-f0-9]{64})$/i);
	if (!match) return null;
	const hash = match[1];
	return path.join(getBlobsRoot(), "sha256", hash.slice(0, 2), hash.slice(2), "data");
}

function readJsonBlob(digest: string): Record<string, unknown> | null {
	const blobPath = blobDataPath(digest);
	if (!blobPath || !existsSync(blobPath)) return null;
	try {
		return JSON.parse(readFileSync(blobPath, "utf8")) as Record<string, unknown>;
	} catch {
		return null;
	}
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

function isManifestListBody(mediaType: string, body: Record<string, unknown>): boolean {
	if (MANIFEST_LIST_MEDIA_TYPES.has(mediaType)) return true;
	return Array.isArray(body.manifests) && !("config" in body);
}

function pickPlatformManifest(manifests: ManifestDescriptor[]): ManifestDescriptor | null {
	const predicates = [
		(m: ManifestDescriptor) => m.platform?.os === "linux" && m.platform?.architecture === "amd64",
		(m: ManifestDescriptor) => m.platform?.os === "linux" && m.platform?.architecture === "arm64",
		(m: ManifestDescriptor) => m.platform?.os === "linux",
	];
	for (const pred of predicates) {
		const found = manifests.find(pred);
		if (found) return found;
	}
	return manifests[0] ?? null;
}

function asManifestV2(body: Record<string, unknown>): ManifestV2 | null {
	const config = body.config as { digest?: string; size?: number; mediaType?: string } | undefined;
	const layers = body.layers as { size: number }[] | undefined;
	if (!config?.digest || !Array.isArray(layers)) return null;
	return {
		schemaVersion: typeof body.schemaVersion === "number" ? body.schemaVersion : 2,
		mediaType: typeof body.mediaType === "string" ? body.mediaType : "",
		config: {
			mediaType: config.mediaType || "",
			size: config.size || 0,
			digest: config.digest,
		},
		layers: layers as ManifestV2["layers"],
	};
}

function digestFromTagLink(repoPath: string, tag: string): string | null {
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

function readManifestBlob(repoPath: string, manifestDigest: string): Record<string, unknown> | null {
	const normalized = normalizeDigest(manifestDigest);
	return readJsonBlob(normalized) ?? readManifestJsonFromRevision(repoPath, normalized);
}

function resolveManifestBody(
	repoPath: string,
	manifestDigest: string,
	body: Record<string, unknown>,
): { digest: string; manifest: ManifestV2 } | null {
	const mediaType = typeof body.mediaType === "string" ? body.mediaType : "";
	if (isManifestListBody(mediaType, body)) {
		const child = pickPlatformManifest(body.manifests as ManifestDescriptor[]);
		if (!child) return null;
		return resolveManifestDigest(repoPath, child.digest);
	}
	const manifest = asManifestV2(body);
	return manifest ? { digest: normalizeDigest(manifestDigest), manifest } : null;
}

function resolveManifestDigest(
	repoPath: string,
	manifestDigest: string,
): { digest: string; manifest: ManifestV2 } | null {
	const normalized = normalizeDigest(manifestDigest);
	const body = readManifestBlob(repoPath, normalized);
	if (!body) return null;
	return resolveManifestBody(repoPath, normalized, body);
}

function getManifestFromFs(repo: string, ref: string): { digest: string; manifest: ManifestV2 } | null {
	const repoPath = normalizeRepoPath(repo);
	const digest =
		ref.startsWith("sha256:") || /^[a-f0-9]{64}$/i.test(ref)
			? normalizeDigest(ref)
			: digestFromTagLink(repoPath, ref);
	if (!digest) return null;
	return resolveManifestDigest(repoPath, digest);
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function bearerForScope(scope: string): Promise<string> {
	const cached = tokenCache.get(scope);
	if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
	const access = scopesToAccess(scope);
	const token = await issueInternalRegistryToken(access);
	tokenCache.set(scope, { token, expiresAt: Date.now() + 3600_000 });
	return token;
}

async function registryFetch(apiPath: string, options: RequestInit & { scope?: string } = {}) {
	const scope = options.scope ?? "registry:catalog:*";
	const token = await bearerForScope(scope);
	const headers = new Headers(options.headers);
	if (!headers.has("Accept")) {
		headers.set("Accept", "application/vnd.docker.distribution.manifest.v2+json, application/json");
	}
	headers.set("Authorization", `Bearer ${token}`);

	const { scope: _scope, ...fetchOptions } = options;
	const res = await fetch(`${REGISTRY_URL}${apiPath}`, {
		...fetchOptions,
		headers,
		cache: "no-store",
	});
	return res;
}

export interface Repository {
	name: string;
}

export interface Tag {
	name: string;
}

export interface ManifestV2 {
	schemaVersion: number;
	mediaType: string;
	config: { mediaType: string; size: number; digest: string };
	layers: { mediaType: string; size: number; digest: string }[];
}

export interface ImageConfig {
	architecture?: string;
	os?: string;
	created?: string;
	author?: string;
	config?: {
		Env?: string[];
		Cmd?: string[];
		Labels?: Record<string, string>;
	};
}

export interface TagDetail {
	tag: string;
	digest: string;
	size: number; // compressed total
	created: string | null;
	architecture: string | null;
	os: string | null;
	layers: number;
}

// List all repositories
export async function listRepositories(): Promise<string[]> {
	const repos: string[] = [];
	let url = "/v2/_catalog?n=100";

	while (url) {
		const res = await registryFetch(url, { scope: "registry:catalog:*" });
		if (!res.ok) return repos.length ? repos : listRepositoriesFromFs();
		const data = (await res.json()) as { repositories: string[] };
		repos.push(...(data.repositories || []));

		const link = res.headers.get("Link");
		const next = link?.match(/<([^>]+)>;\s*rel="next"/);
		url = next ? next[1] : "";
	}

	if (repos.length > 0) return repos;
	return listRepositoriesFromFs();
}

// List tags for a repository
export async function listTags(repo: string): Promise<string[]> {
	const res = await registryFetch(`/v2/${repo}/tags/list`, {
		scope: `repository:${repo}:pull`,
	});
	if (!res.ok) return listTagsFromFs(repo);
	const data = (await res.json()) as { tags: string[] | null };
	const apiTags = data.tags || [];
	if (apiTags.length > 0) return apiTags;
	return listTagsFromFs(repo);
}

async function resolveManifestResponse(
	repo: string,
	ref: string,
	digest: string,
	body: Record<string, unknown>,
	contentType: string,
): Promise<{ digest: string; manifest: ManifestV2 } | null> {
	const mediaType = contentType || (typeof body.mediaType === "string" ? body.mediaType : "");
	const fsRef = digest || ref;

	if (isManifestListBody(mediaType, body)) {
		const child = pickPlatformManifest(body.manifests as ManifestDescriptor[]);
		if (!child) return getManifestFromFs(repo, fsRef);
		return getManifest(repo, child.digest);
	}

	const manifest = asManifestV2(body);
	if (manifest) return { digest: digest ? normalizeDigest(digest) : fsRef, manifest };
	return getManifestFromFs(repo, fsRef);
}

// Get manifest for a tag (returns digest + manifest)
export async function getManifest(repo: string, ref: string): Promise<{ digest: string; manifest: ManifestV2 } | null> {
	const res = await registryFetch(`/v2/${repo}/manifests/${ref}`, {
		scope: `repository:${repo}:pull`,
		headers: { Accept: MANIFEST_ACCEPT },
	});
	if (!res.ok) return getManifestFromFs(repo, ref);

	const digest = res.headers.get("Docker-Content-Digest") || "";
	const contentType = res.headers.get("Content-Type")?.split(";")[0]?.trim() || "";
	const body = (await res.json()) as Record<string, unknown>;
	return resolveManifestResponse(repo, ref, digest, body, contentType);
}

// Get image config blob (for created date, arch, os)
export async function getImageConfig(repo: string, digest: string): Promise<ImageConfig | null> {
	const res = await registryFetch(`/v2/${repo}/blobs/${digest}`, {
		scope: `repository:${repo}:pull`,
	});
	if (res.ok) return res.json() as Promise<ImageConfig>;

	const blob = readJsonBlob(digest);
	return blob ? (blob as ImageConfig) : null;
}

// Get full tag detail including size, created, arch
export async function getTagDetail(repo: string, tag: string): Promise<TagDetail | null> {
	const m = await getManifest(repo, tag);
	if (!m) return null;
	const { digest, manifest } = m;

	const totalSize = manifest.layers.reduce((sum, l) => sum + l.size, 0) + manifest.config.size;

	let created: string | null = null;
	let architecture: string | null = null;
	let os: string | null = null;

	const config = await getImageConfig(repo, manifest.config.digest);
	if (config) {
		created = config.created || null;
		architecture = config.architecture || null;
		os = config.os || null;
	}

	return {
		tag,
		digest,
		size: totalSize,
		created,
		architecture,
		os,
		layers: manifest.layers.length,
	};
}

// Get all tags with details for a repository
export async function getRepositoryDetail(repo: string): Promise<TagDetail[]> {
	const tags = await listTags(repo);
	const details = await Promise.all(tags.map((t) => getTagDetail(repo, t)));
	return tags.map((tag, i) => {
		const detail = details[i];
		if (detail) return detail;
		return {
			tag,
			digest: "",
			size: 0,
			created: null,
			architecture: null,
			os: null,
			layers: 0,
		};
	});
}

/** Digest the tag points to (manifest list or image manifest) — required for registry DELETE. */
async function manifestDigestForTag(repo: string, tag: string): Promise<string | null> {
	const res = await registryFetch(`/v2/${repo}/manifests/${encodeURIComponent(tag)}`, {
		method: "HEAD",
		scope: `repository:${repo}:pull`,
		headers: { Accept: MANIFEST_ACCEPT },
	});
	if (res.ok) {
		const header = res.headers.get("Docker-Content-Digest");
		if (header) return normalizeDigest(header);
	}
	const raw = getManifestRawFromFs(repo, tag);
	return raw?.digest ?? null;
}

/** Remove a tag directory on disk (only this tag; shared manifests stay). */
function deleteTagOnFs(repo: string, tag: string): boolean {
	const found = findRepositoryDir(repo);
	if (!found) return false;
	const tagDir = path.join(found.dir, "_manifests", "tags", tag);
	if (!existsSync(tagDir)) return false;
	rmSync(tagDir, { recursive: true, force: true });
	return true;
}

/** Remove repository metadata directory (empty catalog entry after tags are gone). */
function removeRepositoryOnFs(repo: string): boolean {
	const found = findRepositoryDir(repo);
	if (!found) return false;
	rmSync(found.dir, { recursive: true, force: true });
	return true;
}

// Delete a single tag (registry API only deletes by digest; shared digests use FS tag removal)
export async function deleteTag(repo: string, tag: string): Promise<boolean> {
	const digest = await manifestDigestForTag(repo, tag);
	if (!digest) return deleteTagOnFs(repo, tag);

	const tags = await listTags(repo);
	const sharing = (await Promise.all(tags.map(async (t) => ({ t, d: await manifestDigestForTag(repo, t) }))))
		.filter((x) => x.d === digest)
		.map((x) => x.t);

	if (sharing.length === 1 && sharing[0] === tag) {
		return deleteManifest(repo, digest);
	}

	return deleteTagOnFs(repo, tag);
}

// Delete a manifest by digest (removes the manifest and all tags pointing to it)
export async function deleteManifest(repo: string, digest: string): Promise<boolean> {
	const res = await registryFetch(`/v2/${repo}/manifests/${encodeURIComponent(normalizeDigest(digest))}`, {
		method: "DELETE",
		scope: `repository:${repo}:delete`,
		headers: { Accept: MANIFEST_ACCEPT },
	});
	return res.ok || res.status === 202;
}

const DEFAULT_MANIFEST_TYPE = "application/vnd.docker.distribution.manifest.v2+json";

function manifestContentType(body: Record<string, unknown>, headerValue?: string | null): string {
	const fromHeader = headerValue?.split(";")[0]?.trim();
	if (fromHeader) return fromHeader;
	if (typeof body.mediaType === "string" && body.mediaType) return body.mediaType;
	return DEFAULT_MANIFEST_TYPE;
}

function resolveManifestRef(repo: string, ref: string): string | null {
	const repoPath = normalizeRepoPath(repo);
	if (ref.startsWith("sha256:") || /^[a-f0-9]{64}$/i.test(ref)) return normalizeDigest(ref);
	return digestFromTagLink(repoPath, ref);
}

function getManifestRawFromFs(
	repo: string,
	ref: string,
): { digest: string; body: Record<string, unknown>; contentType: string } | null {
	const repoPath = normalizeRepoPath(repo);
	const digest = resolveManifestRef(repo, ref);
	if (!digest) return null;
	const body = readManifestBlob(repoPath, digest);
	if (!body) return null;
	return { digest, body, contentType: manifestContentType(body) };
}

function findRepositoryDir(repo: string): { root: string; dir: string } | null {
	const repoPath = normalizeRepoPath(repo);
	for (const root of getRepositoriesRoots()) {
		const dir = path.join(root, repoPath);
		if (existsSync(path.join(dir, "_manifests"))) return { root, dir };
	}
	return null;
}

/** Move repository metadata on disk (blobs are shared; tags live under repositories/). */
function renameRepositoryOnFs(oldName: string, newName: string): number | null {
	const src = findRepositoryDir(oldName);
	if (!src) return null;
	const newPath = normalizeRepoPath(newName);
	const dst = path.join(src.root, newPath);
	if (existsSync(dst)) return null;
	const parent = path.dirname(dst);
	if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
	renameSync(src.dir, dst);
	return listTagsFromFs(newName).length;
}

/** Fetch manifest JSON as stored for a tag (no index resolution). */
export async function getManifestRaw(
	repo: string,
	ref: string,
): Promise<{ digest: string; body: Record<string, unknown>; contentType: string } | null> {
	const res = await registryFetch(`/v2/${repo}/manifests/${ref}`, {
		scope: `repository:${repo}:pull`,
		headers: { Accept: MANIFEST_ACCEPT },
	});
	if (!res.ok) return getManifestRawFromFs(repo, ref);
	const digest = res.headers.get("Docker-Content-Digest") || "";
	const body = (await res.json()) as Record<string, unknown>;
	const contentType = manifestContentType(body, res.headers.get("Content-Type"));
	return { digest: digest ? normalizeDigest(digest) : digest, body, contentType };
}

/** Tag a manifest (copy manifest JSON to another tag). */
export async function putManifest(
	repo: string,
	tag: string,
	body: Record<string, unknown>,
	contentType: string,
): Promise<string | null> {
	const mediaType = manifestContentType(body, contentType);
	const res = await registryFetch(`/v2/${repo}/manifests/${tag}`, {
		method: "PUT",
		scope: `repository:${repo}:push,pull`,
		headers: { "Content-Type": mediaType },
		body: JSON.stringify(body),
	});
	if (!res.ok) return null;
	const digest = res.headers.get("Docker-Content-Digest");
	return digest ? normalizeDigest(digest) : null;
}

export async function retagManifest(repo: string, sourceTag: string, targetTag: string): Promise<boolean> {
	if (sourceTag === targetTag) return true;
	const raw = await getManifestRaw(repo, sourceTag);
	if (!raw) return false;
	const digest = await putManifest(repo, targetTag, raw.body, raw.contentType);
	if (!digest) return false;
	return deleteTag(repo, sourceTag);
}

export async function deleteRepository(repo: string): Promise<{ deleted: number; failed: number }> {
	const tags = await listTags(repo);
	const digests = new Set<string>();
	for (const tag of tags) {
		const d = await manifestDigestForTag(repo, tag);
		if (d) digests.add(d);
	}

	let deleted = 0;
	let failed = 0;

	for (const digest of digests) {
		if (await deleteManifest(repo, digest)) deleted++;
		else failed++;
	}

	// Remove leftover tag links and repo shell so /v2/_catalog no longer lists it
	for (const tag of tags) {
		if (deleteTagOnFs(repo, tag)) deleted++;
	}
	removeRepositoryOnFs(repo);

	const remaining = await listTags(repo);
	if (remaining.length > 0) {
		failed += remaining.length;
		for (const tag of remaining) {
			if (await deleteTag(repo, tag)) {
				failed--;
				deleted++;
			}
		}
		removeRepositoryOnFs(repo);
	}

	return { deleted, failed };
}

export async function renameRepository(oldName: string, newName: string): Promise<{ copied: number; failed: number }> {
	const fsTags = renameRepositoryOnFs(oldName, newName);
	if (fsTags !== null) return { copied: fsTags, failed: 0 };

	const tags = await listTags(oldName);
	let copied = 0;
	let failed = 0;

	for (const tag of tags) {
		const raw = await getManifestRaw(oldName, tag);
		if (!raw) {
			failed++;
			continue;
		}
		const put = await putManifest(newName, tag, raw.body, raw.contentType);
		if (!put) {
			failed++;
			continue;
		}
		copied++;
		await deleteTag(oldName, tag);
	}
	return { copied, failed };
}

// Get total storage used per repository (sum of unique layer sizes)
export async function getRepositorySize(repo: string): Promise<number> {
	const tags = await listTags(repo);
	const seenDigests = new Set<string>();
	let total = 0;

	for (const tag of tags) {
		const m = await getManifest(repo, tag);
		if (!m) continue;
		for (const layer of m.manifest.layers) {
			if (!seenDigests.has(layer.digest)) {
				seenDigests.add(layer.digest);
				total += layer.size;
			}
		}
		if (!seenDigests.has(m.manifest.config.digest)) {
			seenDigests.add(m.manifest.config.digest);
			total += m.manifest.config.size;
		}
	}

	return total;
}

export interface RegistryImageRef {
	repository: string;
	tag: string;
}

/** All repository:tag pairs in the registry (for scan picker, etc.). */
export async function listRegistryImages(): Promise<RegistryImageRef[]> {
	const repos = await listRepositories();
	const images: RegistryImageRef[] = [];
	for (const repository of repos) {
		for (const tag of await listTags(repository)) {
			images.push({ repository, tag });
		}
	}
	return images.sort((a, b) =>
		`${a.repository}:${a.tag}`.localeCompare(`${b.repository}:${b.tag}`, undefined, { sensitivity: "base" }),
	);
}

// Registry health check
export async function healthCheck(): Promise<boolean> {
	try {
		const res = await registryFetch("/v2/", { signal: AbortSignal.timeout(3000) });
		return res.status === 200 || res.status === 401;
	} catch {
		return false;
	}
}

export function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
