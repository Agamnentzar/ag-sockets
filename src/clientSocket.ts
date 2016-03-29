/// <reference path='../typings/main.d.ts' />

import * as Promise from 'bluebird';
import { SocketService, SocketServer, SocketClient, Options, FuncList, Packets, MethodDef, MethodOptions, getNames, getIgnore, getBinary, Logger } from './interfaces';
import { get, set, remove } from './map';
import { createHandlers } from './packet/binaryHandler';
import { PacketHandler } from './packet/packetHandler';
import { DebugPacketHandler } from './packet/debugPacketHandler';
import ArrayBufferPacketWriter from './packet/arrayBufferPacketWriter';
import ArrayBufferPacketReader from './packet/arrayBufferPacketReader';

export interface Deferred<T> {
	promise: Promise<T>;
	resolve(result?: T): void;
	reject(error?: Error): void;
}

export function deferred<T>(): Deferred<T> {
	var obj: Deferred<T> = <any>{};

	obj.promise = new Promise<T>(function (resolve, reject) {
		obj.resolve = resolve;
		obj.reject = reject;
	});

	return obj;
}

export class ClientSocket<TClient extends SocketClient, TServer extends SocketServer> implements SocketService<TClient, TServer> {
	client: TClient = <any>{};
	server: TServer = <any>{};
	sentSize = 0;
	receivedSize = 0;
	isConnected = false;
	private special: FuncList = {};
	private socket: WebSocket;
	private connecting = false;
	private reconnectTimeout: any;
	private pingInterval: any;
	private packet: PacketHandler<ArrayBuffer>;
	private lastSentId = 0;
	private versionValidated = false;
	private beforeunload = () => {
		if (this.socket) {
			try {
				this.socket.onclose = null;
				this.socket.close();
				this.socket = null;
			} catch (e) { }
		}
	};
	private defers: [number, Deferred<any>][] = [];
	private inProgressFields: { [key: string]: number } = {};
	constructor(private options: Options, private apply: (f: Function) => void = f => f(), private log: Logger = console.log.bind(console)) {
		this.options.server.forEach((item, id) => {
			if (typeof item === 'string') {
				this.createMethod(item, id, {});
			} else {
				this.createMethod(item[0], id, item[1]);
			}
		});

		this.special['*version'] = (version: number) => {
			if (version === this.options.hash) {
				this.versionValidated = true;
			} else if (this.client.invalidVersion) {
				this.client.invalidVersion(version, this.options.hash);
			}
		};
	}
	connect() {
		this.connecting = true;

		if (this.socket)
			return;

		const options = this.options;
		const protocol = options.ssl || location.protocol === 'https:' ? 'wss://' : 'ws://';

		this.socket = new WebSocket(protocol + location.host + options.path);

		window.addEventListener('beforeunload', this.beforeunload);

		const reader = new ArrayBufferPacketReader();
		const writer = new ArrayBufferPacketWriter();
		const handlers = createHandlers(getBinary(options.server), getBinary(options.client));
		const serverMethods = getNames(options.server);
		const clientmethods = getNames(options.client);
		const ignore = getIgnore(options.server).concat(getIgnore(options.client));

		if (options.debug)
			this.packet = new DebugPacketHandler(clientmethods, serverMethods, writer, reader, handlers, ignore, this.log);
		else
			this.packet = new PacketHandler(clientmethods, serverMethods, writer, reader, handlers);

		this.packet.supportsBinary = !!this.socket.binaryType;
		this.socket.binaryType = 'arraybuffer';
		this.socket.onmessage = message => {
			if (message.data) {
				this.receivedSize += this.packet.recv(message.data, this.client, this.special, () => { });
			}
		};

		this.socket.onopen = () => {
			if (options.debug)
				this.log('socket opened');

			this.lastSentId = 0;
			this.isConnected = true;

			if (this.client.connected)
				this.client.connected();

			if (options.pingInterval) {
				this.pingInterval = setInterval(() => {
					if (this.socket && this.versionValidated) {
						try {
							this.socket.send('');
						} catch (e) { }
					}
				}, options.pingInterval);
			}
		};

		this.socket.onerror = () => {
			if (options.debug)
				this.log('socket error');
		};

		this.socket.onclose = () => {
			if (options.debug)
				this.log('socket closed');

			this.socket = null;
			this.isConnected = false;
			this.versionValidated = false;

			if (this.client.disconnected)
				this.client.disconnected();

			if (this.connecting) {
				this.reconnectTimeout = setTimeout(() => {
					this.connect();
					this.reconnectTimeout = null;
				}, options.reconnectTimeout);
			}

			this.defers.forEach(d => d[1].reject(new Error('disconnected')));
			this.defers = [];
			Object.keys(this.inProgressFields).forEach(key => this.inProgressFields[key] = 0);

			if (this.pingInterval) {
				clearInterval(this.pingInterval);
				this.pingInterval = null;
			}
		};
	}
	disconnect() {
		this.connecting = false;

		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout);
			this.reconnectTimeout = null;
		}

		if (this.pingInterval) {
			clearInterval(this.pingInterval);
			this.pingInterval = null;
		}

		if (this.socket) {
			this.socket.close();
			this.socket = null;
		}

		window.removeEventListener('beforeunload', this.beforeunload);
	}
	private createMethod(name: string, id: number, options: MethodOptions) {
		if (options.promise) {
			this.createPromiseMethod(name, id, options.progress);
		} else {
			this.createSimpleMethod(name, id);
		}
	}
	private createSimpleMethod(name: string, id: number) {
		this.server[name] = (...args: any[]) => {
			this.sentSize += this.packet.send(this.socket, name, id, args);
			this.lastSentId++;
		};
	}
	private createPromiseMethod(name: string, id: number, inProgressField?: string) {
		if (inProgressField) {
			this.inProgressFields[inProgressField] = 0;

			Object.defineProperty(this.server, inProgressField, {
				get: () => !!this.inProgressFields[inProgressField]
			});
		}

		this.server[name] = (...args: any[]) => {
			if (this.isConnected) {
				this.sentSize += this.packet.send(this.socket, name, id, args);
				const messageId = ++this.lastSentId;
				const defer = deferred<any>();
				set(this.defers, messageId, defer);
				this.inProgressFields[inProgressField]++;
				return defer.promise;
			} else {
				return Promise.reject<any>('not connected');
			}
		};

		this.special['*resolve:' + name] = (messageId: number, result: any) => {
			const defer = get(this.defers, messageId);
			if (defer) {
				remove(this.defers, messageId);
				this.inProgressFields[inProgressField]--;
				this.apply(() => defer.resolve(result));
			}
		};

		this.special['*reject:' + name] = (messageId: number, error: string) => {
			const defer = get(this.defers, messageId);

			if (defer) {
				remove(this.defers, messageId);
				this.inProgressFields[inProgressField]--;
				this.apply(() => defer.reject(new Error(error)));
			}
		};
	}
}
