// Regenerate /data/registry.yml at runtime (e.g., after read-only toggle)
import { writeFileSync } from "fs";
import { execSync } from "child_process";
import { getRegistryWebhookEventsUrl } from "./registry-internal";

const CONFIG_PATH = "/data/registry.yml";

function requireEnv(key: string, fallback: string): string {
	const v = process.env[key];
	if (!v) {
		if (process.env.NODE_ENV === "production") {
			throw new Error(`[stash] ${key} environment variable is not set. Required in production.`);
		}
		return fallback;
	}
	return v;
}

/** Quote values so YAML parsers handle URLs and secrets safely. */
export function yamlQuote(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function buildRegistryYaml(readonly: boolean): string {
	const registrySecret = requireEnv("REGISTRY_SECRET", "dev-registry-secret");
	const webhookSecret = requireEnv("WEBHOOK_SECRET", "dev-webhook-secret");
	const authRealm = (process.env.PUBLIC_URL || "http://localhost:3000") + "/api/auth/token";
	const webhookUrl = getRegistryWebhookEventsUrl();

	return `version: 0.1
log:
  level: warn
storage:
  filesystem:
    rootdirectory: /data/registry
  delete:
    enabled: true
  maintenance:
    readonly:
      enabled: ${readonly}
    uploadpurging:
      enabled: true
      age: 168h
      interval: 24h
      dryrun: false
http:
  addr: :5000
  secret: ${yamlQuote(registrySecret)}
auth:
  token:
    realm: ${yamlQuote(authRealm)}
    service: docker-registry
    issuer: registry-admin
    rootcertbundle: /data/auth.crt
notifications:
  endpoints:
    - name: admin
      url: ${yamlQuote(webhookUrl)}
      headers:
        Authorization: [${yamlQuote(`Bearer ${webhookSecret}`)}]
      timeout: 5s
      threshold: 1
      backoff: 2s
`;
}

export function regenerateConfig(readonly: boolean) {
	writeFileSync(CONFIG_PATH, buildRegistryYaml(readonly));

	// Signal supervisord to restart registry if available
	try {
		execSync("supervisorctl -c /tmp/supervisord.conf restart registry", { timeout: 10000, stdio: "pipe" });
	} catch {}
}

/** Env for registry CLI — strip Stash REGISTRY_* vars that collide with distribution overrides. */
export function registryCliEnv(): NodeJS.ProcessEnv {
	const env = { ...process.env };
	for (const key of Object.keys(env)) {
		if (key.startsWith("REGISTRY_")) delete env[key];
	}
	return env;
}
