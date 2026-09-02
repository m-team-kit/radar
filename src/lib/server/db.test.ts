import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDb, runDataMigrations } from './db';
import {
	buildServiceView,
	createDeployment,
	createService,
	createSource,
	deploymentLag,
	getDeployment,
	getSource,
	listServicesForUser,
	recordSourceVersions,
	reportDeploymentVersion
} from './repos';
import type { SourceConfig } from '$lib/types';

let dir: string;

beforeAll(() => {
	dir = mkdtempSync(join(tmpdir(), 'radar-db-test-'));
	const config = {
		server: { base_url: 'http://localhost:3000' },
		db: { path: join(dir, 'test.db') },
		oidc: {
			issuer: 'https://issuer.example.com',
			client_id: 'c',
			redirect_uri: 'http://localhost:3000/auth/callback'
		},
		session: { secret: 'a'.repeat(40) },
		polling: { tick_s: 5, concurrency: 10, default_source_interval_s: 3600, default_deployment_interval_s: 3600 }
	};
	writeFileSync(join(dir, 'config.yaml'), JSON.stringify(config));
	process.env.RADAR_CONFIG = join(dir, 'config.yaml');
});

afterAll(() => {
	rmSync(dir, { recursive: true, force: true });
	delete process.env.RADAR_CONFIG;
});

