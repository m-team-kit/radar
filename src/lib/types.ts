export type ShareRole = 'viewer' | 'editor';

export type SourceType = 'docker' | 'github' | 'pypi' | 'npm' | 'apt' | 'url';

export type VersionKind = 'semver' | 'debian';

export interface DockerSourceConfig {
	/** Registry host. Defaults to Docker Hub (registry-1.docker.io). */
	registry?: string;
	/** Repository, e.g. "library/nginx" or "myorg/app". */
	repository: string;
	/** Optional substring/prefix filter applied to tag names. */
	tagFilter?: string;
}

export interface GithubSourceConfig {
	owner: string;
	repo: string;
	/** Optional prefix required on tags, e.g. "v" or "release-". */
	tagPrefix?: string;
}

export interface PypiSourceConfig {
	package: string;
}

export interface NpmSourceConfig {
	/** Package name, e.g. "express" or "@scope/pkg". */
	package: string;
	/** Registry base URL. Defaults to https://registry.npmjs.org */
	registry?: string;
}

export interface AptSourceConfig {
	/** URL to a Packages index file (plain or .gz). */
	url: string;
	/** Package name to track. */
	package: string;
}

export interface UrlSourceConfig {
	url: string;
	/** Response shape. */
	kind: 'text' | 'json';
	/** Dotted path into a JSON response (when kind = json). */
	field?: string;
	/** Optional regex to extract the version from text. */
	versionRegex?: string;
}

export type SourceConfig =
	| ({ type: 'docker' } & DockerSourceConfig)
	| ({ type: 'github' } & GithubSourceConfig)
	| ({ type: 'pypi' } & PypiSourceConfig)
	| ({ type: 'npm' } & NpmSourceConfig)
	| ({ type: 'apt' } & AptSourceConfig)
	| ({ type: 'url' } & UrlSourceConfig);

export interface ReleaseSourceRow {
	id: string;
	service_id: string;
	name: string;
	type: SourceType;
	config: string;
	include_prereleases: boolean;
	/** Only treat full major.minor.patch versions as releases (ignore alias tags). */
	full_versions_only: boolean;
	poll_interval_s: number;
	latest_version: string | null;
	versions_json: string;
	last_checked_at: string | null;
	last_error: string | null;
	next_check_at: string;
}

export type DeploymentQuery =
	| { type: 'http'; url: string }
	| { type: 'http_json'; url: string; field: string }
	| { type: 'http_jwt'; url: string; field: string }
	| { type: 'manual' };

export interface DeploymentRow {
	id: string;
	service_id: string;
	release_source_id: string | null;
	name: string;
	query_json: string;
	poll_interval_s: number;
	current_version: string | null;
	last_check_at: string | null;
	last_error: string | null;
	last_change_at: string | null;
	notify_enabled: boolean;
	notify_emails: string;
	notify_groups: string;
	notify_webhook: string;
	last_notified_version: string | null;
	report_token: string | null;
	next_check_at: string;
}

export interface ServiceRow {
	id: string;
	name: string;
	description: string;
	owner_sub: string;
	logo_url: string | null;
	logo_data: Uint8Array | null;
	logo_mime: string | null;
	created_at: string;
	updated_at: string;
}

export interface ServiceShareRow {
	service_id: string;
	group_name: string;
	role: ShareRole;
}

export interface KnownUserRow {
	sub: string;
	email: string;
	name: string;
	groups: string;
	updated_at: string;
}

export interface AccessLevel {
	access: 'none' | 'viewer' | 'editor';
}

export interface DeploymentView extends DeploymentRow {
	query: DeploymentQuery;
	notify_emails_list: string[];
	notify_groups_list: string[];
	lag?: DeploymentLag;
}

export interface ReleaseSourceView extends ReleaseSourceRow {
	parsed_config: SourceConfig;
	versions: string[];
}

export interface ServiceView extends Omit<ServiceRow, 'logo_data'> {
	role: 'viewer' | 'editor';
	/** True when a logo was uploaded (served via /api/services/[id]/logo). */
	has_logo: boolean;
	sources: ReleaseSourceView[];
	deployments: DeploymentView[];
}

export interface DeploymentLag {
	/** How many newer versions exist in the source since the deployed version. */
	behind: number | null;
	/** True when the deployed version differs from the latest release. */
	update_available: boolean;
	/** True when the deployed version is strictly newer than the latest release. */
	ahead: boolean;
	latest: string | null;
}
