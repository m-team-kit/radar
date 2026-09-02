import { error, redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { buildServiceView, listShares } from '$lib/server/repos';
import { requireEditorForService } from '$lib/server/auth/require';

export const load = async (event) => {
	if (!event.locals.user) throw redirect(302, '/auth/login');
	const db = await getDb();
	const service = buildServiceView(db, event.params.id, event.locals.user);
	if (!service) throw error(404, 'Service not found');
	requireEditorForService(db, event.locals.user, service.id);
	return { service, shares: listShares(db, service.id) };
};
