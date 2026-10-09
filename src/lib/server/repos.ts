import type Database from 'better-sqlite3';
import { nowIso, newId } from './db';
import { compareVersions, isCanonicalVersion, normalizeVersion, sortNewestFirst, pickLatest, getVersionKind } from '$lib/versions';
import type {
	AccessLevel,
	DeploymentLag,
	DeploymentQuery,
	DeploymentRow,
	DeploymentView,
	KnownUserRow,
	ReleaseSourceRow,
	ReleaseSourceView,
	ServiceRow,
	ServiceShareRow,
	ServiceView,
	ShareRole,
	SourceConfig,
	SourceType
} from '$lib/types';

function parse<T>(json: string): T {
	return JSON.parse(json) as T;
}

function parseDeployment(row: DeploymentRow): DeploymentView {
	return {
		...row,
		query: parse<DeploymentQuery>(row.query_json),
		notify_emails_list: parse<string[]>(row.notify_emails),
		notify_groups_list: parse<string[]>(row.notify_groups)
	};
}

function parseSource(row: ReleaseSourceRow): ReleaseSourceView {
	return {
		...row,
		parsed_config: parse<SourceConfig>(row.config),
		versions: parse<string[]>(row.versions_json)
	};
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export function upsertKnownUser(
	db: Database.Database,
	user: { sub: string; email: string; name: string; groups: string[] }
): void {
	db.prepare(
		`INSERT INTO known_users (sub, email, name, groups, updated_at)
		 VALUES (@sub, @email, @name, @groups, @updated_at)
		 ON CONFLICT(sub) DO UPDATE SET
		   email = @email, name = @name, groups = @groups, updated_at = @updated_at`
	).run({
		sub: user.sub,
		email: user.email,
		name: user.name,
		groups: JSON.stringify(user.groups),
		updated_at: nowIso()
	});
}

export function getUser(db: Database.Database, sub: string): KnownUserRow | null {
	return (db.prepare('SELECT * FROM known_users WHERE sub = ?').get(sub) as KnownUserRow | undefined) ?? null;
}

// ---------------------------------------------------------------------------
// Access control
// ---------------------------------------------------------------------------

export function serviceAccess(db: Database.Database, user: { sub: string; groups: string[] }, serviceId: string): AccessLevel {
	const service = db.prepare('SELECT * FROM services WHERE id = ?').get(serviceId) as ServiceRow | undefined;
	if (!service) return { access: 'none' };
	if (service.owner_sub === user.sub) return { access: 'editor' };

	const shares = db
		.prepare('SELECT * FROM service_shares WHERE service_id = ? AND group_name IN (SELECT json_each.value FROM json_each(?))')
		.all(serviceId, JSON.stringify(user.groups)) as ServiceShareRow[];

	if (shares.some((s) => s.role === 'editor')) return { access: 'editor' };
	if (shares.length > 0) return { access: 'viewer' };
	return { access: 'none' };
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export function listServicesForUser(db: Database.Database, user: { sub: string; groups: string[] }): ServiceRow[] {
	return db
		.prepare(
			`SELECT DISTINCT s.* FROM services s
			 WHERE s.owner_sub = ?
			    OR s.id IN (
			       SELECT sh.service_id FROM service_shares sh
			       WHERE sh.group_name IN (SELECT json_each.value FROM json_each(?))
			    )
			 ORDER BY s.name COLLATE NOCASE`
		)
		.all(user.sub, JSON.stringify(user.groups)) as ServiceRow[];
}

export function getService(db: Database.Database, id: string): ServiceRow | null {
	return (db.prepare('SELECT * FROM services WHERE id = ?').get(id) as ServiceRow | undefined) ?? null;
}

export function buildServiceView(
	db: Database.Database,
	serviceId: string,
	user: { sub: string; groups: string[] }
): ServiceView | null {
	const service = getService(db, serviceId);
	if (!service) return null;
	const access = serviceAccess(db, user, service.id);
	if (access.access === 'none') return null;
	const role = access.access === 'editor' ? 'editor' : 'viewer';
	const sources = listSources(db, serviceId);
	const deployments = listDeployments(db, serviceId).map((d) => {
		const source = d.release_source_id ? (sources.find((s) => s.id === d.release_source_id) ?? null) : null;
		return { ...d, lag: deploymentLag(db, d, source) };
	});
	// logo_data is served through its own endpoint; don't ship it in the payload.
	const { logo_data, ...rest } = service;
	return { ...rest, has_logo: logo_data != null, role, sources, deployments };
}

export function createService(
	db: Database.Database,
	input: { name: string; description: string; owner_sub: string; logo_url?: string | null }
): ServiceRow {
	const id = newId();
	const ts = nowIso();
	db.prepare(
		'INSERT INTO services (id, name, description, owner_sub, logo_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
	).run(id, input.name, input.description, input.owner_sub, input.logo_url ?? null, ts, ts);
	return getService(db, id)!;
}

export function updateService(db: Database.Database, id: string, input: { name: string; description: string }): void {
	db.prepare('UPDATE services SET name = ?, description = ?, updated_at = ? WHERE id = ?').run(
		input.name,
		input.description,
		nowIso(),
		id
	);
}

export function deleteService(db: Database.Database, id: string): void {
	db.prepare('DELETE FROM services WHERE id = ?').run(id);
}

export function listShares(db: Database.Database, serviceId: string): ServiceShareRow[] {
	return db.prepare('SELECT * FROM service_shares WHERE service_id = ? ORDER BY group_name').all(serviceId) as ServiceShareRow[];
}

export function setServiceLogoUrl(db: Database.Database, serviceId: string, url: string | null): void {
	db.prepare('UPDATE services SET logo_url = ?, updated_at = ? WHERE id = ?').run(url, nowIso(), serviceId);
}

export function setServiceLogoData(db: Database.Database, serviceId: string, data: Buffer, mime: string): void {
	db.prepare('UPDATE services SET logo_data = ?, logo_mime = ?, updated_at = ? WHERE id = ?').run(data, mime, nowIso(), serviceId);
}

export function clearServiceLogo(db: Database.Database, serviceId: string): void {
	db.prepare('UPDATE services SET logo_url = NULL, logo_data = NULL, logo_mime = NULL, updated_at = ? WHERE id = ?').run(
		nowIso(),
		serviceId
	);
}

export function getServiceLogo(db: Database.Database, serviceId: string): { data: Buffer; mime: string } | null {
	const row = db
		.prepare('SELECT logo_data, logo_mime FROM services WHERE id = ?')
		.get(serviceId) as { logo_data: Uint8Array | null; logo_mime: string | null } | undefined;
	if (!row?.logo_data || !row.logo_mime) return null;
	return { data: Buffer.from(row.logo_data), mime: row.logo_mime };
}

export function setShares(db: Database.Database, serviceId: string, shares: { group_name: string; role: ShareRole }[]): void {
	const del = db.prepare('DELETE FROM service_shares WHERE service_id = ?');
	const ins = db.prepare('INSERT OR REPLACE INTO service_shares (service_id, group_name, role) VALUES (?, ?, ?)');
	db.transaction(() => {
		del.run(serviceId);
		for (const s of shares) ins.run(serviceId, s.group_name, s.role);
	})();
}

// ---------------------------------------------------------------------------
// Release sources
// ---------------------------------------------------------------------------

export function listSources(db: Database.Database, serviceId: string): ReleaseSourceView[] {
	return (
		db
			.prepare('SELECT * FROM release_sources WHERE service_id = ? ORDER BY name COLLATE NOCASE')
			.all(serviceId) as ReleaseSourceRow[]
	).map(parseSource);
}

export function getSource(db: Database.Database, id: string): ReleaseSourceView | null {
	const row = db.prepare('SELECT * FROM release_sources WHERE id = ?').get(id) as ReleaseSourceRow | undefined;
	return row ? parseSource(row) : null;
}

export interface SourceInput {
	name: string;
	type: SourceType;
	config: SourceConfig;
	include_prereleases: boolean;
	full_versions_only: boolean;
	poll_interval_s: number;
}

export function createSource(db: Database.Database, serviceId: string, input: SourceInput): ReleaseSourceRow {
	const id = newId();
	const ts = nowIso();
	db.prepare(
		`INSERT INTO release_sources (id, service_id, name, type, config, include_prereleases, full_versions_only, poll_interval_s, latest_version, versions_json, next_check_at, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	).run(
		id,
		serviceId,
		input.name,
		input.type,
		JSON.stringify(input.config),
		input.include_prereleases ? 1 : 0,
		input.full_versions_only ? 1 : 0,
		input.poll_interval_s,
		null,
		'[]',
		ts,
		ts,
		ts
	);
	return getSource(db, id)!;
}

export function updateSource(db: Database.Database, id: string, input: Partial<SourceInput>): void {
	const current = getSource(db, id)!;
	const next = {
		name: input.name ?? current.name,
		type: input.type ?? current.type,
		config: input.config ?? current.parsed_config,
		include_prereleases: input.include_prereleases ?? current.include_prereleases,
		full_versions_only: input.full_versions_only ?? current.full_versions_only,
		poll_interval_s: input.poll_interval_s ?? current.poll_interval_s
	};
	const ts = nowIso();
	db.prepare(
		`UPDATE release_sources SET name = ?, type = ?, config = ?, include_prereleases = ?, full_versions_only = ?, poll_interval_s = ?, updated_at = ?, next_check_at = ? WHERE id = ?`
	).run(
		next.name,
		next.type,
		JSON.stringify(next.config),
		next.include_prereleases ? 1 : 0,
		next.full_versions_only ? 1 : 0,
		next.poll_interval_s,
		ts,
		ts,
		id
	);
}

export function deleteSource(db: Database.Database, id: string): void {
	db.prepare('DELETE FROM release_sources WHERE id = ?').run(id);
}

// ---------------------------------------------------------------------------
// Deployments
// ---------------------------------------------------------------------------

export function listDeployments(db: Database.Database, serviceId: string): DeploymentView[] {
	return (
		db
			.prepare('SELECT * FROM deployments WHERE service_id = ? ORDER BY name COLLATE NOCASE')
			.all(serviceId) as DeploymentRow[]
	).map(parseDeployment);
}

export function getDeployment(db: Database.Database, id: string): DeploymentView | null {
	const row = db.prepare('SELECT * FROM deployments WHERE id = ?').get(id) as DeploymentRow | undefined;
	return row ? parseDeployment(row) : null;
}

export interface DeploymentInput {
	name: string;
	release_source_id: string | null;
	query: DeploymentQuery;
	poll_interval_s: number;
	notify_enabled: boolean;
	notify_emails: string[];
	notify_groups: string[];
	notify_webhook: string;
}

export function createDeployment(db: Database.Database, serviceId: string, input: DeploymentInput): DeploymentRow {
	const id = newId();
	const ts = nowIso();
	const reportToken = input.query.type === 'manual' ? crypto.randomUUID().replace(/-/g, '') : null;
	db.prepare(
		`INSERT INTO deployments (id, service_id, release_source_id, name, query_json, poll_interval_s,
		   notify_enabled, notify_emails, notify_groups, notify_webhook, report_token, next_check_at, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	).run(
		id,
		serviceId,
		input.release_source_id,
		input.name,
		JSON.stringify(input.query),
		input.poll_interval_s,
		input.notify_enabled ? 1 : 0,
		JSON.stringify(input.notify_emails),
		JSON.stringify(input.notify_groups),
		input.notify_webhook,
		reportToken,
		ts,
		ts,
		ts
	);
	return getDeployment(db, id)!;
}

export function updateDeployment(db: Database.Database, id: string, input: Partial<DeploymentInput>): void {
	const current = getDeployment(db, id)!;
	const next: DeploymentInput = {
		name: input.name ?? current.name,
		release_source_id: input.release_source_id !== undefined ? input.release_source_id : current.release_source_id,
		query: input.query ?? current.query,
		poll_interval_s: input.poll_interval_s ?? current.poll_interval_s,
		notify_enabled: input.notify_enabled ?? current.notify_enabled,
		notify_emails: input.notify_emails ?? current.notify_emails_list,
		notify_groups: input.notify_groups ?? current.notify_groups_list,
		notify_webhook: input.notify_webhook ?? current.notify_webhook
	};
	const reportToken =
		next.query.type === 'manual' ? current.report_token ?? crypto.randomUUID().replace(/-/g, '') : null;
	const ts = nowIso();
	db.prepare(
		`UPDATE deployments SET name = ?, release_source_id = ?, query_json = ?, poll_interval_s = ?,
		   notify_enabled = ?, notify_emails = ?, notify_groups = ?, notify_webhook = ?, report_token = ?, updated_at = ?, next_check_at = ?
		 WHERE id = ?`
	).run(
		next.name,
		next.release_source_id,
		JSON.stringify(next.query),
		next.poll_interval_s,
		next.notify_enabled ? 1 : 0,
		JSON.stringify(next.notify_emails),
		JSON.stringify(next.notify_groups),
		next.notify_webhook,
		reportToken,
		ts,
		ts,
		id
	);
}

export function deleteDeployment(db: Database.Database, id: string): void {
	db.prepare('DELETE FROM deployments WHERE id = ?').run(id);
}

export function setDeploymentVersion(
	db: Database.Database,
	deploymentId: string,
	version: string | null,
	error: string | null
): { changed: boolean; previous: string | null } {
	const current = getDeployment(db, deploymentId)!;
	const source = current.release_source_id ? getSource(db, current.release_source_id) : null;
	const kind = source ? getVersionKind(source.type) : 'semver';
	const normalized = version === null ? null : normalizeVersion(version, kind);
	const changed = current.current_version !== normalized;
	const ts = nowIso();
	db.prepare(
		'UPDATE deployments SET current_version = ?, last_check_at = ?, last_error = ?, last_change_at = ?, next_check_at = ?, updated_at = ? WHERE id = ?'
	).run(normalized, ts, error, changed ? ts : current.last_change_at, isoAfterSeconds(current.poll_interval_s), ts, deploymentId);
	if (changed && normalized !== null) {
		db.prepare('INSERT INTO deployment_version_history (deployment_id, version, observed_at) VALUES (?, ?, ?)').run(
			deploymentId,
			normalized,
			ts
		);
	}
	return { changed, previous: current.current_version };
}

export function reportDeploymentVersion(db: Database.Database, deploymentId: string, version: string): void {
	setDeploymentVersion(db, deploymentId, version, null);
}

export function setDeploymentNotifiedVersion(db: Database.Database, deploymentId: string, version: string): void {
	db.prepare('UPDATE deployments SET last_notified_version = ? WHERE id = ?').run(version, deploymentId);
}

// ---------------------------------------------------------------------------
// Version recording / history
// ---------------------------------------------------------------------------

export function recordSourceVersions(
	db: Database.Database,
	source: ReleaseSourceView,
	rawVersions: string[]
): { latest: string | null; versions: string[] } {
	const kind = getVersionKind(source.type);
	const releases = source.full_versions_only ? rawVersions.filter((v) => isCanonicalVersion(v, kind)) : rawVersions;
	const normalized = releases.map((v) => normalizeVersion(v, kind));
	const versions = sortNewestFirst([...new Set(normalized)], kind, source.include_prereleases);
	const latest = pickLatest(versions, kind, source.include_prereleases);

	const ts = nowIso();
	const insertHistory = db.prepare(
		'INSERT OR IGNORE INTO source_version_history (source_id, version, first_seen_at) VALUES (?, ?, ?)'
	);
	const existing = db
		.prepare('SELECT version FROM source_version_history WHERE source_id = ?')
		.all(source.id) as { version: string }[];
	const seen = new Set(existing.map((r) => r.version));
	for (const v of versions) {
		if (!seen.has(v)) {
			insertHistory.run(source.id, v, ts);
			seen.add(v);
		}
	}

	db.prepare(
		`UPDATE release_sources SET latest_version = ?, versions_json = ?, last_checked_at = ?, last_error = NULL, next_check_at = ?, updated_at = ? WHERE id = ?`
	).run(latest, JSON.stringify(versions), ts, isoAfterSeconds(source.poll_interval_s), ts, source.id);

	return { latest, versions };
}

export function markSourceError(db: Database.Database, sourceId: string, error: string): void {
	const src = getSource(db, sourceId);
	const ts = nowIso();
	db.prepare(
		'UPDATE release_sources SET last_error = ?, last_checked_at = ?, next_check_at = ?, updated_at = ? WHERE id = ?'
	).run(error, ts, isoAfterSeconds(src?.poll_interval_s ?? 3600), ts, sourceId);
}

export function markDeploymentError(db: Database.Database, deploymentId: string, error: string): void {
	const dep = getDeployment(db, deploymentId);
	const ts = nowIso();
	db.prepare('UPDATE deployments SET last_error = ?, last_check_at = ?, next_check_at = ?, updated_at = ? WHERE id = ?').run(
		error,
		ts,
		isoAfterSeconds(dep?.poll_interval_s ?? 3600),
		ts,
		deploymentId
	);
}

// ---------------------------------------------------------------------------
// Lag
// ---------------------------------------------------------------------------

export function deploymentLag(db: Database.Database, deployment: DeploymentView, source: ReleaseSourceView | null): DeploymentLag {
	const latest = source?.latest_version ?? null;
	if (!source || !deployment.current_version || source.versions.length === 0) {
		return { behind: null, update_available: false, ahead: false, latest };
	}

	const kind = getVersionKind(source.type);
	const deployed = deployment.current_version;

	// How many cached source versions are strictly newer than the deployed one.
	const behind = source.versions.reduce((count, v) => (compareVersions(v, deployed, kind) > 0 ? count + 1 : count), 0);
	const ahead = latest !== null && deployed !== latest && compareVersions(deployed, latest, kind) > 0;

	return { behind, update_available: behind > 0, ahead, latest };
}

export function sourceHistory(db: Database.Database, sourceId: string): { version: string; first_seen_at: string }[] {
	return db
		.prepare('SELECT version, first_seen_at FROM source_version_history WHERE source_id = ? ORDER BY first_seen_at')
		.all(sourceId) as { version: string; first_seen_at: string }[];
}

export function deploymentHistory(db: Database.Database, deploymentId: string): { version: string; observed_at: string }[] {
	return db
		.prepare('SELECT version, observed_at FROM deployment_version_history WHERE deployment_id = ? ORDER BY observed_at')
		.all(deploymentId) as { version: string; observed_at: string }[];
}

export function isoAfterSeconds(seconds: number): string {
	return new Date(Date.now() + seconds * 1000).toISOString();
}
