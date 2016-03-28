/// <reference path="../typings/main.d.ts" />

export interface Logger {
	(...args: any[]): void;
}

export interface FuncList {
	[name: string]: Function;
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
}

export type BinaryType = 'Int8' | 'Uint8' | 'Int16' | 'Uint16' | 'Int32' | 'Uint32' | 'Float32' | 'Float64' | 'Boolean' | 'String' | 'Object';
export type BinaryDef = (BinaryType | (BinaryType | any[])[])[];
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
}

export interface MethodMetadata {
	name: string;
	options: MethodOptions;
}

export interface SocketOptions {
	/** path to websocket endpoint */
	path: string;
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
}

export interface Options extends SocketOptions {
	client?: MethodDef[];
	server?: MethodDef[];
	hash?: number;
}

export function getNames(methods: MethodDef[]) {
	return methods.map(i => typeof i === 'string' ? i : i[0]);
}

export function getIgnore(methods: MethodDef[]) {
	return methods.map(i => (typeof i !== 'string' && i[1].ignore) ? i[0] : null).filter(x => !!x);
}

export function getBinary(methods: MethodDef[]) {
	let result: Packets = {};
	methods.forEach(i => {
		if (typeof i !== 'string' && i[1].binary) {
			result[i[0]] = i[1].binary;
		}
	});
	return result;
}
