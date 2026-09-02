import type { GithubSourceConfig } from '$lib/types';
import { fetchWithTimeout } from './util';

const API = 'https://api.github.com';

export async function fetchGithubVersions(config: GithubSourceConfig): Promise<string[]> {
	const tags: string[] = [];
	let url: string | null = `${API}/repos/${config.owner}/${config.repo}/releases?per_page=100`;
	while (url) {
		const res = await fetchWithTimeout(url, {
			headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'radar' }
		});
		const data = (await res.json()) as { tag_name: string }[];
		for (const release of data) {
			const tag = release.tag_name;
			if (!config.tagPrefix || tag.startsWith(config.tagPrefix)) {
				tags.push(tag);
			}
		}
		const link = res.headers.get('link');
		const next = link?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
		url = next;
	}
	return tags;
}
