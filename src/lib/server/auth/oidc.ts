import {
	allowInsecureRequests,
	authorizationCodeGrant,
	buildAuthorizationUrl,
	calculatePKCECodeChallenge,
	ClientSecretBasic,
	ClientSecretPost,
	discovery,
	fetchUserInfo,
	None,
	randomPKCECodeVerifier,
	randomState,
	skipSubjectCheck,
	type ClientAuth,
	type Configuration
} from 'openid-client';
import { getConfig, type Config } from '../config';
import { getPath } from '../sources/util';
import { upsertKnownUser } from '../repos';
import type Database from 'better-sqlite3';

let configPromise: Promise<Configuration> | undefined;

function clientAuth(cfg: Config): ClientAuth {
	switch (cfg.oidc.client_auth_method) {
		case 'basic':
			return ClientSecretBasic(cfg.oidc.client_secret);
		case 'none':
			return None();
		case 'post':
		default:
			return ClientSecretPost(cfg.oidc.client_secret);
	}
}

async function getConfiguration(): Promise<Configuration> {
	if (!configPromise) {
		configPromise = (async () => {
			const cfg = getConfig();
			const issuerUrl = new URL(cfg.oidc.issuer);
			const allowInsecure = cfg.oidc.issuer.startsWith('http://');
			return discovery(
				issuerUrl,
				cfg.oidc.client_id,
				cfg.oidc.client_secret,
				clientAuth(cfg),
				allowInsecure ? { execute: [allowInsecureRequests] } : undefined
			);
		})();
	}
	return configPromise;
}

export interface OidcRequest {
	url: URL;
	redirect_uri: string;
	code_verifier: string;
	state: string;
}

export async function createAuthRequest(redirectUri: string): Promise<OidcRequest> {
	const config = await getConfiguration();
	const state = randomState();
	const code_verifier = randomPKCECodeVerifier();
	const code_challenge = await calculatePKCECodeChallenge(code_verifier);
	const cfg = getConfig();

	const url = buildAuthorizationUrl(config, {
		redirect_uri: redirectUri,
		scope: cfg.oidc.scope,
		state,
		code_challenge,
		code_challenge_method: 'S256'
	});
	return { url, redirect_uri: redirectUri, code_verifier, state };
}

export async function exchangeCode(request: OidcRequest): Promise<{ sub: string; email: string; name: string; groups: string[] }> {
	const config = await getConfiguration();

	// Derive the callback URL from the configured redirect_uri (carrying over
	// the real query params). openid-client uses this URL as the token request's
	// redirect_uri, so it must match exactly what the authorization request used.
	const callbackUrl = new URL(request.redirect_uri);
	callbackUrl.search = request.url.search;

	const tokens = await authorizationCodeGrant(config, callbackUrl, {
		expectedState: request.state,
		pkceCodeVerifier: request.code_verifier
	});
	if (!tokens.access_token) throw new Error('No access token returned');

	const userinfo = (await fetchUserInfo(config, tokens.access_token, skipSubjectCheck)) as Record<string, unknown>;
	const cfg = getConfig();

	const groupsValue = getPath(userinfo, cfg.oidc.groups_attribute);
	const groups = Array.isArray(groupsValue)
		? groupsValue.map((g) => String(g))
		: typeof groupsValue === 'string' && groupsValue.length > 0
			? groupsValue.split(',').map((g) => g.trim()).filter(Boolean)
			: [];

	const sub = String(userinfo.sub ?? '');
	return {
		sub,
		email: String(userinfo.email ?? ''),
		name: String(userinfo.name ?? userinfo.preferred_username ?? sub),
		groups
	};
}

export async function registerOidcUser(
	db: Database.Database,
	user: { sub: string; email: string; name: string; groups: string[] }
): Promise<void> {
	upsertKnownUser(db, user);
}