describe('repos integration', () => {
	it('creates a service, source and deployment, records versions, and computes lag', async () => {
		const db = await getDb();
		const user = { sub: 'u1', email: 'u1@example.com', name: 'U1', groups: [] };

		const svc = createService(db, { name: 'My API', description: '', owner_sub: user.sub });

		const source = createSource(db, svc.id, {
			name: 'releases',
			type: 'github',
			config: { type: 'github', owner: 'o', repo: 'r' } as SourceConfig,
			include_prereleases: false,
			full_versions_only: true,
			poll_interval_s: 60
		});

		recordSourceVersions(db, getSource(db, source.id)!, ['1.0.0', '1.1.0', '1.2.0-rc.1']);
		const updated = getSource(db, source.id)!;
		expect(updated.latest_version).toBe('1.1.0');
		expect(updated.versions).toEqual(['1.1.0', '1.0.0']);

		const dep = createDeployment(db, svc.id, {
			name: 'prod',
			release_source_id: source.id,
			query: { type: 'manual' },
			poll_interval_s: 60,
			notify_enabled: false,
			notify_emails: [],
			notify_groups: [],
			notify_webhook: ''
		});
		reportDeploymentVersion(db, dep.id, '1.0.0');

		const depView = getDeployment(db, dep.id)!;
		const lag = deploymentLag(db, depView, getSource(db, source.id)!);
		expect(lag.update_available).toBe(true);
		expect(lag.behind).toBe(1);
		expect(lag.latest).toBe('1.1.0');

		const visible = listServicesForUser(db, user);
		expect(visible.map((s) => s.id)).toContain(svc.id);

		const view = buildServiceView(db, svc.id, user);
		expect(view?.role).toBe('editor');
		expect(view?.deployments[0].current_version).toBe('1.0.0');
	});

	it('hides services not shared with the user', async () => {
		const db = await getDb();
		const owner = { sub: 'u2', email: 'u2@example.com', name: 'U2', groups: [] };
		const stranger = { sub: 'u3', email: 'u3@example.com', name: 'U3', groups: ['team-a'] };

		const svc = createService(db, { name: 'Private', description: '', owner_sub: owner.sub });
		const visible = listServicesForUser(db, stranger);
		expect(visible.map((s) => s.id)).not.toContain(svc.id);
		expect(buildServiceView(db, svc.id, stranger)).toBeNull();
	});

	it('computes lag for prerelease-newer and v-prefixed deployments', async () => {
		const db = await getDb();
		const user = { sub: 'u4', email: 'u4@example.com', name: 'U4', groups: [] };

		const svc = createService(db, { name: 'Lag', description: '', owner_sub: user.sub });
		const source = createSource(db, svc.id, {
			name: 'rel',
			type: 'github',
			config: { type: 'github', owner: 'o', repo: 'r' } as SourceConfig,
			include_prereleases: false,
			full_versions_only: true,
			poll_interval_s: 60
		});

		recordSourceVersions(db, getSource(db, source.id)!, [
			'v0.9.1',
			'v0.10.0',
			'v0.11.0',
			'v0.12.0-pr93',
			'v0.11.1-pr21'
		]);
		const src = getSource(db, source.id)!;
		expect(src.latest_version).toBe('0.11.0');
		expect(src.versions).toEqual(['0.11.0', '0.10.0', '0.9.1']);

		const dep = (version: string) => {
			const d = createDeployment(db, svc.id, {
				name: `dep-${version}`,
				release_source_id: source.id,
				query: { type: 'manual' },
				poll_interval_s: 60,
				notify_enabled: false,
				notify_emails: [],
				notify_groups: [],
				notify_webhook: ''
			});
			reportDeploymentVersion(db, d.id, version);
			return getDeployment(db, d.id)!;
		};

		const old = deploymentLag(db, dep('0.9.1'), src);
		expect(old.update_available).toBe(true);
		expect(old.behind).toBe(2);
		expect(old.ahead).toBe(false);

		const prereleaseNewer = deploymentLag(db, dep('0.12.0-pr93'), src);
		expect(prereleaseNewer.update_available).toBe(false);
		expect(prereleaseNewer.behind).toBe(0);
		expect(prereleaseNewer.ahead).toBe(true);

		const minorNewer = deploymentLag(db, dep('0.11.1-pr21'), src);
		expect(minorNewer.update_available).toBe(false);
		expect(minorNewer.ahead).toBe(true);

		const upToDate = deploymentLag(db, dep('v0.11.0'), src);
		expect(upToDate.update_available).toBe(false);
		expect(upToDate.behind).toBe(0);
		expect(upToDate.ahead).toBe(false);
	});

	it('normalizes and dedups versions at ingest', async () => {
		const db = await getDb();
		const user = { sub: 'u5', email: 'u5@example.com', name: 'U5', groups: [] };

		const svc = createService(db, { name: 'Norm', description: '', owner_sub: user.sub });
		const source = createSource(db, svc.id, {
			name: 'rel',
			type: 'github',
			config: { type: 'github', owner: 'o', repo: 'r' } as SourceConfig,
			include_prereleases: false,
			full_versions_only: true,
			poll_interval_s: 60
		});

		recordSourceVersions(db, getSource(db, source.id)!, ['v0.11.0', '0.11.0', 'v0.10.0']);
		const src = getSource(db, source.id)!;
		expect(src.latest_version).toBe('0.11.0');
		expect(src.versions).toEqual(['0.11.0', '0.10.0']);

		const d = createDeployment(db, svc.id, {
			name: 'prod',
			release_source_id: source.id,
			query: { type: 'manual' },
			poll_interval_s: 60,
			notify_enabled: false,
			notify_emails: [],
			notify_groups: [],
			notify_webhook: ''
		});
		reportDeploymentVersion(db, d.id, 'v0.11.0');
		expect(getDeployment(db, d.id)!.current_version).toBe('0.11.0');
	});

	it('filters alias tags when full_versions_only is enabled', async () => {
		const db = await getDb();
		const user = { sub: 'u6', email: 'u6@example.com', name: 'U6', groups: [] };
		const svc = createService(db, { name: 'Aliases', description: '', owner_sub: user.sub });

		const strict = createSource(db, svc.id, {
			name: 'strict',
			type: 'github',
			config: { type: 'github', owner: 'o', repo: 'r' } as SourceConfig,
			include_prereleases: false,
			full_versions_only: true,
			poll_interval_s: 60
		});
		recordSourceVersions(db, getSource(db, strict.id)!, ['v0.8.1', 'v0.8', 'latest', 'unstable', 'v0.5', '0.12.0']);
		const s1 = getSource(db, strict.id)!;
		expect(s1.latest_version).toBe('0.12.0');
		expect(s1.versions).toEqual(['0.12.0', '0.8.1']);

		const loose = createSource(db, svc.id, {
			name: 'loose',
			type: 'github',
			config: { type: 'github', owner: 'o', repo: 'r' } as SourceConfig,
			include_prereleases: false,
			full_versions_only: false,
			poll_interval_s: 60
		});
		recordSourceVersions(db, getSource(db, loose.id)!, ['v0.8.1', 'v0.8', 'latest', 'unstable']);
		const s2 = getSource(db, loose.id)!;
		expect(s2.latest_version).toBe('0.8.1');
		expect(s2.versions[0]).toBe('0.8.1');
		expect(s2.versions).toContain('latest');
		expect(s2.versions).toContain('unstable');
		expect(s2.versions).toContain('v0.8');
	});
});

