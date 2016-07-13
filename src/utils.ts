const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_';

export function randomString(length: number) {
	let result = '';

	for (let i = 0; i < length; i++) {
		result += characters[Math.floor(Math.random() * characters.length)];
	}

	return result;
}

export interface RateLimit {
	limit: number;
	last: number;
}

export function checkRateLimit(funcId: number, rates: RateLimit[]) {
	const rate = rates[funcId];

	if (rate) {
		const now = Date.now();

		if ((now - rate.last) < rate.limit) {
			return false;
		} else {
			rate.last = now;
		}
	}

	return true;
}
