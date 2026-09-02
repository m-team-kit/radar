import { json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth/require';

export async function GET(event) {
	const user = requireUser(event);
	return json(user);
}
