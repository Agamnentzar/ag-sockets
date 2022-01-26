import { IncomingMessage } from 'http';
import { parse as parseUrl } from 'url';
import * as ws from 'ws';
import { InternalServer, ServerOptions, Token } from './serverInterfaces';
import { parseRateLimit, isBinaryOnlyPacket } from './utils';
import { OriginalRequest, ErrorHandler } from './server';
import { getMethods } from './method';
import { MethodDef, MethodOptions, ClientOptions, RateLimitDef, RateLimit } from './interfaces';
import { getSocketMetadata } from './serverMethod';

const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_';

export function randomString(length: number) {
	let result = '';

	for (let i = 0; i < length; i++) {
		result += characters[Math.floor(Math.random() * characters.length)];
	}

	return result;
}

export const defaultErrorHandler: ErrorHandler = {
	handleError() { },
	handleRejection() { },
	handleRecvError() { },
};

export function getMethodsFromType(ctor: Function) {
	return getMethods(ctor).map<MethodDef>(m => Object.keys(m.options).length ? [m.name, m.options] : m.name);
}

export function returnTrue() {
	return true;
}

export function createToken(server: InternalServer, data?: any): Token {
	const token = {
		id: randomString(16),
		data,
		expire: Date.now() + server.tokenLifetime!,
	};
	server.freeTokens.set(token.id, token);
	return token;
}

export function getToken(server: InternalServer, id: string): Token | null {
	const token = server.freeTokens.get(id);

	if (token) {
		server.freeTokens.delete(id);
		if (token.expire > Date.now()) return token;
	}

	return null;
}

export function getTokenFromClient(server: InternalServer, id: string): Token | undefined {
	const client = server.clientsByToken.get(id);
	if (!client) return undefined;

	const token = client.token;
	client.client.disconnect(true);
	server.clientsByToken.delete(id);
	client.token = undefined;
	return token;
}

export function hasToken(server: InternalServer, id: any) {
	return server.freeTokens.has(id) || server.clientsByToken.has(id);
}

export function createOriginalRequest(
	socket: ws & { upgradeReq?: IncomingMessage; }, request: IncomingMessage | undefined
): OriginalRequest {
	if (request) {
		return { url: request.url || '', headers: request.headers };
	} else if (socket.upgradeReq) {
		return { url: socket.upgradeReq.url || '', headers: socket.upgradeReq.headers };
	} else {
		return { url: '', headers: {} };
	}
}

export function createClientOptions<TServer, TClient>(
	serverType: new (...args: any[]) => TServer,
	clientType: new (...args: any[]) => TClient,
	options?: ServerOptions
) {
	return toClientOptions(optionsWithDefaults(createServerOptions(serverType, clientType, options)));
}

export function createServerOptions(serverType: Function, clientType: Function, options?: ServerOptions) {
	const client = getMethodsFromType(clientType);
	const server = getMethodsFromType(serverType);
	return { client, server, ...getSocketMetadata(serverType), ...options };
}

export function optionsWithDefaults(options: ServerOptions): ServerOptions {
	return {
		hash: Date.now(),
		path: '/ws',
		tokenLifetime: 3600 * 1000, // 1 hour
		reconnectTimeout: 500, // 0.5 sec
		connectionTimeout: 10000, // 10 sec
		perMessageDeflate: true,
		...options,
	};
}

export function getBinaryOnlyPackets(client: MethodDef[]) {
	const result: any = {};

	client
		.filter(isBinaryOnlyPacket)
		.map(x => x[0] as string)
		.forEach(key => result[key] = true);

	return result;
}

function clearMethodOptions([name, { serverRateLimit: _, ...options }]: [string, MethodOptions]) {
	return [name, options] as [string, MethodOptions];
}

export function toClientOptions(options: ServerOptions): ClientOptions {
	return {
		id: options.id,
		host: options.host,
		path: options.path,
		ssl: options.ssl,
		pingInterval: options.pingInterval,
		reconnectTimeout: options.reconnectTimeout,
		debug: options.debug,
		hash: options.hash,
		requestParams: options.requestParams,
		copySendBuffer: options.copySendBuffer,
		client: options.client!,
		server: options.server!.map(x => typeof x === 'string' ? x : clearMethodOptions(x)),
		tokenLifetime: options.tokenLifetime,
	};
}

export function parseRateLimitDefOptions(method: MethodDef): RateLimitDef | undefined {
	return Array.isArray(method) && method[1].rateLimit ? {
		promise: !!method[1].promise,
		...(method[1].serverRateLimit ?
			parseRateLimit(method[1].serverRateLimit!, false) :
			parseRateLimit(method[1].rateLimit!, true)),
	} : undefined;
}

export function parseRateLimitDef(method: MethodDef): RateLimitDef | undefined {
	return Array.isArray(method) && method[1].rateLimit ? {
		promise: !!method[1].promise,
		...(method[1].serverRateLimit ?
			parseRateLimit(method[1].serverRateLimit!, false) :
			parseRateLimit(method[1].rateLimit!, true)),
	} : undefined;
}

// TODO: remove
export function createRateLimit(def: RateLimitDef | undefined): RateLimit | undefined {
	return def ? {
		calls: [],
		promise: def.promise,
		limit: def.limit,
		frame: def.frame,
	} : undefined;
}

export function getQuery(url: string | undefined): { [key: string]: string | string[] | undefined; } {
	return parseUrl(url || '', true).query || {};
}

export function callWithErrorHandling(action: () => any, onSuccess: () => void, onError: (e: Error) => void) {
	try {
		const result = action();

		if (result && result.then) {
			result.then(onSuccess, onError);
		} else {
			onSuccess();
		}
	} catch (e) {
		onError(e);
	}
}
