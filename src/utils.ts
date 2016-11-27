import { remove } from 'lodash';

const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_';

export function randomString(length: number) {
	let result = '';

	for (let i = 0; i < length; i++) {
		result += characters[Math.floor(Math.random() * characters.length)];
	}

	return result;
}

const times: { [key: string]: number; } = {
	s: 1000,
	m: 1000 * 60,
	h: 1000 * 60 * 60,
};

export function parseRateLimit(value: string) {
	const m = /^(\d+)\/(\d+)?([smh])$/.exec(value);

	if (!m) {
		throw new Error('Invalid rate limit value');
	}

	const limit = +m[1];
	const frame = +(m[2] || '1') * times[m[3]];
	return { limit, frame };
}

export interface RateLimit {
	limit: number;
	frame: number;
	calls: number[];
	promise?: boolean;
}

export function checkRateLimit(funcId: number, rates: (RateLimit | null)[]) {
	const rate = rates[funcId];

	if (rate) {
		const now = Date.now();
		const min = now - rate.frame;

		remove(rate.calls, x => x < min);

		if (rate.calls.length >= rate.limit) {
			return false;
		} else {
			rate.calls.push(now);
		}
	}

	return true;
}

let supportsBinaryValue: boolean | undefined;

/* istanbul ignore next */
export function supportsBinary() {
	if (supportsBinaryValue != null)
		return supportsBinaryValue;

	const protocol = 'https:' === location.protocol ? 'wss' : 'ws';

	if ('WebSocket' in window) {
		if ('binaryType' in WebSocket.prototype)
			return true;

		try {
			return !!(new WebSocket(protocol + '://.').binaryType);
		} catch (e) { }
	}

	return false;
}
