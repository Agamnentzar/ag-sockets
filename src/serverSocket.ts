import { Server as HttpServer, IncomingMessage } from 'http';
import * as ws from 'ws';
import { ServerOptions, ClientOptions, getNames, getBinary, getIgnore, SocketServer, Logger, Packet } from './interfaces';
import { checkRateLimit, getLength, cloneDeep, removeItem } from './utils';
import { ErrorHandler, OriginalRequest } from './server';
import { PacketHandler, MessageType, Send } from './packet/packetHandler';
import { DebugPacketHandler } from './packet/debugPacketHandler';
import { createHandlers } from './packet/binaryHandler';
import {
	ClientInternal, Server, ClientState, InternalServer, GlobalConfig, ServerHost, CreateServerMethod, CreateServer
} from './serverInterfaces';
import {
	hasToken, createToken, getToken, getTokenFromClient, returnTrue, createOriginalRequest, defaultErrorHandler,
	createServerOptions, optionsWithDefaults, toClientOptions, createRateLimit, getBinaryOnlyPackets, getQuery,
	callWithErrorHandling,
} from './serverUtils';
import { createBinaryWriter } from './packet/binaryWriter';

export function broadcast<TClient>(clients: TClient[], action: (client: TClient) => any) {
	if (clients && clients.length) {
		const hooks = (clients[0] as any as ClientInternal).__internalHooks;

		if (!hooks) {
			throw new Error('Invalid client');
		}

		hooks.executeForClients(clients, action);
	}
}

export function createServer<TServer, TClient>(
	httpServer: HttpServer,
	serverType: new (...args: any[]) => TServer,
	clientType: new (...args: any[]) => TClient,
	createServer: CreateServer<TServer, TClient>,
	options?: ServerOptions,
	errorHandler?: ErrorHandler,
	log?: Logger
) {
	return createServerRaw(httpServer, createServer, createServerOptions(serverType, clientType, options), errorHandler, log);
}

export function createServerRaw(
	httpServer: HttpServer, createServer: CreateServerMethod, options: ServerOptions, errorHandler?: ErrorHandler, log?: Logger
): Server {
	const host = createServerHost(httpServer, {
		path: options.path,
		errorHandler,
		log,
		ws: options.ws,
		perMessageDeflate: options.perMessageDeflate,
	});
	const socket = host.socketRaw(createServer, { id: 'socket', ...options });
	socket.close = host.close;
	return socket;
}

export function createServerHost(httpServer: HttpServer, globalConfig: GlobalConfig): ServerHost {
	const wsLibrary = (globalConfig.ws || require('ws')) as any as typeof ws;
	const {
		path = '/ws',
		log = console.log.bind(console),
		errorHandler = defaultErrorHandler,
		perMessageDeflate = true,
		errorCode = 400,
		errorName = 'Bad Request',
	} = globalConfig;
	const servers: InternalServer[] = [];

	const wsServer = new wsLibrary.Server({
		server: httpServer,
		path,
		perMessageDeflate,
		verifyClient,
	});

	wsServer.on('connection', (socket, request) => {
		try {
			const originalRequest = createOriginalRequest(socket, request);
			const query = getQuery(originalRequest.url);
			const server = getServer(query.id);
			connectClient(socket, server, originalRequest, errorHandler, log);
		} catch (e) {
			socket.terminate();
			errorHandler.handleError(null, e);
		}
	});

	wsServer.on('error', e => {
		errorHandler.handleError(null, e);
	});

	function getServer(id: any) {
		if (servers.length === 1) {
			return servers[0];
		}

		for (const server of servers) {
			if (server.id === id) {
				return server;
			}
		}

		throw new Error(`No server for given id (${id})`);
	}

	function verifyClient({ req }: { req: IncomingMessage }, next: (result: any, code: number, name: string) => void) {
		try {
			const query = getQuery(req.url);
			const server = getServer(query.id);

			if (!server.verifyClient(req)) {
				next(false, errorCode, errorName);
			} else if (server.clientLimit !== 0 && server.clientLimit <= server.clients.length) {
				next(false, errorCode, errorName);
			} else if (server.connectionTokens) {
				if (hasToken(server, query.t)) {
					next(true, 200, 'OK');
				} else {
					next(false, errorCode, errorName);
				}
			} else {
				next(true, 200, 'OK');
			}
		} catch (e) {
			errorHandler.handleError(null, e);
			next(false, errorCode, errorName);
		}
	}

	function close() {
		servers.forEach(closeServer);
		wsServer.close();
	}

	function closeAndRemoveServer(server: InternalServer) {
		closeServer(server);
		removeItem(servers, server);
	}

	function socket<TServer, TClient>(
		serverType: new (...args: any[]) => TServer,
		clientType: new (...args: any[]) => TClient,
		createServer: CreateServer<TServer, TClient>,
		baseOptions?: ServerOptions
	): Server {
		const options = createServerOptions(serverType, clientType, baseOptions);
		return socketRaw(createServer, options);
	}

	function socketRaw(createServer: CreateServerMethod, options: ServerOptions): Server {
		const internalServer = createInternalServer(createServer, { ...options, path }, errorHandler, log);

		if (servers.some(s => s.id === internalServer.id)) {
			throw new Error('Cannot open two sokets with the same id');
		}

		servers.push(internalServer);
		internalServer.server.close = () => closeAndRemoveServer(internalServer);
		return internalServer.server;
	}

	return { close, socket, socketRaw };
}

