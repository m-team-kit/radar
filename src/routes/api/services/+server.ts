import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { buildServiceView, createService, listServicesForUser } from '$lib/server/repos';
import { requireUser } from '$lib/server/auth/require';
import { parseJsonBody, runValidated } from '$lib/server/http';
import { optionalStr, optionalUrlOrNull, requireStr } from '$lib/server/validate';

export async function GET(event) {
	const user = requireUser(event);
	const db = await getDb();
	const rows = listServicesForUser(db, user);
	const views = rows.map((r) => buildServiceView(db, r.id, user));
	return json(views);
}

export async function POST(event) {
	const user = requireUser(event);
	const body = await parseJsonBody(event);
	const input = runValidated(() => ({
		name: requireStr(body.name, 'name'),
		description: optionalStr(body.description) ?? '',
		logo_url: optionalUrlOrNull(body.logo_url, 'logo_url')
	}));
	const db = await getDb();
	const service = createService(db, { ...input, owner_sub: user.sub });
	return json(buildServiceView(db, service.id, user), { status: 201 });
}
