import { getConfig } from '$lib/server/config';
import { getDb } from '$lib/server/db';
import { getUser } from '$lib/server/repos';
import { startPoller } from '$lib/server/poller';
import { verifySession } from '$lib/server/auth/session';
import type { Handle } from '@sveltejs/kit';

startPoller();

export const handle: Handle = async ({ event, resolve }) => {
	const cfg = getConfig();
	const token = event.cookies.get(cfg.session.cookie_name);
	if (token) {
		const sub = await verifySession(token);
		if (sub) {
			const db = await getDb();
			const user = getUser(db, sub);
			if (user) {
				event.locals.user = {
					sub: user.sub,
					email: user.email,
					name: user.name,
					groups: JSON.parse(user.groups) as string[]
				};
			}
		}
	}
	return resolve(event);
};
