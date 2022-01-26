import {
	SocketService, SocketServer, SocketClient, ClientOptions, FuncList, MethodOptions, Logger, RateLimitDef
} from './interfaces';
import { supportsBinary as isSupportingBinary, Deferred, deferred, queryString, parseRateLimit, checkRateLimit2 } from './utils';
import { PacketHandler, createPacketHandler } from './packet/packetHandler';
import { createBinaryReaderFromBuffer } from './packet/binaryReader';

export interface ClientErrorHandler {
	handleRecvError(error: Error, data: string | Uint8Array): void;
}

const defaultErrorHandler: ClientErrorHandler = {
	handleRecvError(error: Error) {
		throw error;
	}
};


export function createClientSocket<TClient extends SocketClient, TServer extends SocketServer>(
	originalOptions: ClientOptions,
	token?: string | null | undefined,
	errorHandler: ClientErrorHandler = defaultErrorHandler,
	apply: (f: () => any) => void = f => f(),
	log: Logger = console.log.bind(console),
): SocketService<TClient, TServer> {
	const special: FuncList = {};
	const defers = new Map<number, Deferred<any>>();
	const inProgressFields: { [key: string]: number } = {};
	const convertToArrayBuffer = typeof navigator !== 'undefined' && /MSIE 10|Trident\/7/.test(navigator.userAgent);
	const now = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();
	const copySendBuffer = originalOptions.copySendBuffer;
	const callsLists: number[] = [];
	const rateLimits: (RateLimitDef | undefined)[] = originalOptions.server.map(() => undefined);
	const pingBuffer = new ArrayBuffer(0);
	let supportsBinary = isSupportingBinary();
	let socket: WebSocket | null = null;
	let connecting = false;
	let reconnectTimeout: any;
	let pingInterval: any;
	let lastSend = 0;
	let packet: PacketHandler | undefined = undefined;
	let remote: { [key: string]: Function; } | undefined = undefined;
	let lastSentId = 0;
	let versionValidated = false;
	let lastTokenRefresh = Date.now();

	const clientSocket: SocketService<TClient, TServer> = {
		client: {} as any as TClient,
		server: {} as any as TServer,
		sentSize: 0,
		receivedSize: 0,
		sentPackets: 0,
		receivedPackets: 0,
		lastPacket: 0,
		isConnected: false,
		supportsBinary,
		options: originalOptions,
		connect,
		disconnect,
		socket: () => socket,
	};

	originalOptions.server.forEach((item, id) => {
		if (typeof item === 'string') {
			createMethod(item, id, {});
		} else {
			createMethod(item[0], id, item[1]);

			if (item[1].rateLimit) {
				rateLimits[id] = { promise: false, ...parseRateLimit(item[1].rateLimit, false) };
			}
		}
	});

	special['*version'] = (version: number) => {
		if (version === clientSocket.options.hash) {
			versionValidated = true;
			lastSentId = 0;
			clientSocket.isConnected = true;

			// notify server of binary support
			if (supportsBinary) send(pingBuffer);

			clientSocket.client.connected?.();
		} else {
			disconnect();
			clientSocket.client.invalidVersion?.(version, clientSocket.options.hash!);
		}
	};

	function beforeunload() {
		if (socket) {
			try {
				socket.onclose = () => { };
				socket.close();
				socket = null;
			} catch { }
		}
	}

	function getWebsocketUrl() {
		const options = clientSocket.options;
		const protocol = (options.ssl || location.protocol === 'https:') ? 'wss://' : 'ws://';
		const host = options.host || location.host;
		const path = options.path || '/ws';
		const id = options.id || 'socket';
		const query = queryString({ ...options.requestParams, id, t: token, bin: supportsBinary });
		return `${protocol}${host}${path}${query}`;
	}

	function connect() {
		connecting = true;

		if (socket) return;

		const options = clientSocket.options;
		const theSocket = socket = new WebSocket(getWebsocketUrl());
		const mockCallsList: number[] = [];

		window.addEventListener('beforeunload', beforeunload);

		packet = createPacketHandler(options.client, options.server, options, log);

		remote = {};
		packet.createRemote(remote, send, clientSocket);

		supportsBinary = !!theSocket.binaryType;

		theSocket.binaryType = 'arraybuffer';
		theSocket.onmessage = message => {
			if (socket !== theSocket) return;

			clientSocket.lastPacket = now();
			clientSocket.receivedPackets++;

			const data: string | ArrayBuffer | undefined = message.data;

			if (data && packet && (typeof data === 'string' || data.byteLength > 0)) {
				try {
					if (typeof data === 'string') {
						clientSocket.receivedSize += data.length;
						packet.recvString(data, clientSocket.client, special);
					} else {
						clientSocket.receivedSize += data.byteLength;
						const reader = createBinaryReaderFromBuffer(data, 0, data.byteLength);
						packet.recvBinary(clientSocket.client, reader, mockCallsList, 0);
					}
				} catch (e) {
					errorHandler.handleRecvError(e, typeof data === 'string' ? data : new Uint8Array(data));
				}
			}

			sendPing(); // need to send ping here because setInterval in unreliable on some browsers when the tab is in the background
		};

		theSocket.onopen = () => {
			if (socket !== theSocket) {
				theSocket.close();
				return;
			}

			clientSocket.lastPacket = now();

			if (options.debug) log('socket opened');

			if (options.pingInterval) {
				pingInterval = setInterval(sendPing, options.pingInterval);
			}
		};

		theSocket.onerror = e => {
			if (options.debug) log('socket error', e);
		};

		theSocket.onclose = e => {
			if (options.debug) log('socket closed', e);
			if (socket && socket !== theSocket) return;

			socket = null;
			versionValidated = false;

			if (clientSocket.isConnected) {
				lastTokenRefresh = Date.now();
				clientSocket.isConnected = false;
				clientSocket.client.disconnected?.(e.code, e.reason);
			}

			if (connecting) {
				if (options.tokenLifetime && (lastTokenRefresh + options.tokenLifetime) < Date.now()) {
					disconnect();
				} else {
					reconnectTimeout = setTimeout(() => {
						connect();
						reconnectTimeout = null;
					}, options.reconnectTimeout);
				}
			}

			defers.forEach(d => d.reject(new Error(`Disconnected (${(d as any).name})`)));
			defers.clear();

			Object.keys(inProgressFields).forEach(key => inProgressFields[key] = 0);

			if (pingInterval) {
				clearInterval(pingInterval);
				pingInterval = null;
			}
		};
	}

	function disconnect() {
		connecting = false;

		if (reconnectTimeout) {
			clearTimeout(reconnectTimeout);
			reconnectTimeout = null;
		}

		if (pingInterval) {
			clearInterval(pingInterval);
			pingInterval = null;
		}

		if (socket) {
			if (clientSocket.isConnected) {
				socket.close();
			}

			socket = null;
		}

		window.removeEventListener('beforeunload', beforeunload);
	}

	function send(data: string | ArrayBuffer | Uint8Array) {
		if (socket && socket.readyState === WebSocket.OPEN) {
			// HACK: fix for IE
			if (convertToArrayBuffer && data instanceof Uint8Array) {
				const buffer = new ArrayBuffer(data.byteLength);
				const view = new Uint8Array(buffer);
				view.set(data);
				data = buffer;
			}

			if (copySendBuffer && data instanceof Uint8Array) {
				data = data.slice();
			}

			socket.send(data);
			clientSocket.sentPackets++;
			lastSend = Date.now();
			return true;
		} else {
			return false;
		}
	}

	function sendPing() {
		try {
			const now = Date.now();
			const interval = clientSocket.options.pingInterval;

			if (versionValidated && interval && (now - lastSend) > interval) {
				send(supportsBinary ? pingBuffer : '');
			}
		} catch { }
	}

	function createMethod(name: string, id: number, options: MethodOptions) {
		if (name) {
			if (options.promise) {
				createPromiseMethod(name, id, options.progress);
			} else {
				createSimpleMethod(name, id);
			}
		}
	}

	function createSimpleMethod(name: string, id: number) {
		(clientSocket.server as any)[name] = (...args: any[]) => {
			if (checkRateLimit2(id, callsLists, rateLimits) && packet && remote) {
				remote[name].apply(null, args);
				lastSentId++;
				return true;
			} else {
				return false;
			}
		};
	}

	function createPromiseMethod(name: string, id: number, inProgressField?: string) {
		if (inProgressField) {
			inProgressFields[inProgressField] = 0;

			Object.defineProperty(clientSocket.server, inProgressField, {
				get: () => !!inProgressFields[inProgressField]
			});
		}

		(clientSocket.server as any)[name] = (...args: any[]): Promise<any> => {
			if (!clientSocket.isConnected)
				return Promise.reject(new Error('Not connected'));

			if (!checkRateLimit2(id, callsLists, rateLimits))
				return Promise.reject(new Error('Rate limit exceeded'));

			if (!packet || !remote)
				return Promise.reject(new Error('Not initialized'));

			remote[name].apply(null, args);
			const messageId = ++lastSentId;
			const defer = deferred<any>();
			(defer as any).name = name;
			defers.set(messageId, defer);

			if (inProgressField) inProgressFields[inProgressField]++;

			return defer.promise;
		};

		special['*resolve:' + name] = (messageId: number, result: any) => {
			const defer = defers.get(messageId);

			if (defer) {
				defers.delete(messageId);

				if (inProgressField) inProgressFields[inProgressField]--;

				apply(() => defer.resolve(result));
			}
		};

		special['*reject:' + name] = (messageId: number, error: string) => {
			const defer = defers.get(messageId);

			if (defer) {
				defers.delete(messageId);

				if (inProgressField) inProgressFields[inProgressField]--;

				apply(() => defer.reject(new Error(error)));
			}
		};
	}

	return clientSocket;
}
