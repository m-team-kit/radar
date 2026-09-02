import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';

export interface Config {
	server: {
		host: string;
		port: number;
		base_url: string;
	};
	db: {
		path: string;
	};
	oidc: {
		issuer: string;
		client_id: string;
		client_secret: string;
		redirect_uri: string;
		groups_attribute: string;
		scope: string;
		/** How the client authenticates to the token endpoint. Defaults to "post". */
		client_auth_method: 'post' | 'basic' | 'none';
	};
	session: {
		secret: string;
		cookie_name: string;
		max_age_s: number;
	};
	smtp?: {
		host: string;
		port: number;
		secure: boolean;
		user?: string;
		pass?: string;
		from: string;
	};
	polling: {
		tick_s: number;
		concurrency: number;
		default_source_interval_s: number;
		default_deployment_interval_s: number;
	};
}

type DeepPartial<T> = {
	[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

const DEFAULTS: DeepPartial<Config> = {
	server: { host: '0.0.0.0', port: 3000, base_url: 'http://localhost:3000' },
	db: { path: 'data/radar.db' },
	oidc: { scope: 'openid profile email' },
	session: { cookie_name: 'radar_session', max_age_s: 7 * 24 * 3600 },
	polling: {
		tick_s: 5,
		concurrency: 10,
		default_source_interval_s: 3600,
		default_deployment_interval_s: 3600
	}
};

function deepMerge<T>(base: T, override: unknown): T {
	if (override === undefined || override === null) return base;
	if (typeof base !== 'object' || Array.isArray(base)) {
		return (override as T) ?? base;
	}
	const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
	for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
		if (value === undefined) continue;
		const baseValue = (base as Record<string, unknown>)[key];
		result[key] = deepMerge(baseValue, value);
	}
	return result as T;
}

function configPath(): string {
	const fromEnv = process.env.RADAR_CONFIG;
	if (fromEnv) return fromEnv;
	const idx = process.argv.indexOf('--config');
	if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
	return resolve('config/radar.yaml');
}

export interface ServerBinding {
	host: string;
	port: number;
	base_url: string;
}

/**
 * Leniently read the server binding (host/port/base_url) from the config file.
 * Returns null when the config file is missing or unreadable, and never throws,
 * so callers such as the Vite config can run without a valid config present.
 */
export function loadServerBinding(): ServerBinding | null {
	try {
		const path = configPath();
		const raw = readFileSync(path, 'utf8');
		const parsed = (YAML.parse(raw) ?? {}) as { server?: Partial<ServerBinding> };
		const server = parsed.server ?? {};
		return {
			host: typeof server.host === 'string' ? server.host : '0.0.0.0',
			port: typeof server.port === 'number' ? server.port : 3000,
			base_url: typeof server.base_url === 'string' ? server.base_url : 'http://localhost:3000'
		};
	} catch {
		return null;
	}
}


function requireString(obj: Record<string, unknown>, path: string): string {
	let value = obj[path];
	// YAML parses unquoted numeric-looking values (e.g. a numeric secret) as
	// numbers; treat those as strings to avoid confusing "required" errors.
	if (typeof value === 'number' || typeof value === 'boolean') value = String(value);
	if (typeof value !== 'string' || value.length === 0) {
		throw new Error(`Config error: "${path}" is required`);
	}
	return value;
}

export function loadConfig(): Config {
	const path = configPath();
	let raw: string;
	try {
		raw = readFileSync(path, 'utf8');
	} catch {
		throw new Error(`Cannot read config file at "${path}". Set RADAR_CONFIG to point at a YAML config.`);
	}
	const parsed = YAML.parse(raw) ?? {};
	const cfg = deepMerge(structuredClone(DEFAULTS), parsed);

	const oidc = (cfg as unknown as Record<string, unknown>).oidc as Record<string, unknown>;
	const session = (cfg as unknown as Record<string, unknown>).session as Record<string, unknown>;

	requireString(oidc, 'issuer');
	requireString(oidc, 'client_id');
	requireString(oidc, 'redirect_uri');
	requireString(session, 'secret');
	if (typeof session.secret !== 'string' || session.secret.length < 32) {
		throw new Error('Config error: "session.secret" must be at least 32 characters');
	}
	if (!oidc.groups_attribute) {
		oidc.groups_attribute = 'user.groups';
	}
	if (!oidc.client_auth_method) {
		oidc.client_auth_method = 'post';
	}
	if (!['post', 'basic', 'none'].includes(String(oidc.client_auth_method))) {
		throw new Error('Config error: "oidc.client_auth_method" must be one of post, basic, none');
	}
	if (session.cookie_name && typeof session.cookie_name !== 'string') {
		throw new Error('Config error: "session.cookie_name" must be a string');
	}

	return cfg as unknown as Config;
}

let cached: Config | undefined;
export function getConfig(): Config {
	if (!cached) cached = loadConfig();
	return cached;
}
