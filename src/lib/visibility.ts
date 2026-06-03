import { db, type PublicResource, type RegistryType } from "./db";

export type { RegistryType };

export function dockerVisibilityKey(repo: string): string {
	return repo;
}

export function mavenVisibilityKey(groupId: string, artifactId: string): string {
	return `maven:${groupId}:${artifactId}`;
}

export function npmVisibilityKey(name: string): string {
	return name;
}

export function isResourcePublic(registryType: RegistryType, resourceKey: string): boolean {
	return db.publicResources.isPublic(registryType, resourceKey);
}

/** Whether unauthenticated clients may pull (read) these resource keys. Push/delete always require auth. */
export function canAnonymousPullResourceKeys(resourceKeys: string[]): boolean {
	for (const key of resourceKeys) {
		if (!key) continue;
		if (db.publicResources.isPublic("docker", key)) return true;
		if (key.startsWith("maven:") && db.publicResources.isPublic("maven", key)) return true;
		const npmKey = key.startsWith("npm:") ? key.slice(4) : key;
		if (db.publicResources.isPublic("npm", npmKey)) return true;
	}
	return false;
}

export function listPublicResources(registryType?: RegistryType): PublicResource[] {
	return registryType ? db.publicResources.listByType(registryType) : db.publicResources.listAll();
}

export function setResourcePublic(
	registryType: RegistryType,
	resourceKey: string,
	isPublic: boolean,
	actor?: string,
): void {
	// Public visibility enables anonymous pull only; push/delete remain auth-gated.
	if (isPublic) {
		db.publicResources.markPublic(registryType, resourceKey, actor);
	} else {
		db.publicResources.markPrivate(registryType, resourceKey);
	}
}

export function publicResourceKeys(registryType: RegistryType): Set<string> {
	return new Set(db.publicResources.listByType(registryType).map((r) => r.resource_key));
}
