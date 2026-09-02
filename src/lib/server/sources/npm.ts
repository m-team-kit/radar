import type { NpmSourceConfig } from '$lib/types';
import { fetchWithTimeout } from './util';

export async function fetchNpmVersions(config: NpmSourceConfig): Promise<string[]> {
	const registry = (config.registry ?? 'https://registry.npmjs.org').replace(/\/+$/, '');
	const encoded = config.package.startsWith('@') ? config.package.replace('/', '%2F') : config.package;
	const res = await fetchWithTimeout(`${registry}/${encoded}`, { headers: { Accept: 'application/json' } });
	const data = (await res.json()) as { versions?: Record<string, unknown> };
	return Object.keys(data.versions ?? {});
}
