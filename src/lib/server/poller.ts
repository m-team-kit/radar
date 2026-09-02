import type Database from 'better-sqlite3';
import { getConfig } from './config';
import { getDb, nowIso } from './db';
import { getDeployment, getSource, markDeploymentError, markSourceError, recordSourceVersions, setDeploymentVersion } from './repos';
import { fetchSourceVersions } from './sources';
import { fetchDeployedVersion } from './deployment';
import { notifyPendingUpdates } from './notifications';

let started = false;

const inflight = new Map<string, Promise<void>>();

async function runPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
	const queue = [...items];
	const workers = Array.from({ length: Math.min(concurrency, Math.max(queue.length, 1)) }, async () => {
		while (queue.length > 0) {
			const item = queue.shift()!;
			await fn(item);
		}
	});
	await Promise.all(workers);
}

async function runSourceCheck(db: Database.Database, sourceId: string): Promise<void> {
	const source = getSource(db, sourceId);
	if (!source) return;
	const previousLatest = source.latest_version;
	try {
		const rawVersions = await fetchSourceVersions(source);
		const { latest } = recordSourceVersions(db, source, rawVersions);
		if (latest && latest !== previousLatest) {
			await notifyPendingUpdates(db, source, latest);
		}
	} catch (err) {
		markSourceError(db, sourceId, (err as Error).message);
	}
}

/**
 * Fetch and record a source's versions now. Concurrent calls for the same
 * source (e.g. a manual refresh racing a background poll) share one fetch.
 */
export function refreshSourceNow(db: Database.Database, sourceId: string): Promise<void> {
	const key = `source:${sourceId}`;
	const existing = inflight.get(key);
	if (existing) return existing;
	const p = runSourceCheck(db, sourceId).finally(() => inflight.delete(key));
	inflight.set(key, p);
	return p;
}

async function runDeploymentCheck(db: Database.Database, deploymentId: string): Promise<void> {
	const deployment = getDeployment(db, deploymentId);
	if (!deployment) return;
	if (deployment.query.type === 'manual') return;
	try {
		const version = await fetchDeployedVersion(deployment.query);
		setDeploymentVersion(db, deploymentId, version, null);
	} catch (err) {
		markDeploymentError(db, deploymentId, (err as Error).message);
	}
}

/** Fetch and record a deployment's version now. Concurrent calls share one fetch. */
export function refreshDeploymentNow(db: Database.Database, deploymentId: string): Promise<void> {
	const key = `deployment:${deploymentId}`;
	const existing = inflight.get(key);
	if (existing) return existing;
	const p = runDeploymentCheck(db, deploymentId).finally(() => inflight.delete(key));
	inflight.set(key, p);
	return p;
}

async function tick(): Promise<void> {
	const db = await getDb();
	const now = nowIso();
	const cfg = getConfig();

	const dueSources = db.prepare('SELECT id FROM release_sources WHERE next_check_at <= ?').all(now) as { id: string }[];
	const dueDeployments = db.prepare('SELECT id FROM deployments WHERE next_check_at <= ?').all(now) as { id: string }[];

	const concurrency = cfg.polling.concurrency;
	await runPool(dueSources, concurrency, (s) => refreshSourceNow(db, s.id));
	await runPool(dueDeployments, concurrency, (d) => refreshDeploymentNow(db, d.id));
}

export function startPoller(): void {
	const globalRef = globalThis as { __radar_poller_started?: boolean };
	if (globalRef.__radar_poller_started) return;
	globalRef.__radar_poller_started = true;

	const cfg = getConfig();
	const tickMs = cfg.polling.tick_s * 1000;

	// Run one tick immediately, then every interval.
	void tick();
	const timer = setInterval(() => void tick(), tickMs);
	timer.unref();
}
