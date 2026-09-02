import { SignJWT, jwtVerify } from 'jose';
import { getConfig } from '../config';

function secretKey(): Uint8Array {
	return new TextEncoder().encode(getConfig().session.secret);
}

export async function createSession(sub: string): Promise<string> {
	const cfg = getConfig();
	return new SignJWT({})
		.setProtectedHeader({ alg: 'HS256' })
		.setSubject(sub)
		.setIssuedAt()
		.setExpirationTime(Math.floor(Date.now() / 1000) + cfg.session.max_age_s)
		.sign(secretKey());
}

export async function verifySession(token: string): Promise<string | null> {
	try {
		const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
		return typeof payload.sub === 'string' ? payload.sub : null;
	} catch {
		return null;
	}
}
