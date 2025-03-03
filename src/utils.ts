import { MethodDef, BinaryDef, Bin, RateLimitDef, BinaryDefItem } from './interfaces';

export function getLength(message: any): number {
	return (message ? (message as string | Buffer).length || (message as ArrayBuffer).byteLength : 0) | 0;
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
	if (!m) throw new Error('Invalid rate limit value');

	let limit = +m[1];
	let frame = +(m[2] || '1') * times[m[3]];

	if (extended && frame < 5000) {
		limit *= 2;
		frame *= 2;
	}

	return { limit, frame };
}

export function checkRateLimit3(funcId: number, callsList: number[], limit: number, frame: number) {
	const index = funcId << 1;

	while (callsList.length <= (index + 1)) callsList.push(0);

	const bucketTime = callsList[index];
	const bucketCount = callsList[index + 1];
	const time = (Date.now() / frame) | 0;

	if (bucketTime === time) {
		if (bucketCount >= limit) {
			return false;
		} else {
			callsList[index + 1] = bucketCount + 1;
		}
	} else {
		callsList[index] = time;
		callsList[index + 1] = 1;
	}

	return true;
}

export function checkRateLimit2(funcId: number, callsList: number[], rates: (RateLimitDef | undefined)[]) {
	const rate = rates[funcId];
	if (!rate) return true;

	return checkRateLimit3(funcId, callsList, rate.limit, rate.frame);
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
	resolve(result: T): void;
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

export function hasArrayBuffer(def: BinaryDef | BinaryDefItem): boolean {
	return Array.isArray(def) ? def.some(hasArrayBuffer) : (def === Bin.Buffer);
}
