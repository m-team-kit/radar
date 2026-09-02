import { decodeJwt } from 'jose';
import type { DeploymentQuery } from '$lib/types';
import { fetchWithTimeout, getPath } from './sources/util';

export async function fetchDeployedVersion(query: DeploymentQuery): Promise<string> {
	switch (query.type) {
		case 'http': {
			const res = await fetchWithTimeout(query.url);
			const text = (await res.text()).trim();
			if (!text) throw new Error('empty response body');
			return text;
		}
		case 'http_json': {
			const res = await fetchWithTimeout(query.url);
			const doc = (await res.json()) as unknown;
			const value = getPath(doc, query.field);
			if (value === undefined || value === null) throw new Error(`field "${query.field}" not found`);
			return String(value);
		}
		case 'http_jwt': {
			const res = await fetchWithTimeout(query.url);
			const text = (await res.text()).trim();
			if (!text) throw new Error('empty response body');
			const claims = decodeJwt(text);
			const value = getPath(claims, query.field);
			if (value === undefined || value === null) throw new Error(`claim "${query.field}" not found`);
			return String(value);
		}
		case 'manual':
			throw new Error('manual deployment has no version query');
	}
}
