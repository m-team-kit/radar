import type { DockerSourceConfig } from '$lib/types';
import { fetchWithTimeout } from './util';

const DOCKER_HUB = 'https://hub.docker.com/v2';
const DEFAULT_REGISTRY = 'registry-1.docker.io';

function normalizeRepository(repository: string): { namespace: string; name: string } {
	const parts = repository.split('/');
	if (parts.length === 1) return { namespace: 'library', name: parts[0] };
	return { namespace: parts[0], name: parts.slice(1).join('/') };
}

async function fetchDockerHubTags(repository: string, tagFilter?: string): Promise<string[]> {
	const { namespace, name } = normalizeRepository(repository);
	const tags: string[] = [];
	let url: string | null = `${DOCKER_HUB}/repositories/${namespace}/${name}/tags?page_size=100&ordering=last_updated`;
	while (url) {
		const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
		const data = (await res.json()) as { results: { name: string }[]; next: string | null };
		for (const r of data.results) {
			if (!tagFilter || r.name.includes(tagFilter)) tags.push(r.name);
		}
		url = data.next;
	}
	return tags;
}

async function fetchOciTags(registry: string, repository: string, tagFilter?: string): Promise<string[]> {
	const listUrl = `${registry}/v2/${repository}/tags/list`;
	let res = await fetch(listUrl);
	if (res.status === 401) {
		const auth = res.headers.get('www-authenticate');
		if (auth) {
			const params = new URLSearchParams(
				auth
					.replace(/^Bearer\s+/i, '')
					.split(',')
					.map((p) => {
						const [k, ...rest] = p.trim().split('=');
						return [k, rest.join('=').replace(/^"(.*)"$/, '$1')];
					})
			);
			const realm = params.get('realm');
			if (realm) {
				const service = params.get('service');
				const scope = params.get('scope');
				const qs = new URLSearchParams();
				if (service) qs.set('service', service);
				if (scope) qs.set('scope', scope);
				const tokenRes = await fetch(`${realm}?${qs}`);
				if (tokenRes.ok) {
					const token = ((await tokenRes.json()) as { token?: string; access_token?: string }).token;
					res = await fetchWithTimeout(listUrl, { headers: { Authorization: `Bearer ${token}` } });
				}
			}
		}
	}
	if (!res.ok) throw new Error(`HTTP ${res.status} for ${listUrl}`);

	const data = (await res.json()) as { tags?: string[] };
	const tags = data.tags ?? [];
	return tagFilter ? tags.filter((t) => t.includes(tagFilter)) : tags;
}

export async function fetchDockerVersions(config: DockerSourceConfig): Promise<string[]> {
	const registry = (config.registry ?? '').replace(/\/+$/, '');
	if (!registry || registry === DEFAULT_REGISTRY || registry.includes('docker.io')) {
		return fetchDockerHubTags(config.repository, config.tagFilter);
	}
	return fetchOciTags(registry, config.repository, config.tagFilter);
}
