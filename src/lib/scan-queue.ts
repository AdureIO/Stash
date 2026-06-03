/** Serializes Trivy runs — parallel scans can prevent --output files from being written reliably. */
let chain: Promise<void> = Promise.resolve();

export function enqueueScan<T>(fn: () => Promise<T>): Promise<T> {
	const run = chain.then(fn);
	chain = run.then(
		() => undefined,
		() => undefined,
	);
	return run;
}
