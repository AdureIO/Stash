import { existsSync, readdirSync, statSync } from "fs";
import path from "path";

export function dirSize(dir: string): number {
	let total = 0;
	try {
		for (const f of readdirSync(dir)) {
			const p = path.join(dir, f);
			const s = statSync(p);
			total += s.isDirectory() ? dirSize(p) : s.size;
		}
	} catch {
		/* ignore missing or unreadable paths */
	}
	return total;
}

export function fileSize(file: string): number {
	try {
		if (!existsSync(file)) return 0;
		return statSync(file).size;
	} catch {
		return 0;
	}
}

export interface DiskBreakdown {
	total: number;
	docker_registry: number;
	docker_logical: number;
	trivy: number;
	maven: number;
	npm: number;
	database: number;
	other: number;
}

export function getDiskBreakdown(dockerLogical: number): DiskBreakdown {
	const dataRoot = process.env.DATA || "/data";
	const registryRoot = process.env.REGISTRY_DATA_ROOT || path.join(dataRoot, "registry");
	const trivyRoot = process.env.TRIVY_ROOT || path.join(dataRoot, "trivy");
	const mavenRoot = process.env.MAVEN_ROOT || path.join(dataRoot, "maven");
	const npmRoot = process.env.NPM_ROOT || path.join(dataRoot, "npm");
	const dbPath = process.env.DATABASE_URL || path.join(dataRoot, "db.sqlite");

	const docker_registry = existsSync(registryRoot) ? dirSize(registryRoot) : 0;
	const trivy = existsSync(trivyRoot) ? dirSize(trivyRoot) : 0;
	const maven = existsSync(mavenRoot) ? dirSize(mavenRoot) : 0;
	const npm = existsSync(npmRoot) ? dirSize(npmRoot) : 0;
	const database = fileSize(dbPath);
	const total = existsSync(dataRoot) ? dirSize(dataRoot) : 0;
	const accounted = docker_registry + trivy + maven + npm + database;

	return {
		total,
		docker_registry,
		docker_logical: dockerLogical,
		trivy,
		maven,
		npm,
		database,
		other: Math.max(0, total - accounted),
	};
}