function createPacketHandler(options: ServerOptions, log: Logger): PacketHandler {
	if (!options.client || !options.server)
		throw new Error('Missing server or client method definitions');

	if (options.client.length > 250 || options.server.length > 250)
		throw new Error('Too many methods');

	const onlyBinary = getBinaryOnlyPackets(options.client);
	const handlers = createHandlers(getBinary(options.client), getBinary(options.server));
	const writer = createBinaryWriter();
	const serverMethods = getNames(options.server);
	const ignore = [...getIgnore(options.client), ...getIgnore(options.server)];

	return options.debug ?
		new DebugPacketHandler(
			serverMethods, serverMethods, writer, handlers, onlyBinary, ignore, log) :
		new PacketHandler(
			serverMethods, serverMethods, writer, handlers, onlyBinary, options.onSend, options.onRecv);
}

function createInternalServer(
	createServer: CreateServerMethod, options: ServerOptions, errorHandler: ErrorHandler, log: Logger,
): InternalServer {
	options = optionsWithDefaults(options);

	const packetHandler = createPacketHandler(options, log);
	const clientOptions = toClientOptions(options);
	const clientMethods = getNames(options.client!);
	const proxy: any = {};
	const server: InternalServer = {
		id: options.id || 'socket',
		clients: [],
		tokens: [],
		currentClientId: 1,
		path: options.path || '',
		hash: options.hash || 0,
		debug: !!options.debug,
		forceBinary: !!options.forceBinary,
		connectionTokens: !!options.connectionTokens,
		keepOriginalRequest: !!options.keepOriginalRequest,
		tokenLifetime: options.tokenLifetime || 0,
		clientLimit: options.clientLimit || 0,
		transferLimit: options.transferLimit || 0,
		verifyClient: options.verifyClient || returnTrue,
		serverMethods: options.server!,
		clientMethods,
		executeForClients,
		handleResult,
		createServer,
		packetHandler,
		server: {} as any,
		pingInterval: undefined,
		tokenInterval: undefined,
	};

	let proxyPacket: Packet | undefined;

	clientMethods.forEach((name, id) => proxy[name] = (...args: any[]) => proxyPacket = { id, name, args: [id, ...args] });

	function createPacket(action: (client: any) => any): Packet {
		action(proxy);
		const packet = proxyPacket!;
		proxyPacket = undefined;
		return packet;
	}

	function executeForClients(clients: ClientInternal[], action: (client: any) => any) {
		const packet = createPacket(action);
		clients.forEach(c => c.__internalHooks.sendPacket(packet));
	}

	function handleResult(send: Send, obj: ClientState, funcId: number, funcName: string, result: Promise<any>, messageId: number) {
		if (result && typeof result.then === 'function') {
			result.then(result => {
				packetHandler.send(
					send, `*resolve:${funcName}`, MessageType.Resolved, [funcId, messageId, result], obj.supportsBinary);
			}, (e: Error) => {
				e = errorHandler.handleRejection(obj.client, e) || e;
				packetHandler.send(
					send, `*reject:${funcName}`, MessageType.Rejected, [funcId, messageId, e ? e.message : 'error'], obj.supportsBinary);
			}).catch((e: Error) => errorHandler.handleError(obj.client, e));
		}
	}

	if (options.pingInterval) {
		server.pingInterval = setInterval(() => {
			const now = Date.now();

			server.clients.forEach(c => {
				try {
					if ((now - c.lastMessageTime) > options.connectionTimeout!) {
						c.client.disconnect();
					} else {
						c.ping();
					}
				} catch { }
			});
		}, options.pingInterval);
	}

	if (options.connectionTokens) {
		server.tokenInterval = setInterval(() => {
			const now = Date.now();
			server.tokens = server.tokens.filter(t => t.expire > now);
		}, 10000);
	}

	server.server = {
		get clients() {
			return server.clients;
		},
		close() {
			closeServer(server);
		},
		options(): ClientOptions {
			return cloneDeep(clientOptions);
		},
		token(data?: any) {
			if (!options.connectionTokens) {
				throw new Error('Option connectionTokens not set');
			} else {
				return createToken(server, data).id;
			}
		},
		clearTokens(test: (id: string, data?: any) => boolean) {
			if (!options.connectionTokens) {
				throw new Error('Option connectionTokens not set');
			}

			server.tokens = server.tokens
				.filter(t => !test(t.id, t.data));

			server.clients
				.filter(c => c.token && test(c.token.id, c.token.data))
				.forEach(c => c.client.disconnect(true, true));
		},
	};

	return server;
}

