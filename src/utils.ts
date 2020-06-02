import { MethodDef, BinaryDef, Bin } from './interfaces';

export interface RateLimit {
	limit: number;
	frame: number;
	calls: number[];
	promise?: boolean;
}

export type RateLimits = (RateLimit | undefined)[];

export function getLength(message: any): number {
	return (message ? (message as string | Buffer).length || (message as ArrayBuffer).byteLength : 0) | 0;
}

export function removeItem<T>(items: T[], item: T) {
	const index = items.indexOf(item);

	if (index !== -1) {
		items.splice(index, 1);
	}
}

export function queryString(params: any) {
	const query = Object.keys(params || {})
		.filter(key => params[key] != null)
		.map(key => `${key}=${encodeURIComponent(params[key])}`)
		.join('&');

	return query ? `?${query}` : '';
}

export function cloneDeep<T>(value: T): T {
	return JSON.parse(JSON.stringify(value));
}

const times: { [key: string]: number; } = {
	s: 1000,
	m: 1000 * 60,
	h: 1000 * 60 * 60,
};

export function parseRateLimit(value: string, extended: boolean) {
	const m = /^(\d+)\/(\d+)?([smh])$/.exec(value);

	if (!m) {
		throw new Error('Invalid rate limit value');
	}

	let limit = +m[1];
	let frame = +(m[2] || '1') * times[m[3]];

	if (extended && frame < 5000) {
		limit *= 2;
		frame *= 2;
	}

	return { limit, frame };
}

export function checkRateLimit(funcId: number, rates: RateLimits) {
	const rate = rates[funcId];

	if (rate) {
		const now = Date.now();
		const min = now - rate.frame;

		for (let i = rate.calls.length - 1; i >= 0; i--) {
			if (rate.calls[i] < min) {
				rate.calls.splice(i, 1);
			}
		}

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
	if (supportsBinaryValue != null) {
		return supportsBinaryValue;
	}

	const protocol = 'https:' === location.protocol ? 'wss' : 'ws';

	if (typeof global !== 'undefined' && 'WebSocket' in global) {
		return true;
	}

	if ('WebSocket' in window) {
		if ('binaryType' in WebSocket.prototype) {
			return true;
		}

		try {
			return !!(new WebSocket(protocol + '://.').binaryType);
		} catch { }
	}

	return false;
}

export interface Deferred<T> {
	promise: Promise<T>;
	resolve(result?: T): void;
	reject(error?: Error): void;
}

export function deferred<T>(): Deferred<T> {
	const obj: Deferred<T> = {} as any;

	obj.promise = new Promise<T>(function (resolve, reject) {
		obj.resolve = resolve;
		obj.reject = reject;
	});

	return obj;
}

export function isBinaryOnlyPacket(method: MethodDef) {
	return typeof method !== 'string' && method[1].binary && hasArrayBuffer(method[1].binary);
}

export function hasArrayBuffer(def: BinaryDef | Bin): boolean {
	return Array.isArray(def) ? def.some(hasArrayBuffer) : def === Bin.Buffer;
}
