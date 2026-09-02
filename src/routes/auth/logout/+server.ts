import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { getConfig } from '$lib/server/config';

export async function GET(event: RequestEvent) {
	const cfg = getConfig();
	event.cookies.delete(cfg.session.cookie_name, { path: '/' });
	throw redirect(302, '/');
}
