/** Whether an outgoing webhook repository pattern matches a repo name. */
export function webhookMatchesRepo(pattern: string, repo: string): boolean {
	if (pattern === "*") return true;
	if (pattern === repo) return true;
	if (pattern.endsWith("/*")) return repo.startsWith(`${pattern.slice(0, -2)}/`);
	if (pattern.endsWith("/**")) return repo.startsWith(`${pattern.slice(0, -3)}/`);
	return false;
}
