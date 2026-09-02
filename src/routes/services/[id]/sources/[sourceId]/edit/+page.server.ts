import { error, redirect } from '@sveltejs/kit';
import { getConfig } from '$lib/server/config';
import { getDb } from '$lib/server/db';
import { getService, getSource } from '$lib/server/repos';
import { requireEditorForService } from '$lib/server/auth/require';

export const load = async (event) => {
	if (!event.locals.user) throw redirect(302, '/auth/login');
	const db = await getDb();
	const service = getService(db, event.params.id);
	if (!service) throw error(404, 'Service not found');
	requireEditorForService(db, event.locals.user, service.id);
	const source = getSource(db, event.params.sourceId);
	if (!source || source.service_id !== service.id) throw error(404, 'Source not found');
	return { service, source, default_interval: getConfig().polling.default_source_interval_s };
};
