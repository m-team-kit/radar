import { error, json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { buildServiceView, deleteService, getService, setServiceLogoUrl, updateService } from '$lib/server/repos';
import { requireAccessToService, requireEditorForService, requireUser } from '$lib/server/auth/require';
import { parseJsonBody, runValidated } from '$lib/server/http';
import { optionalStr, optionalUrlOrNull, requireStr } from '$lib/server/validate';

export async function GET(event) {
	const user = requireUser(event);
	const db = await getDb();
	requireAccessToService(db, user, event.params.id);
	const view = buildServiceView(db, event.params.id, user);
	if (!view) throw error(404, 'Service not found');
	return json(view);
}

export async function PATCH(event) {
	const user = requireUser(event);
	const body = await parseJsonBody(event);
	const db = await getDb();
	requireEditorForService(db, user, event.params.id);
	const current = getService(db, event.params.id);
	if (!current) throw error(404, 'Service not found');
	const input = runValidated(() => ({
		name: body.name !== undefined ? requireStr(body.name, 'name') : undefined,
		description: body.description !== undefined ? (optionalStr(body.description) ?? '') : undefined,
		logo_url: optionalUrlOrNull(body.logo_url, 'logo_url')
	}));
	updateService(db, event.params.id, {
		name: input.name ?? current.name,
		description: input.description ?? current.description
	});
	if (input.logo_url !== undefined) {
		setServiceLogoUrl(db, event.params.id, input.logo_url);
	}
	return json(buildServiceView(db, event.params.id, user));
}

export async function DELETE(event) {
	const user = requireUser(event);
	const db = await getDb();
	requireEditorForService(db, user, event.params.id);
	if (!getService(db, event.params.id)) throw error(404, 'Service not found');
	deleteService(db, event.params.id);
	return new Response(null, { status: 204 });
}
