import { IncomingMessage } from 'http';
import { parse as parseUrl } from 'url';
import * as ws from 'ws';
import { InternalServer, Token } from './serverInterfaces';
import { parseRateLimit, RateLimit } from './utils';
import { OriginalRequest, ErrorHandler } from './server';
import { getMethods, getSocketMetadata } from './method';
import { MethodDef, ServerOptions, MethodOptions, ClientOptions, BinaryDef, Bin } from './interfaces';

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
	server.tokens.push(token);
	return token;
}

export function getToken(server: InternalServer, id: any): Token | null {
	for (let i = 0; i < server.tokens.length; i++) {
		const token = server.tokens[i];

		if (token.id === id) {
			server.tokens.splice(i, 1);
			return token.expire < Date.now() ? null : token;
		}
	}

	return null;
}

export function getTokenFromClient(server: InternalServer, id: any): Token | undefined {
	const index = server.clients.findIndex(c => !!c.token && c.token.id === id);

	if (index !== -1) {
		const { client, token } = server.clients[index];
		client.disconnect(true);
		return token;
	} else {
		return undefined;
	}
}

export function hasToken(server: InternalServer, id: any) {
	return server.tokens.some(t => t.id === id) ||
		server.clients.some(c => !!(c.token && c.token.id === id));
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
		.filter(x => typeof x !== 'string' && hasArrayBuffer(x[1].binary!))
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
		client: options.client!,
		server: options.server!.map(x => typeof x === 'string' ? x : clearMethodOptions(x)),
	};
}

export function createRateLimit(method: MethodDef): RateLimit | undefined {
	return Array.isArray(method) && method[1].rateLimit ? {
		calls: [],
		promise: !!method[1].promise,
		...(method[1].serverRateLimit ?
			parseRateLimit(method[1].serverRateLimit!, false) :
			parseRateLimit(method[1].rateLimit!, true)),
	} : undefined;
}

export function hasArrayBuffer(def: BinaryDef | Bin): boolean {
	return Array.isArray(def) ? def.some(hasArrayBuffer) : def === Bin.Buffer;
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
