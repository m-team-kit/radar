import type { PypiSourceConfig } from '$lib/types';
import { fetchWithTimeout } from './util';

export async function fetchPypiVersions(config: PypiSourceConfig): Promise<string[]> {
	const res = await fetchWithTimeout(`https://pypi.org/pypi/${encodeURIComponent(config.package)}/json`, {
		headers: { Accept: 'application/json' }
	});
	const data = (await res.json()) as { releases: Record<string, unknown> };
	return Object.keys(data.releases ?? {});
}
