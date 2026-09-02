export class ApiError extends Error {}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
	const isFormData = init?.body instanceof FormData;
	const headers = {
		...(isFormData ? {} : { 'Content-Type': 'application/json' }),
		...init?.headers
	};
	const res = await fetch(path, { ...init, headers });
	if (!res.ok) {
		let message = `Request failed (${res.status})`;
		try {
			const body = (await res.json()) as { message?: string };
			if (body.message) message = body.message;
		} catch {
			// ignore
		}
		throw new ApiError(message);
	}
	if (res.status === 204) return undefined as T;
	return (await res.json()) as T;
}
