import type {
	DeploymentQuery,
	SourceConfig,
	SourceType
} from '$lib/types';

const SOURCE_TYPES: SourceType[] = ['docker', 'github', 'pypi', 'npm', 'apt', 'url'];
const QUERY_TYPES = ['http', 'http_json', 'http_jwt', 'manual'] as const;

export class ValidationError extends Error {}

export function requireStr(value: unknown, field: string): string {
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new ValidationError(`${field} is required`);
	}
	return value.trim();
}

export function optionalStr(value: unknown): string | undefined {
	if (typeof value === 'string' && value.trim().length > 0) return value.trim();
	return undefined;
}

export function requireBool(value: unknown, field: string): boolean {
	if (typeof value !== 'boolean') throw new ValidationError(`${field} must be a boolean`);
	return value;
}

export function requirePosInt(value: unknown, field: string): number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
		throw new ValidationError(`${field} must be a positive integer`);
	}
	return value;
}

export function validateUrl(value: string, field: string): string {
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		throw new ValidationError(`${field} must be a valid URL`);
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new ValidationError(`${field} must be an http(s) URL`);
	}
	return value;
}

/** undefined = no change, null = clear, string = validated http(s) URL. */
export function optionalUrlOrNull(value: unknown, field: string): string | null | undefined {
	if (value === undefined) return undefined;
	if (value === null) return null;
	return validateUrl(requireStr(value, field), field);
}

export function validateSourceConfig(type: SourceType, config: Record<string, unknown>): SourceConfig {
	switch (type) {
		case 'docker':
			return { type, repository: requireStr(config.repository, 'config.repository'), registry: optionalStr(config.registry), tagFilter: optionalStr(config.tagFilter) };
		case 'github':
			return { type, owner: requireStr(config.owner, 'config.owner'), repo: requireStr(config.repo, 'config.repo'), tagPrefix: optionalStr(config.tagPrefix) };
		case 'pypi':
			return { type, package: requireStr(config.package, 'config.package') };
		case 'npm':
			return { type, package: requireStr(config.package, 'config.package'), registry: optionalStr(config.registry) };
		case 'apt':
			return { type, url: validateUrl(requireStr(config.url, 'config.url'), 'config.url'), package: requireStr(config.package, 'config.package') };
		case 'url': {
			const kind = config.kind === 'json' ? 'json' : 'text';
			return {
				type,
				url: validateUrl(requireStr(config.url, 'config.url'), 'config.url'),
				kind,
				field: optionalStr(config.field),
				versionRegex: optionalStr(config.versionRegex)
			};
		}
		default: {
			const _exhaustive: never = type;
			return _exhaustive;
		}
	}
}

export function validateQuery(input: Record<string, unknown>): DeploymentQuery {
	const type = input.type;
	if (typeof type !== 'string' || !(QUERY_TYPES as readonly string[]).includes(type)) {
		throw new ValidationError('query.type must be one of http, http_json, http_jwt, manual');
	}
	switch (type) {
		case 'http':
			return { type, url: validateUrl(requireStr(input.url, 'query.url'), 'query.url') };
		case 'http_json':
			return { type, url: validateUrl(requireStr(input.url, 'query.url'), 'query.url'), field: requireStr(input.field, 'query.field') };
		case 'http_jwt':
			return { type, url: validateUrl(requireStr(input.url, 'query.url'), 'query.url'), field: requireStr(input.field, 'query.field') };
		case 'manual':
			return { type };
	}
	return { type: 'manual' };
}
