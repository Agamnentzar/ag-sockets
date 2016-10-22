import { ServerRequest } from 'http';

export interface Logger {
	(...args: any[]): void;
}

export interface FuncList {
	[name: string]: Function | undefined;
}

export interface SocketServer {
	[name: string]: any;
	connected?(): void;
	disconnected?(): void;
}

export interface SocketClient {
	[name: string]: any;
	connected?(): void;
	disconnected?(): void;
	invalidVersion?(expected: number, actual: number): void;
}

export interface SocketService<TClient extends SocketClient, TServer extends SocketServer> {
	client: TClient;
	server: TServer;
	sentSize: number;
	receivedSize: number;
	isConnected: boolean;
	connect(): void;
	disconnect(): void;
}

export const enum Bin {
	I8,
	U8,
	I16,
	U16,
	I32,
	U32,
	F32,
	F64,
	Bool,
	Str,
	Obj,
}

export type BinaryDef = (Bin | (Bin | (Bin | any[]))[])[];
export type MethodDef = string | [string, MethodOptions];

export interface Packets {
	[key: string]: BinaryDef;
}

export interface MethodOptions {
	/** binary definition of the packet */
	binary?: BinaryDef;
	/** true if promise handling should be generated on client side */
	promise?: boolean;
	/** name of the field to set to true if there is outstanding promise for this method */
	progress?: string;
	/** true if method should be ignored when logging messages in debug mode */
	ignore?: boolean;
	/** rate limit in format of "1/s" or "10/30s" or "20/m" */
	rateLimit?: string;
}

export interface MethodMetadata {
	name: string;
	options: MethodOptions;
}

export interface ServerOptions {
	/** host of websocket endpoint, the same host as the site by default */
	host?: string;
	/** path to websocket endpoint, '/ws' by default */
	path?: string;
	/** true to force SSL websockets on non-SSL website */
	ssl?: boolean;
	/** ping interval in milliseconds, ping disabled if not specified or 0 */
	pingInterval?: number;
	/** delay for client to wait before trying to reconnect in milliseconds */
	reconnectTimeout?: number;
	/** time after after last message from client when server assumes client is not in milliseconds */
	connectionTimeout?: number;
	/** log messages to console */
	debug?: boolean;
	/** version hash */
	hash?: number;
	/** per message deflate compression switch */
	perMessageDeflate?: boolean;
	/** limit connections to one per generated token */
	connectionTokens?: boolean;
	/** lifetime of connection token */
	tokenLifetime?: number;
	/** maximum number of connected clients */
	clientLimit?: number;
	/** transfer limit (bytes per second) */
	transferLimit?: number;
	/** custom request parameters */
	requestParams?: any;
	/** custom client verification method */
	verifyClient?: (request: ServerRequest) => any;
	/** ws library or alternative */
	ws?: any;
}

export interface ClientOptions extends ServerOptions {
	client: MethodDef[];
	server: MethodDef[];
	token?: string;
}

export function getNames(methods: MethodDef[]) {
	return methods.map(i => typeof i === 'string' ? i : i[0]);
}

export function getIgnore(methods: MethodDef[]) {
	return methods.map(i => (typeof i !== 'string' && i[1].ignore) ? i[0] : null).filter(x => !!x) as string[];
}

export function getBinary(methods: MethodDef[]) {
	const result: Packets = {};
	methods.forEach(i => {
		if (typeof i !== 'string' && i[1].binary) {
			result[i[0]] = i[1].binary as BinaryDef;
		}
	});
	return result;
}
