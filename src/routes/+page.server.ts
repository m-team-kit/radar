import { redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { buildServiceView, listServicesForUser } from '$lib/server/repos';
import type { ServiceView } from '$lib/types';

export const load = async (event) => {
	if (!event.locals.user) throw redirect(302, '/auth/login');
	const db = await getDb();
	const rows = listServicesForUser(db, event.locals.user);
	const services = rows
		.map((r) => buildServiceView(db, r.id, event.locals.user!))
		.filter((v): v is ServiceView => v !== null);
	return { services };
};