function closeServer(server: InternalServer) {
	if (server.pingInterval) {
		clearInterval(server.pingInterval);
		server.pingInterval = undefined;
	}

	if (server.tokenInterval) {
		clearInterval(server.tokenInterval);
		server.tokenInterval = undefined;
	}
}

function connectClient(
	socket: ws, server: InternalServer, originalRequest: OriginalRequest, errorHandler: ErrorHandler, log: Logger
) {
	const query = getQuery(originalRequest.url);
	const t = query.t || '';
	const token = server.connectionTokens ? getToken(server, t) || getTokenFromClient(server, t) : undefined;

	if (server.connectionTokens && !token) {
		errorHandler.handleError({ originalRequest } as any, new Error(`Invalid token: ${t}`));
		socket.terminate();
		return;
	}

	const rates = server.serverMethods.map(createRateLimit);
	const { executeForClients, handleResult } = server;

	let bytesReset = Date.now();
	let bytesReceived = 0;
	let transferLimitExceeded = false;
	let isConnected = true;
	let serverActions: SocketServer | undefined = undefined;

	const obj: ClientState = {
		lastMessageTime: Date.now(),
		lastMessageId: 0,
		supportsBinary: !!server.forceBinary || !!(query && query.bin === 'true'),
		token,
		ping() {
			socket.send('');
		},
		client: {
			__internalHooks: {
				executeForClients,
				sendPacket,
			},
			id: server.currentClientId++,
			tokenId: token ? token.id : undefined,
			tokenData: token ? token.data : undefined,
			originalRequest: server.keepOriginalRequest ? originalRequest : undefined,
			get isConnected() {
				return isConnected;
			},
			disconnect(force = false, invalidateToken = false) {
				if (invalidateToken) {
					obj.token = undefined;
				}

				if (force) {
					socket.terminate();
				} else {
					socket.close();
				}
			},
		},
	};

	function send(data: string | ArrayBuffer) {
		if (typeof data !== 'string') {
			socket.send(new Buffer(data));
		} else {
			socket.send(data);
		}
	}

	function sendPacket(packet: Packet) {
		server.packetHandler.sendPacket(send, packet, obj.supportsBinary);
	}

	function handleConnected(serverActions: SocketServer) {
		if (serverActions.connected) {
			callWithErrorHandling(() => serverActions.connected!(), () => { }, e => {
				errorHandler.handleError(obj.client, e);
				obj.client.disconnect();
			});
		}
	}

	function handleDisconnected(serverActions: SocketServer) {
		if (serverActions.disconnected) {
			callWithErrorHandling(() => serverActions.disconnected!(), () => { }, e => errorHandler.handleError(obj.client, e));
		}
	}

	function serverActionsCreated(serverActions: SocketServer) {
		socket.on('message', (message: string | Buffer | ArrayBuffer, flags?: { binary: boolean; }) => {
			try {
				if (transferLimitExceeded || !isConnected)
					return;

				const messageLength = getLength(message);
				bytesReceived += messageLength;

				let data: string | Uint8Array;

				if (message instanceof Buffer) {
					data = new Uint8Array(message.buffer, message.byteOffset, message.byteLength);
				} else if (message instanceof ArrayBuffer) {
					data = new Uint8Array(message);
				} else {
					data = message;
				}

				const now = Date.now();
				const diff = now - bytesReset;
				const bytesPerSecond = bytesReceived * 1000 / Math.max(1000, diff);
				const transferLimit = server.transferLimit;

				if (transferLimit && transferLimit < bytesPerSecond) {
					transferLimitExceeded = true;
					obj.client.disconnect(true, true);
					errorHandler.handleRecvError(
						obj.client, new Error(`Transfer limit exceeded ${bytesPerSecond.toFixed(0)}/${transferLimit} (${diff}ms)`), data);
					return;
				}

				if (server.forceBinary && typeof data === 'string') {
					obj.client.disconnect(true, true);
					errorHandler.handleRecvError(obj.client, new Error(`String message while forced binary`), data);
					return;
				}

				obj.lastMessageTime = Date.now();
				obj.supportsBinary = obj.supportsBinary || !!(flags && flags.binary);

				if (data && messageLength) {
					obj.lastMessageId++;
					const messageId = obj.lastMessageId;

					try {
						server.packetHandler.recv(data, serverActions, {}, (funcId, funcName, func, funcObj, args) => {
							const rate = rates[funcId];

							if (checkRateLimit(funcId, rates)) {
								handleResult(send, obj, funcId, funcName, func.apply(funcObj, args), messageId);
							} else if (rate && rate.promise) {
								handleResult(send, obj, funcId, funcName, Promise.reject(new Error('Rate limit exceeded')), messageId);
							} else {
								throw new Error(`Rate limit exceeded (${funcName})`);
							}
						});
					} catch (e) {
						errorHandler.handleRecvError(obj.client, e, data);
					}
				}

				if (diff > 1000) {
					bytesReceived = 0;
					bytesReset = now;
				}
			} catch (e) {
				errorHandler.handleError(obj.client, e);
			}
		});

		server.clientMethods.forEach((name, id) => {
			obj.client[name] = (...args: any[]) => server.packetHandler.send(send, name, id, args, obj.supportsBinary);
		});

		if (server.debug) {
			log('client connected');
		}

		server.packetHandler.send(send, '*version', MessageType.Version, [server.hash], obj.supportsBinary);
		server.clients.push(obj);

		handleConnected(serverActions);
	}

	socket.on('error', e => {
		errorHandler.handleError(obj.client, e);
	});

	socket.on('close', () => {
		try {
			isConnected = false;
			removeItem(server.clients, obj);

			if (server.debug) {
				log('client disconnected');
			}

			if (serverActions) {
				handleDisconnected(serverActions);
			}

			if (obj.token) {
				obj.token.expire = Date.now() + server.tokenLifetime;
				server.tokens.push(obj.token);
			}
		} catch (e) {
			errorHandler.handleError(obj.client, e);
		}
	});

	Promise.resolve(server.createServer(obj.client))
		.then(actions => {
			serverActions = actions;

			if (isConnected) {
				serverActionsCreated(serverActions);
			}
		})
		.catch(e => {
			socket.terminate();
			errorHandler.handleError(obj.client, e);
		});
}
