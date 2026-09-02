import { error, json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { listShares, setShares } from '$lib/server/repos';
import { requireEditorForService, requireUser } from '$lib/server/auth/require';
import { parseJsonBody, runValidated } from '$lib/server/http';
import type { ShareRole } from '$lib/types';

const ROLES: ShareRole[] = ['viewer', 'editor'];

export async function GET(event) {
	const user = requireUser(event);
	const db = await getDb();
	requireEditorForService(db, user, event.params.id);
	return json(listShares(db, event.params.id));
}

export async function PUT(event) {
	const user = requireUser(event);
	const body = await parseJsonBody(event);
	const db = await getDb();
	requireEditorForService(db, user, event.params.id);
	if (!Array.isArray(body.shares)) throw error(400, 'shares must be an array');

	const shares = runValidated(() =>
		(body.shares as unknown[]).map((s) => {
			const share = s as Record<string, unknown>;
			const group = typeof share.group_name === 'string' ? share.group_name.trim() : '';
			if (!group) throw new Error('group_name is required');
			const role = share.role;
			if (typeof role !== 'string' || !ROLES.includes(role as ShareRole)) {
				throw new Error('role must be viewer or editor');
			}
			return { group_name: group, role: role as ShareRole };
		})
	);
	setShares(db, event.params.id, shares);
	return json(listShares(db, event.params.id));
}
