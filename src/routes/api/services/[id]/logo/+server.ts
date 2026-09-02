import { error } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { getDb } from '$lib/server/db';
import { clearServiceLogo, getServiceLogo, getService, setServiceLogoData } from '$lib/server/repos';
import { requireAccessToService, requireEditorForService, requireUser } from '$lib/server/auth/require';

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB

export async function GET(event: RequestEvent) {
	const user = requireUser(event);
	const db = await getDb();
	requireAccessToService(db, user, event.params.id);
	const logo = getServiceLogo(db, event.params.id);
	if (!logo) throw error(404, 'No logo');
	return new Response(new Uint8Array(logo.data), {
		headers: {
			'Content-Type': logo.mime,
			'Cache-Control': 'private, max-age=86400'
		}
	});
}

export async function POST(event: RequestEvent) {
	const user = requireUser(event);
	const db = await getDb();
	requireEditorForService(db, user, event.params.id);
	if (!getService(db, event.params.id)) throw error(404, 'Service not found');

	let file: File | null = null;
	try {
		const form = await event.request.formData();
		const entry = form.get('logo');
		if (entry instanceof File) file = entry;
	} catch {
		throw error(400, 'Expected a multipart form with a "logo" file field');
	}
	if (!file) throw error(400, 'Missing "logo" file in the upload');
	if (!ALLOWED_MIME.has(file.type)) {
		throw error(400, `Unsupported image type "${file.type || 'unknown'}" (allowed: png, jpeg, webp)`);
	}
	if (file.size > MAX_SIZE) {
		throw error(400, 'Logo too large (max 2 MB)');
	}

	const data = Buffer.from(await file.arrayBuffer());
	setServiceLogoData(db, event.params.id, data, file.type);
	return new Response(null, { status: 204 });
}

export async function DELETE(event: RequestEvent) {
	const user = requireUser(event);
	const db = await getDb();
	requireEditorForService(db, user, event.params.id);
	if (!getService(db, event.params.id)) throw error(404, 'Service not found');
	clearServiceLogo(db, event.params.id);
	return new Response(null, { status: 204 });
}
