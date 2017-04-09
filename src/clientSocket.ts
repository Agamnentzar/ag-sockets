import * as Promise from 'bluebird';
import { SocketService, SocketServer, SocketClient, ClientOptions, FuncList, MethodOptions, getNames, getIgnore, getBinary, Logger } from './interfaces';
import { checkRateLimit, parseRateLimit, RateLimit, supportsBinary, Deferred, deferred, queryString } from './utils';
import { createHandlers } from './packet/binaryHandler';
import { PacketHandler } from './packet/packetHandler';
import { DebugPacketHandler } from './packet/debugPacketHandler';
import ArrayBufferPacketWriter from './packet/arrayBufferPacketWriter';
import ArrayBufferPacketReader from './packet/arrayBufferPacketReader';

export interface ClientErrorHandler {
	handleRecvError(error: Error, data: any): void;
}

const defaultErrorHandler: ClientErrorHandler = {
	handleRecvError(error: Error) {
		throw error;
	}
};

export class ClientSocket<TClient extends SocketClient, TServer extends SocketServer> implements SocketService<TClient, TServer> {
	client: TClient = <any>{};
	server: TServer = <any>{};
	sentSize = 0;
	receivedSize = 0;
	isConnected = false;
	supportsBinary = false;
	private special: FuncList = {};
	private socket: WebSocket | null;
	private connecting = false;
	private reconnectTimeout: any;
	private pingInterval: any;
	private lastPing = 0;
	private packet: PacketHandler<ArrayBuffer>;
	private lastSentId = 0;
	private versionValidated = false;
	private beforeunload = () => {
		if (this.socket) {
			try {
				this.socket.onclose = () => { };
				this.socket.close();
				this.socket = null;
			} catch (e) { }
		}
	}
	private defers = new Map<number, Deferred<any>>();
	private inProgressFields: { [key: string]: number } = {};
	private rateLimits: RateLimit[] = [];
	constructor(
		private options: ClientOptions,
		private token?: string | null,
		private errorHandler: ClientErrorHandler = defaultErrorHandler,
		private apply: (f: () => any) => void = f => f(),
		private log: Logger = console.log.bind(console)
	) {
		this.options.server.forEach((item, id) => {
			if (typeof item === 'string') {
				this.createMethod(item, id, {});
			} else {
				this.createMethod(item[0], id, item[1]);

				const rateLimit = item[1].rateLimit;

				if (rateLimit) {
					this.rateLimits[id] = { calls: [], ...parseRateLimit(rateLimit, false) };
				}
			}
		});

		this.special['*version'] = (version: number) => {
			if (version === this.options.hash) {
				this.versionValidated = true;
			} else if (this.client.invalidVersion) {
				this.client.invalidVersion(version, this.options.hash!);
			}
		};

		this.supportsBinary = supportsBinary();
	}
	private getWebsocketUrl() {
		const options = this.options;
		const protocol = (options.ssl || location.protocol === 'https:') ? 'wss://' : 'ws://';
		const host = options.host || location.host;
		const path = options.path || '/ws';
		const query = queryString({ ...options.requestParams, t: this.token, bin: this.supportsBinary });
		return `${protocol}${host}${path}${query}`;
	}
	connect() {
		this.connecting = true;

		if (this.socket)
			return;

		const options = this.options;
		this.socket = new WebSocket(this.getWebsocketUrl());

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

		this.supportsBinary = !!this.socket.binaryType;
		this.socket.binaryType = 'arraybuffer';
		this.socket.onmessage = message => {
			if (message.data) {
				try {
					this.receivedSize += this.packet.recv(message.data, this.client, this.special);
				} catch (e) {
					this.errorHandler.handleRecvError(e, message.data);
				}
			} else {
				this.sendPing();
			}
		};

		this.socket.onopen = () => {
			if (options.debug)
				this.log('socket opened');

			this.lastSentId = 0;
			this.isConnected = true;
			this.notifyServerOfBinarySupport();

			if (this.client.connected)
				this.client.connected();

			if (options.pingInterval)
				this.pingInterval = setInterval(() => this.sendPing(), options.pingInterval);
		};

		this.socket.onerror = e => {
			if (options.debug)
				this.log('socket error', e);
		};

		this.socket.onclose = e => {
			if (options.debug)
				this.log('socket closed', e);

			this.socket = null;
			this.versionValidated = false;

			if (this.isConnected) {
				this.isConnected = false;

				if (this.client.disconnected)
					this.client.disconnected();
			}

			if (this.connecting) {
				this.reconnectTimeout = setTimeout(() => {
					this.connect();
					this.reconnectTimeout = null;
				}, options.reconnectTimeout);
			}

			this.defers.forEach(d => d.reject(new Error('disconnected')));
			this.defers.clear();

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
	private notifyServerOfBinarySupport() {
		if (this.supportsBinary) {
			this.send(typeof Buffer !== 'undefined' ? new Buffer(0) : new ArrayBuffer(0));
		}
	}
	private send = (data: any) => {
		if (this.socket && this.socket.readyState === WebSocket.OPEN) {
			this.socket.send(data);
			return true;
		} else {
			return false;
		}
	}
	private sendPing() {
		try {
			const now = Date.now();
			const interval = this.options.pingInterval;

			if (this.versionValidated && interval && (now - this.lastPing) > interval && this.send('')) {
				this.lastPing = now;
			}
		} catch (e) { }
	}
	private createMethod(name: string, id: number, options: MethodOptions) {
		if (name) {
			if (options.promise) {
				this.createPromiseMethod(name, id, options.progress);
			} else {
				this.createSimpleMethod(name, id);
			}
		}
	}
	private createSimpleMethod(name: string, id: number) {
		this.server[name] = (...args: any[]) => {
			if (checkRateLimit(id, this.rateLimits)) {
				this.sentSize += this.packet.send(this.send, name, id, args, this.supportsBinary);
				this.lastSentId++;
				return true;
			} else {
				return false;
			}
		};
	}
	private createPromiseMethod(name: string, id: number, inProgressField?: string) {
		if (inProgressField) {
			this.inProgressFields[inProgressField] = 0;

			Object.defineProperty(this.server, inProgressField, {
				get: () => !!this.inProgressFields[inProgressField]
			});
		}

		this.server[name] = (...args: any[]): Promise<any> => {
			if (!this.isConnected)
				return Promise.reject<any>(new Error('not connected'));

			if (!checkRateLimit(id, this.rateLimits))
				return Promise.reject<any>(new Error('rate limit exceeded'));

			this.sentSize += this.packet.send(this.send, name, id, args, this.supportsBinary);
			const messageId = ++this.lastSentId;
			const defer = deferred<any>();
			this.defers.set(messageId, defer);

			if (inProgressField)
				this.inProgressFields[inProgressField]++;

			return defer.promise;
		};

		this.special['*resolve:' + name] = (messageId: number, result: any) => {
			const defer = this.defers.get(messageId);
			if (defer) {
				this.defers.delete(messageId);

				if (inProgressField)
					this.inProgressFields[inProgressField]--;

				this.apply(() => defer.resolve(result));
			}
		};

		this.special['*reject:' + name] = (messageId: number, error: string) => {
			const defer = this.defers.get(messageId);

			if (defer) {
				this.defers.delete(messageId);

				if (inProgressField)
					this.inProgressFields[inProgressField]--;

				this.apply(() => defer.reject(new Error(error)));
			}
		};
	}
}