describe('normalize-v-prefix migration', () => {
	it('normalizes and dedups existing rows once', () => {
		const path = join(dir, 'mig.db');
		const db = new Database(path);
		db.exec(`
			CREATE TABLE release_sources (id TEXT PRIMARY KEY, type TEXT, include_prereleases INTEGER, full_versions_only INTEGER DEFAULT 1, latest_version TEXT, versions_json TEXT);
			CREATE TABLE deployments (id TEXT PRIMARY KEY, release_source_id TEXT, current_version TEXT);
			CREATE TABLE source_version_history (id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT, version TEXT, first_seen_at TEXT);
			CREATE TABLE deployment_version_history (id INTEGER PRIMARY KEY AUTOINCREMENT, deployment_id TEXT, version TEXT, observed_at TEXT);
		`);
		db.prepare(
			"INSERT INTO release_sources (id, type, include_prereleases, latest_version, versions_json) VALUES ('s1','github',0,'v0.11.0','[\"v0.11.0\",\"0.11.0\",\"v0.10.0\"]')"
		).run();
		db.prepare("INSERT INTO deployments (id, release_source_id, current_version) VALUES ('d1','s1','v0.9.1')").run();
		db.prepare(
			"INSERT INTO source_version_history (source_id, version, first_seen_at) VALUES ('s1','v0.11.0','2026-01-01T00:00:00Z'), ('s1','0.11.0','2026-01-02T00:00:00Z'), ('s1','v0.10.0','2026-01-03T00:00:00Z')"
		).run();
		db.prepare(
			"INSERT INTO deployment_version_history (deployment_id, version, observed_at) VALUES ('d1','v0.9.1','2026-02-01T00:00:00Z')"
		).run();

		runDataMigrations(db);

		const src = db.prepare('SELECT latest_version, versions_json FROM release_sources WHERE id = ?').get('s1') as {
			latest_version: string;
			versions_json: string;
		};
		expect(src.latest_version).toBe('0.11.0');
		expect(JSON.parse(src.versions_json)).toEqual(['0.11.0', '0.10.0']);
		expect(
			db
				.prepare('SELECT version FROM source_version_history')
				.all()
				.map((r) => (r as { version: string }).version)
		).toEqual(['0.11.0', '0.10.0']);
		const depRow = db.prepare('SELECT current_version FROM deployments WHERE id = ?').get('d1') as {
			current_version: string;
		};
		expect(depRow.current_version).toBe('0.9.1');
		const dvhRow = db
			.prepare('SELECT version FROM deployment_version_history WHERE deployment_id = ?')
			.get('d1') as { version: string };
		expect(dvhRow.version).toBe('0.9.1');
		db.close();
		rmSync(path, { force: true });
	});

	it('drops alias tags from canonical data', () => {
		const path = join(dir, 'mig-alias.db');
		const db = new Database(path);
		db.exec(`
			CREATE TABLE release_sources (id TEXT PRIMARY KEY, type TEXT, include_prereleases INTEGER, full_versions_only INTEGER DEFAULT 1, latest_version TEXT, versions_json TEXT);
			CREATE TABLE deployments (id TEXT PRIMARY KEY, release_source_id TEXT, current_version TEXT);
			CREATE TABLE source_version_history (id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT, version TEXT, first_seen_at TEXT);
			CREATE TABLE deployment_version_history (id INTEGER PRIMARY KEY AUTOINCREMENT, deployment_id TEXT, version TEXT, observed_at TEXT);
		`);
		db.prepare(
			"INSERT INTO release_sources (id, type, include_prereleases, full_versions_only, latest_version, versions_json) VALUES ('s1','github',0,1,'v0.12.0','[\"v0.12.0\",\"v0.8.1\",\"v0.8\",\"latest\",\"unstable\"]')"
		).run();
		db.prepare(
			"INSERT INTO source_version_history (source_id, version, first_seen_at) VALUES ('s1','v0.12.0','2026-01-01T00:00:00Z'), ('s1','v0.8.1','2026-01-02T00:00:00Z'), ('s1','latest','2026-01-03T00:00:00Z'), ('s1','v0.8','2026-01-04T00:00:00Z')"
		).run();

		runDataMigrations(db);

		const src = db.prepare('SELECT latest_version, versions_json FROM release_sources WHERE id = ?').get('s1') as {
			latest_version: string;
			versions_json: string;
		};
		expect(src.latest_version).toBe('0.12.0');
		expect(JSON.parse(src.versions_json)).toEqual(['0.12.0', '0.8.1']);
		expect(
			db
				.prepare('SELECT version FROM source_version_history')
				.all()
				.map((r) => (r as { version: string }).version)
		).toEqual(['0.12.0', '0.8.1']);
		db.close();
		rmSync(path, { force: true });
	});

	it('runs only once', () => {
		const path = join(dir, 'mig2.db');
		const db = new Database(path);
		db.exec(`
			CREATE TABLE release_sources (id TEXT PRIMARY KEY, type TEXT, include_prereleases INTEGER, full_versions_only INTEGER DEFAULT 1, latest_version TEXT, versions_json TEXT);
			CREATE TABLE deployments (id TEXT PRIMARY KEY, release_source_id TEXT, current_version TEXT);
			CREATE TABLE source_version_history (id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT, version TEXT, first_seen_at TEXT);
			CREATE TABLE deployment_version_history (id INTEGER PRIMARY KEY AUTOINCREMENT, deployment_id TEXT, version TEXT, observed_at TEXT);
		`);
		runDataMigrations(db);
		runDataMigrations(db);
		const applied = db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as { n: number };
		expect(applied.n).toBe(2);
		db.close();
		rmSync(path, { force: true });
	});
});
