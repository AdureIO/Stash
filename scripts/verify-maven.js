#!/usr/bin/env node
/**
 * Verifies Maven metadata + checksum behaviour (same logic as /api/maven GET).
 * Run: node scripts/verify-maven.js
 */
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require("fs");
const { tmpdir } = require("os");
const { join } = require("path");
const { createHash } = require("crypto");

// Compiled path would need build; import TS via dynamic require of transpiled — use inline copy of core checks
// instead we duplicate minimal calls by spawning ts-node OR use node --experimental-strip-types

async function main() {
	const mod = await import("../src/lib/maven-repository.ts");
	const { resolveMavenGet, buildMavenMetadata, checksumBuffer } = mod;

	const root = mkdtempSync(join(tmpdir(), "maven-verify-"));
	let failed = 0;

	function assert(cond, msg) {
		if (!cond) {
			console.error("FAIL:", msg);
			failed++;
		} else {
			console.log("ok:", msg);
		}
	}

	try {
		const artifactDir = join(root, "eu", "scalefactory", "SalesforceConnector");
		const versionDir = join(artifactDir, "2.0.0");
		mkdirSync(versionDir, { recursive: true });

		const jarPath = join(versionDir, "SalesforceConnector-2.0.0.jar");
		const jarBody = Buffer.from("fake-jar-content-for-test");
		writeFileSync(jarPath, jarBody);

		const segments = ["eu", "scalefactory", "SalesforceConnector"];
		const generated = buildMavenMetadata(artifactDir, segments);
		assert(generated.includes("<version>2.0.0</version>"), "generated metadata lists version 2.0.0");
		assert(generated.includes("<release>2.0.0</release>"), "generated metadata sets release");

		const metaGet = resolveMavenGet([...segments, "maven-metadata.xml"], root);
		assert(metaGet.kind === "metadata", "metadata GET returns metadata");
		assert(metaGet.body === generated, "metadata GET matches generated before upload");

		for (const algo of ["md5", "sha1"]) {
			const csGet = resolveMavenGet([...segments, `maven-metadata.xml.${algo}`], root);
			assert(csGet.kind === "checksum", `metadata .${algo} returns checksum`);
			const expected = checksumBuffer(Buffer.from(generated, "utf-8"), algo);
			assert(csGet.body === expected, `metadata .${algo} matches hash of metadata body`);
		}

		const jarSha1 = resolveMavenGet(
			["eu", "scalefactory", "SalesforceConnector", "2.0.0", "SalesforceConnector-2.0.0.jar.sha1"],
			root,
		);
		assert(jarSha1.kind === "checksum", "jar.sha1 returns checksum");
		const jarExpected = createHash("sha1").update(jarBody).digest("hex");
		assert(jarSha1.body === jarExpected, "jar.sha1 matches jar file");

		const uploadedMeta = `${generated}\n`;
		writeFileSync(join(artifactDir, "maven-metadata.xml"), uploadedMeta, "utf-8");

		const storedGet = resolveMavenGet([...segments, "maven-metadata.xml"], root);
		assert(
			storedGet.kind === "metadata" && storedGet.body === uploadedMeta,
			"serves on-disk metadata when present",
		);

		const storedSha1 = resolveMavenGet([...segments, "maven-metadata.xml.sha1"], root);
		const uploadedHash = createHash("sha1").update(uploadedMeta, "utf-8").digest("hex");
		assert(
			storedSha1.kind === "checksum" && storedSha1.body === uploadedHash,
			"checksum uses on-disk metadata when present",
		);

		const missingJar = resolveMavenGet(
			["eu", "scalefactory", "SalesforceConnector", "9.9.9", "SalesforceConnector-9.9.9.jar.sha1"],
			root,
		);
		assert(missingJar.kind === "not-found", "missing jar.sha1 is 404");

		const traversal = resolveMavenGet(["..", "etc", "passwd"], root);
		assert(traversal.kind === "forbidden", "path traversal blocked");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}

	if (failed) {
		console.error(`\n${failed} check(s) failed`);
		process.exit(1);
	}
	console.log("\nAll Maven repository checks passed.");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
