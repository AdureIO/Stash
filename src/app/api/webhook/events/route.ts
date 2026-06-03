// Receives push/pull/delete events from the registry notification system
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isInternalRegistryPull } from "@/lib/registry-events";
import { queueScanOnPush } from "@/lib/scan-runner";

interface RegistryEvent {
	id: string;
	timestamp: string;
	action: "push" | "pull" | "delete" | "mount";
	target: {
		mediaType?: string;
		size?: number;
		digest?: string;
		length?: number;
		repository: string;
		url?: string;
		tag?: string;
	};
	request?: {
		id?: string;
		addr?: string;
		host?: string;
		method?: string;
		useragent?: string;
	};
	actor?: {
		name?: string;
	};
	source?: {
		addr?: string;
		instanceID?: string;
	};
}

interface RegistryEnvelope {
	events: RegistryEvent[];
}

export async function POST(req: NextRequest) {
	// Always require webhook secret — reject unconfigured ingest
	const expectedSecret = process.env.WEBHOOK_SECRET;
	if (!expectedSecret) {
		return NextResponse.json({ error: "Webhook ingest disabled — set WEBHOOK_SECRET" }, { status: 503 });
	}
	const auth = req.headers.get("Authorization") || "";
	const token = auth.replace("Bearer ", "").trim();
	if (!token || token !== expectedSecret) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	let body: RegistryEnvelope;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const events = body.events || [];

	for (const event of events) {
		const ip = event.request?.addr?.split(":")[0] || null;
		const actor = event.actor?.name || null;

		// UI/cron manifest reads — not user activity
		if (isInternalRegistryPull({ action: event.action, actor, ip })) continue;

		db.events.insert({
			action: event.action,
			repository: event.target.repository,
			tag: event.target.tag || null,
			digest: event.target.digest || null,
			actor,
			ip,
			size: event.target.size || event.target.length || null,
			timestamp: event.timestamp,
			raw: JSON.stringify(event),
		});

		await forwardToWebhooks(event);

		if (event.action === "push" && event.target.tag) {
			queueScanOnPush(event.target.repository, event.target.tag);
		}
	}

	return NextResponse.json({ ok: true });
}

async function forwardToWebhooks(event: RegistryEvent) {
	const targets = db.webhooks.findActive();

	for (const target of targets) {
		const wantedEvents = target.events.split(",").map((e) => e.trim());
		if (!wantedEvents.includes(event.action)) continue;

		const pattern = target.repository_pattern;
		const repo = event.target.repository;
		const matches =
			pattern === "*" || pattern === repo || (pattern.endsWith("/*") && repo.startsWith(pattern.slice(0, -2)));

		if (!matches) continue;

		const payload = JSON.stringify({
			action: event.action,
			repository: event.target.repository,
			tag: event.target.tag,
			digest: event.target.digest,
			actor: event.actor?.name,
			timestamp: event.timestamp,
		});

		const headers: Record<string, string> = { "Content-Type": "application/json" };
		if (target.secret) headers["X-Webhook-Secret"] = target.secret;

		try {
			const res = await fetch(target.url, {
				method: "POST",
				headers,
				body: payload,
				signal: AbortSignal.timeout(10000),
			});
			db.webhooks.update(target.id, {
				last_triggered: new Date().toISOString(),
				last_status: res.status,
			});
		} catch {
			db.webhooks.update(target.id, {
				last_triggered: new Date().toISOString(),
				last_status: 0,
			});
		}
	}
}
