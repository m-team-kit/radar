import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { getConfig } from './config';
import { getVersionKind, isCanonicalVersion, normalizeVersion, sortNewestFirst } from '$lib/versions';

let db: Database.Database | undefined;
let initPromise: Promise<Database.Database> | undefined;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS known_users (
  sub TEXT PRIMARY KEY,
  email TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  groups TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner_sub TEXT NOT NULL,
  logo_url TEXT,
  logo_data BLOB,
  logo_mime TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS service_shares (
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  group_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('viewer','editor')),
  PRIMARY KEY (service_id, group_name)
);

CREATE TABLE IF NOT EXISTS release_sources (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  config TEXT NOT NULL,
  include_prereleases INTEGER NOT NULL DEFAULT 0,
  full_versions_only INTEGER NOT NULL DEFAULT 1,
  poll_interval_s INTEGER NOT NULL DEFAULT 3600,
  latest_version TEXT,
  versions_json TEXT NOT NULL DEFAULT '[]',
  last_checked_at TEXT,
  last_error TEXT,
  next_check_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deployments (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  release_source_id TEXT REFERENCES release_sources(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  query_json TEXT NOT NULL,
  poll_interval_s INTEGER NOT NULL DEFAULT 3600,
  current_version TEXT,
  last_check_at TEXT,
  last_error TEXT,
  last_change_at TEXT,
  notify_enabled INTEGER NOT NULL DEFAULT 0,
  notify_emails TEXT NOT NULL DEFAULT '[]',
  notify_groups TEXT NOT NULL DEFAULT '[]',
  notify_webhook TEXT NOT NULL DEFAULT '',
  last_notified_version TEXT,
  report_token TEXT,
  next_check_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_version_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL REFERENCES release_sources(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  first_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_svh_source ON source_version_history(source_id);

CREATE TABLE IF NOT EXISTS deployment_version_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deployment_id TEXT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  observed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dvh_deployment ON deployment_version_history(deployment_id);

CREATE TABLE IF NOT EXISTS notification_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deployment_id TEXT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES release_sources(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  channels TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_deployment ON notification_events(deployment_id);

CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);
`;

const ADDITIVE_MIGRATIONS: { table: string; column: string; definition: string }[] = [
	{ table: 'services', column: 'logo_url', definition: 'TEXT' },
	{ table: 'services', column: 'logo_data', definition: 'BLOB' },
	{ table: 'services', column: 'logo_mime', definition: 'TEXT' },
	{ table: 'release_sources', column: 'full_versions_only', definition: 'INTEGER NOT NULL DEFAULT 1' }
];

/** Add columns to existing tables (CREATE TABLE IF NOT EXISTS won't alter them). */
function runMigrations(instance: Database.Database): void {
	for (const m of ADDITIVE_MIGRATIONS) {
		const cols = instance.prepare(`PRAGMA table_info(${m.table})`).all() as { name: string }[];
		if (!cols.some((c) => c.name === m.column)) {
			instance.exec(`ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.definition}`);
		}
	}
}

/** Normalize version strings (strip leading "v") and dedup across existing rows. */
function migrateNormalizeVPrefix(instance: Database.Database): void {
	const sourceTypes = new Map<string, string>();
	for (const row of instance.prepare('SELECT id, type FROM release_sources').all() as { id: string; type: string }[]) {
		sourceTypes.set(row.id, row.type);
	}
	const sourceKind = (sourceId: string) => getVersionKind(sourceTypes.get(sourceId) ?? 'semver');
	const deploymentKind = new Map<string, 'semver' | 'debian'>();
	for (const row of instance.prepare('SELECT id, release_source_id FROM deployments').all() as {
		id: string;
		release_source_id: string | null;
	}[]) {
		const type = row.release_source_id ? sourceTypes.get(row.release_source_id) : undefined;
		deploymentKind.set(row.id, getVersionKind(type ?? 'semver'));
	}

	// source_version_history: normalize + keep earliest row per (source, version)
	const svh = instance
		.prepare('SELECT id, source_id, version, first_seen_at FROM source_version_history')
		.all() as { id: number; source_id: string; version: string; first_seen_at: string }[];
	const keepSvh = new Map<string, { id: number; version: string; first_seen_at: string }>();
	for (const r of svh) {
		const nv = normalizeVersion(r.version, sourceKind(r.source_id));
		const key = `${r.source_id}\u0000${nv}`;
		const existing = keepSvh.get(key);
		if (!existing || r.first_seen_at < existing.first_seen_at) {
			keepSvh.set(key, { id: r.id, version: nv, first_seen_at: r.first_seen_at });
		}
	}
	const updSvh = instance.prepare('UPDATE source_version_history SET version = ? WHERE id = ?');
	const delSvh = instance.prepare('DELETE FROM source_version_history WHERE id = ?');
	for (const r of svh) {
		const key = `${r.source_id}\u0000${normalizeVersion(r.version, sourceKind(r.source_id))}`;
		const kept = keepSvh.get(key)!;
		if (kept.id === r.id) {
			if (r.version !== kept.version) updSvh.run(kept.version, r.id);
		} else {
			delSvh.run(r.id);
		}
	}

	// deployment_version_history: same, keyed by (deployment, version)
	const dvh = instance
		.prepare('SELECT id, deployment_id, version, observed_at FROM deployment_version_history')
		.all() as { id: number; deployment_id: string; version: string; observed_at: string }[];
	const keepDvh = new Map<string, { id: number; version: string; observed_at: string }>();
	for (const r of dvh) {
		const nv = normalizeVersion(r.version, deploymentKind.get(r.deployment_id) ?? 'semver');
		const key = `${r.deployment_id}\u0000${nv}`;
		const existing = keepDvh.get(key);
		if (!existing || r.observed_at < existing.observed_at) {
			keepDvh.set(key, { id: r.id, version: nv, observed_at: r.observed_at });
		}
	}
	const updDvh = instance.prepare('UPDATE deployment_version_history SET version = ? WHERE id = ?');
	const delDvh = instance.prepare('DELETE FROM deployment_version_history WHERE id = ?');
	for (const r of dvh) {
		const key = `${r.deployment_id}\u0000${normalizeVersion(r.version, deploymentKind.get(r.deployment_id) ?? 'semver')}`;
		const kept = keepDvh.get(key)!;
		if (kept.id === r.id) {
			if (r.version !== kept.version) updDvh.run(kept.version, r.id);
		} else {
			delDvh.run(r.id);
		}
	}

	// release_sources: rebuild versions_json (normalize + dedup + sort) and latest_version
	const srcRows = instance
		.prepare('SELECT id, type, include_prereleases, latest_version, versions_json FROM release_sources')
		.all() as { id: string; type: string; include_prereleases: number; latest_version: string | null; versions_json: string }[];
	const updSrc = instance.prepare('UPDATE release_sources SET latest_version = ?, versions_json = ? WHERE id = ?');
	for (const s of srcRows) {
		const kind = getVersionKind(s.type);
		let raw: string[] = [];
		try {
			raw = JSON.parse(s.versions_json) as string[];
		} catch {
			// leave as-is if unparseable
		}
		const rebuilt = sortNewestFirst([...new Set(raw.map((v) => normalizeVersion(v, kind)))], kind, s.include_prereleases === 1);
		updSrc.run(rebuilt.length > 0 ? rebuilt[0] : null, JSON.stringify(rebuilt), s.id);
	}

	// deployments: normalize current_version
	const depRows = instance
		.prepare('SELECT id, release_source_id, current_version FROM deployments')
		.all() as { id: string; release_source_id: string | null; current_version: string | null }[];
	const updDep = instance.prepare('UPDATE deployments SET current_version = ? WHERE id = ?');
	for (const d of depRows) {
		if (d.current_version) {
			updDep.run(normalizeVersion(d.current_version, deploymentKind.get(d.id) ?? 'semver'), d.id);
		}
	}
}

/** Remove floating/alias tags (latest, unstable, short "v0.8") from canonical data. */
function migrateDropAliasTags(instance: Database.Database): void {
	const srcMeta = new Map<string, { type: string; full: boolean }>();
	for (const s of instance.prepare('SELECT id, type, full_versions_only FROM release_sources').all() as {
		id: string;
		type: string;
		full_versions_only: number;
	}[]) {
		srcMeta.set(s.id, { type: s.type, full: s.full_versions_only === 1 });
	}

	const del = instance.prepare('DELETE FROM source_version_history WHERE id = ?');
	const rows = instance
		.prepare('SELECT id, source_id, version FROM source_version_history')
		.all() as { id: number; source_id: string; version: string }[];
	for (const r of rows) {
		const meta = srcMeta.get(r.source_id);
		if (meta?.full) {
			const kind = getVersionKind(meta.type);
			if (!isCanonicalVersion(r.version, kind)) del.run(r.id);
		}
	}

	const srcs = instance
		.prepare('SELECT id, type, include_prereleases, versions_json FROM release_sources')
		.all() as { id: string; type: string; include_prereleases: number; versions_json: string }[];
	const upd = instance.prepare('UPDATE release_sources SET latest_version = ?, versions_json = ? WHERE id = ?');
	for (const s of srcs) {
		const meta = srcMeta.get(s.id);
		if (!meta?.full) continue;
		const kind = getVersionKind(meta.type);
		let raw: string[] = [];
		try {
			raw = JSON.parse(s.versions_json) as string[];
		} catch {
			// unparseable, leave as-is
		}
		const canonical = [...new Set(raw.filter((v) => isCanonicalVersion(v, kind)).map((v) => normalizeVersion(v, kind)))];
		const rebuilt = sortNewestFirst(canonical, kind, s.include_prereleases === 1);
		upd.run(rebuilt.length > 0 ? rebuilt[0] : null, JSON.stringify(rebuilt), s.id);
	}
}

const DATA_MIGRATIONS: { name: string; run: (db: Database.Database) => void }[] = [
	{ name: 'normalize-v-prefix', run: migrateNormalizeVPrefix },
	{ name: 'drop-alias-tags', run: migrateDropAliasTags }
];

/** Run one-time data migrations (guarded by the schema_migrations table). */
export function runDataMigrations(instance: Database.Database): void {
	instance.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
	const applied = new Set(
		(instance.prepare('SELECT name FROM schema_migrations').all() as { name: string }[]).map((r) => r.name)
	);
	const record = instance.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)');
	for (const m of DATA_MIGRATIONS) {
		if (applied.has(m.name)) continue;
		m.run(instance);
		record.run(m.name, new Date().toISOString());
	}
}

export async function getDb(): Promise<Database.Database> {
	if (db) return db;
	if (initPromise) return initPromise;

	initPromise = (async () => {
		const cfg = getConfig();
		const path = resolve(cfg.db.path);
		mkdirSync(dirname(path), { recursive: true });
		const instance = new Database(path);
		instance.pragma('journal_mode = WAL');
		instance.pragma('foreign_keys = ON');
		instance.exec(SCHEMA);
		runMigrations(instance);
		runDataMigrations(instance);
		db = instance;
		return instance;
	})();

	return initPromise;
}

export function nowIso(): string {
	return new Date().toISOString();
}

export function newId(): string {
	return crypto.randomUUID();
}
