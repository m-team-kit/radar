import { redirect } from '@sveltejs/kit';
import { getConfig } from '$lib/server/config';
import { createAuthRequest } from '$lib/server/auth/oidc';
import type { RequestEvent } from '@sveltejs/kit';

const STATE_COOKIE = 'radar_oidc_state';

export async function GET(event: RequestEvent) {
	const cfg = getConfig();
	const req = await createAuthRequest(cfg.oidc.redirect_uri);
	event.cookies.set(
		STATE_COOKIE,
		JSON.stringify({ state: req.state, code_verifier: req.code_verifier }),
		{ path: '/', httpOnly: true, sameSite: 'lax', maxAge: 600 }
	);
	throw redirect(302, req.url.toString());
}
