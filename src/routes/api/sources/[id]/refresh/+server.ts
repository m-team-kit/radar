import { error, json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { getSource } from '$lib/server/repos';
import { requireEditorForService, requireUser } from '$lib/server/auth/require';
import { refreshSourceNow } from '$lib/server/poller';

export async function POST(event) {
	const user = requireUser(event);
	const db = await getDb();
	const source = getSource(db, event.params.id);
	if (!source) throw error(404, 'Source not found');
	requireEditorForService(db, user, source.service_id);

	await refreshSourceNow(db, source.id);
	return json(getSource(db, source.id));
}
