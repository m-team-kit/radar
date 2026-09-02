import { error, redirect } from '@sveltejs/kit';
import { getConfig } from '$lib/server/config';
import { getDb } from '$lib/server/db';
import {
	buildServiceView,
	deploymentHistory,
	listDeployments,
	listSources,
	sourceHistory
} from '$lib/server/repos';
import { getVersionKind } from '$lib/versions';

export const load = async (event) => {
	if (!event.locals.user) throw redirect(302, '/auth/login');
	const db = await getDb();
	const service = buildServiceView(db, event.params.id, event.locals.user);
	if (!service) throw error(404, 'Service not found');

	const sources = listSources(db, service.id);
	const history = {
		sources: sources.map((s) => ({
			id: s.id,
			name: s.name,
			latest: s.latest_version,
			kind: getVersionKind(s.type),
			full_versions_only: s.full_versions_only,
			history: sourceHistory(db, s.id)
		})),
		deployments: listDeployments(db, service.id).map((d) => ({
			id: d.id,
			name: d.name,
			current: d.current_version,
			kind: d.release_source_id
				? getVersionKind(sources.find((s) => s.id === d.release_source_id)?.type ?? 'semver')
				: 'semver',
			full_versions_only: d.release_source_id
				? (sources.find((s) => s.id === d.release_source_id)?.full_versions_only ?? true)
				: true,
			history: deploymentHistory(db, d.id)
		}))
	};

	return { service, history, base_url: getConfig().server.base_url };
};
