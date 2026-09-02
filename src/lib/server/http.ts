import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { ValidationError } from './validate';

export async function parseJsonBody(event: RequestEvent): Promise<Record<string, unknown>> {
	try {
		return (await event.request.json()) as Record<string, unknown>;
	} catch {
		throw error(400, 'Invalid JSON body');
	}
}

export function runValidated<T>(fn: () => T): T {
	try {
		return fn();
	} catch (e) {
		if (e instanceof ValidationError) throw error(400, e.message);
		throw e;
	}
}
