import {
	SocketService, SocketServer, SocketClient, ClientOptions, FuncList, MethodOptions, getNames, getIgnore,
	getBinary, Logger, PacketHandlerHooks
} from './interfaces';
import {
	checkRateLimit, parseRateLimit, RateLimit, supportsBinary as isSupportingBinary, Deferred, deferred,
	queryString
} from './utils';
import { createHandlers } from './packet/binaryHandler';
import { PacketHandler } from './packet/packetHandler';
import { DebugPacketHandler } from './packet/debugPacketHandler';
import { createBinaryWriter } from './packet/binaryWriter';

export interface ClientErrorHandler {
	handleRecvError(error: Error, data: string | Uint8Array): void;
}

const defaultErrorHandler: ClientErrorHandler = {
	handleRecvError(error: Error) {
		throw error;
	}
};

const packetHandlerHooks: PacketHandlerHooks = {
	writing() { },
	sending() { },
	done() { },
};

export function createClientSocket<TClient extends SocketClient, TServer extends SocketServer>(
	options: ClientOptions,
	token?: string | null | undefined,
	errorHandler: ClientErrorHandler = defaultErrorHandler,
	apply: (f: () => any) => void = f => f(),
	log: Logger = console.log.bind(console),
): SocketService<TClient, TServer> {
	const special: FuncList = {};
	const defers = new Map<number, Deferred<any>>();
	const inProgressFields: { [key: string]: number } = {};
	const rateLimits: RateLimit[] = [];
	const convertToArrayBuffer = typeof navigator !== 'undefined' && /MSIE 10|Trident\/7/.test(navigator.userAgent);
	const now = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();
	let supportsBinary = isSupportingBinary();
	let socket: WebSocket | null = null;
	let connecting = false;
	let reconnectTimeout: any;
	let pingInterval: any;
	let lastPing = 0;
	let packet: PacketHandler | undefined = undefined;
	let lastSentId = 0;
	let versionValidated = false;

	const clientSocket: SocketService<TClient, TServer> = {
		client: {} as any as TClient,
		server: {} as any as TServer,
		sentSize: 0,
		receivedSize: 0,
		lastPacket: 0,
		isConnected: false,
		connect,
		disconnect,
		supportsBinary,
	};

	options.server.forEach((item, id) => {
		if (typeof item === 'string') {
			createMethod(item, id, {});
		} else {
			createMethod(item[0], id, item[1]);

			const rateLimit = item[1].rateLimit;

			if (rateLimit) {
				rateLimits[id] = { calls: [], ...parseRateLimit(rateLimit, false) };
			}
		}
	});

	special['*version'] = (version: number) => {
		if (version === options.hash) {
			versionValidated = true;
			lastSentId = 0;
			clientSocket.isConnected = true;
			notifyServerOfBinarySupport();

			if (clientSocket.client.connected) {
				clientSocket.client.connected();
			}
		} else {
			disconnect();

			if (clientSocket.client.invalidVersion) {
				clientSocket.client.invalidVersion(version, options.hash!);
			}
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
		const protocol = (options.ssl || location.protocol === 'https:') ? 'wss://' : 'ws://';
		const host = options.host || location.host;
		const path = options.path || '/ws';
		const id = options.id || 'socket';
		const query = queryString({ ...options.requestParams, id, t: token, bin: supportsBinary });
		return `${protocol}${host}${path}${query}`;
	}

	function connect() {
		connecting = true;

		if (socket) {
			return;
		}

		const theSocket = socket = new WebSocket(getWebsocketUrl());

		window.addEventListener('beforeunload', beforeunload);

		const writer = createBinaryWriter();
		const handlers = createHandlers(getBinary(options.server), getBinary(options.client));
		const serverMethods = getNames(options.server);
		const clientmethods = getNames(options.client);
		const ignore = [...getIgnore(options.server), ...getIgnore(options.client)];

		if (options.debug) {
			packet = new DebugPacketHandler(clientmethods, serverMethods, writer, handlers, {}, ignore, log);
		} else {
			packet = new PacketHandler(clientmethods, serverMethods, writer, handlers, {});
		}

		supportsBinary = !!theSocket.binaryType;

		theSocket.binaryType = 'arraybuffer';
		theSocket.onmessage = message => {
			if (socket !== theSocket) {
				return;
			}

			clientSocket.lastPacket = now();

			const messageData: string | ArrayBuffer | undefined = message.data;

			if (messageData && packet && (typeof messageData === 'string' || messageData.byteLength > 0)) {
				const data = typeof messageData === 'string' ? messageData : new Uint8Array(messageData);

				try {
					clientSocket.receivedSize += packet.recv(data, clientSocket.client, special);
				} catch (e) {
					errorHandler.handleRecvError(e, data);
				}
			} else {
				sendPing();
			}
		};

		theSocket.onopen = () => {
			if (socket !== theSocket) {
				theSocket.close();
				return;
			}

			clientSocket.lastPacket = now();

			if (options.debug) {
				log('socket opened');
			}

			if (options.pingInterval) {
				pingInterval = setInterval(() => sendPing(), options.pingInterval);
			}
		};

		theSocket.onerror = e => {
			if (options.debug) {
				log('socket error', e);
			}
		};

		theSocket.onclose = e => {
			if (options.debug) {
				log('socket closed', e);
			}

			if (socket && socket !== theSocket) {
				return;
			}

			socket = null;
			versionValidated = false;

			if (clientSocket.isConnected) {
				clientSocket.isConnected = false;

				if (clientSocket.client.disconnected) {
					clientSocket.client.disconnected();
				}
			}

			if (connecting) {
				reconnectTimeout = setTimeout(() => {
					connect();
					reconnectTimeout = null;
				}, options.reconnectTimeout);
			}

			defers.forEach(d => d.reject(new Error('disconnected')));
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

	function notifyServerOfBinarySupport() {
		if (supportsBinary) {
			send(new ArrayBuffer(0));
		}
	}

	function send(data: any) {
		if (socket && socket.readyState === WebSocket.OPEN) {
			if (convertToArrayBuffer && data instanceof Uint8Array) {
				const buffer = new ArrayBuffer(data.byteLength);
				const view = new Uint8Array(buffer);
				view.set(data);
				data = buffer;
			}

			socket.send(data);
			return true;
		} else {
			return false;
		}
	}

	function sendPing() {
		try {
			const now = Date.now();
			const interval = options.pingInterval;

			if (versionValidated && interval && (now - lastPing) > interval && sendPingPacket()) {
				lastPing = now;
			}
		} catch { }
	}

	function sendPingPacket() {
		return send(supportsBinary ? new ArrayBuffer(0) : '');
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
		clientSocket.server[name] = (...args: any[]) => {
			if (checkRateLimit(id, rateLimits) && packet) {
				clientSocket.sentSize += packet.send(send, name, id, args, supportsBinary, packetHandlerHooks);
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

		clientSocket.server[name] = (...args: any[]): Promise<any> => {
			if (!clientSocket.isConnected) {
				return Promise.reject(new Error('not connected'));
			}

			if (!checkRateLimit(id, rateLimits)) {
				return Promise.reject(new Error('rate limit exceeded'));
			}

			if (!packet) {
				return Promise.reject(new Error('not initialized'));
			}

			clientSocket.sentSize += packet.send(send, name, id, args, supportsBinary, packetHandlerHooks);
			const messageId = ++lastSentId;
			const defer = deferred<any>();
			defers.set(messageId, defer);

			if (inProgressField) {
				inProgressFields[inProgressField]++;
			}

			return defer.promise;
		};

		special['*resolve:' + name] = (messageId: number, result: any) => {
			const defer = defers.get(messageId);
			if (defer) {
				defers.delete(messageId);

				if (inProgressField) {
					inProgressFields[inProgressField]--;
				}

				apply(() => defer.resolve(result));
			}
		};

		special['*reject:' + name] = (messageId: number, error: string) => {
			const defer = defers.get(messageId);

			if (defer) {
				defers.delete(messageId);

				if (inProgressField)
					inProgressFields[inProgressField]--;

				apply(() => defer.reject(new Error(error)));
			}
		};
	}

	return clientSocket;
}
