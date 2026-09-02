import { error, redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { getConfig } from '$lib/server/config';
import { getDb } from '$lib/server/db';
import { exchangeCode, registerOidcUser } from '$lib/server/auth/oidc';
import { createSession } from '$lib/server/auth/session';

const STATE_COOKIE = 'radar_oidc_state';

/**
 * Extract a readable description from an OIDC/token error.
 * oauth4webapi's ResponseBodyError carries the parsed IdP error body in `cause`.
 */
function describeError(err: unknown): string {
	const cause = (err as { cause?: unknown } | undefined)?.cause;
	if (cause && typeof cause === 'object') {
		const c = cause as Record<string, unknown>;
		const code = typeof c.error === 'string' ? c.error : '';
		const desc = typeof c.error_description === 'string' ? c.error_description : '';
		const status = (err as { response?: Response } | undefined)?.response?.status;
		const parts = [];
		if (code) parts.push(`error=${code}`);
		if (desc) parts.push(desc);
		if (status) parts.push(`status=${status}`);
		if (parts.length > 0) return parts.join(' · ');
	}
	return err instanceof Error ? err.message : String(err);
}

export async function GET(event: RequestEvent) {
	const cfg = getConfig();

	// Errors returned directly by the authorize endpoint (e.g. user denied consent).
	const errParam = event.url.searchParams.get('error');
	if (errParam) {
		const desc = event.url.searchParams.get('error_description') ?? '';
		console.error(`[auth] Authorization error: ${errParam}${desc ? ` — ${desc}` : ''}`);
		event.cookies.delete(STATE_COOKIE, { path: '/' });
		throw redirect(302, `/auth/error?message=${encodeURIComponent(desc || errParam)}`);
	}

	const stored = event.cookies.get(STATE_COOKIE);
	if (!stored) throw error(400, 'Missing OIDC state');
	let state: { state: string; code_verifier: string };
	try {
		state = JSON.parse(stored) as { state: string; code_verifier: string };
	} catch {
		throw error(400, 'Invalid OIDC state');
	}

	let user;
	try {
		user = await exchangeCode({
			url: event.url,
			redirect_uri: cfg.oidc.redirect_uri,
			code_verifier: state.code_verifier,
			state: state.state
		});
	} catch (err) {
		console.error(`[auth] Code exchange failed: ${describeError(err)}`);
		event.cookies.delete(STATE_COOKIE, { path: '/' });
		throw redirect(302, `/auth/error?message=${encodeURIComponent(describeError(err))}`);
	}

	const db = await getDb();
	await registerOidcUser(db, user);
	const session = await createSession(user.sub);
	event.cookies.set(cfg.session.cookie_name, session, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: cfg.session.max_age_s
	});
	event.cookies.delete(STATE_COOKIE, { path: '/' });

	throw redirect(302, '/');
}
