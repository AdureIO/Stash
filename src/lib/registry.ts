// Docker Registry HTTP API V2 client
import { existsSync, readdirSync, statSync } from "fs";
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

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function bearerForScope(scope: string): Promise<string> {
	const cached = tokenCache.get(scope);
	if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
	const access = scopesToAccess(scope);
	const token = await issueInternalRegistryToken(access);
	tokenCache.set(scope, { token, expiresAt: Date.now() + 3600_000 });
	return token;
}

async function registryFetch(
	apiPath: string,
	options: RequestInit & { scope?: string } = {},
) {
	const scope = options.scope ?? "registry:catalog:*";
	const token = await bearerForScope(scope);
	const headers = new Headers(options.headers);
	headers.set("Accept", "application/vnd.docker.distribution.manifest.v2+json, application/json");
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

// Get manifest for a tag (returns digest + manifest)
export async function getManifest(repo: string, ref: string): Promise<{ digest: string; manifest: ManifestV2 } | null> {
	const res = await registryFetch(`/v2/${repo}/manifests/${ref}`, {
		scope: `repository:${repo}:pull`,
		headers: {
			Accept: "application/vnd.docker.distribution.manifest.v2+json",
		},
	});
	if (!res.ok) return null;
	const digest = res.headers.get("Docker-Content-Digest") || "";
	const manifest = (await res.json()) as ManifestV2;
	return { digest, manifest };
}

// Get image config blob (for created date, arch, os)
export async function getImageConfig(repo: string, digest: string): Promise<ImageConfig | null> {
	const res = await registryFetch(`/v2/${repo}/blobs/${digest}`, {
		scope: `repository:${repo}:pull`,
	});
	if (!res.ok) return null;
	return res.json() as Promise<ImageConfig>;
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
	return details.filter(Boolean) as TagDetail[];
}

// Delete a tag by digest
export async function deleteManifest(repo: string, digest: string): Promise<boolean> {
	const res = await registryFetch(`/v2/${repo}/manifests/${digest}`, {
		method: "DELETE",
		scope: `repository:${repo}:delete`,
	});
	return res.ok || res.status === 202;
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
