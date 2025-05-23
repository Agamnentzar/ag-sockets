import { Server as HttpServer, IncomingMessage } from 'http';
import { Socket } from 'net';
import * as ws from 'ws';
import { ClientOptions, getNames, SocketServer, Logger, MethodOptions } from './interfaces';
import { getLength, cloneDeep, checkRateLimit2 } from './utils';
import { ErrorHandler, OriginalRequest } from './server';
import { MessageType, Send, createPacketHandler, HandleResult, HandlerOptions } from './packet/packetHandler';
import { Server, ClientState, InternalServer, GlobalConfig, ServerHost, CreateServerMethod, CreateServer, ServerOptions } from './serverInterfaces';
import { hasToken, createToken, getToken, getTokenFromClient, returnTrue, createOriginalRequest, defaultErrorHandler, createServerOptions, optionsWithDefaults, toClientOptions, getQuery, callWithErrorHandling, parseRateLimitDef } from './serverUtils';
import { BinaryReader, createBinaryReaderFromBuffer, getBinaryReaderBuffer } from './packet/binaryReader';

const strings: string[] = [];

export function createServer<TServer, TClient>(
	httpServer: HttpServer | undefined,
	serverType: new (...args: any[]) => TServer,
	clientType: new (...args: any[]) => TClient,
	createServer: CreateServer<TServer, TClient>,
	options?: ServerOptions,
	errorHandler?: ErrorHandler,
	log?: Logger
) {
	return createServerRaw(httpServer, createServer, createServerOptions(serverType, clientType, options), errorHandler, log);
}

export function createServerRaw(httpServer: HttpServer | undefined, createServer: CreateServerMethod, options: ServerOptions, errorHandler?: ErrorHandler, log?: Logger): Server {
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

export function createServerHost(httpServer: HttpServer | undefined, globalConfig: GlobalConfig): ServerHost {
	const wsLibrary = (globalConfig.ws || require('ws')) as any as typeof ws;
	const {
		path = '/ws',
		log = console.log.bind(console),
		errorHandler = defaultErrorHandler,
		perMessageDeflate = true,
		errorCode = 400,
		errorName = 'Bad Request',
		nativePing = 0,
		timingStart = () => { },
		timingEnd = () => { },
	} = globalConfig;
	const servers: InternalServer[] = [];
	const wsServer = new wsLibrary.Server({
		server: httpServer,
		noServer: !httpServer,
		path,
		perMessageDeflate,
		verifyClient,
	});

	wsServer.on('connection', connectSocket);

	wsServer.on('error', e => {
		errorHandler.handleError(null, e);
	});

	if (nativePing) {
		if ('startAutoPing' in wsServer) {
			(wsServer as any).startAutoPing(nativePing);
		} else {
			throw new Error('Native ping is not supported');
		}
	}

	function getServer(id: any) {
		if (servers.length === 1) return servers[0];

		for (const server of servers) {
			if (server.id === id) return server;
		}

		throw new Error(`No server for given id (${id})`);
	}

	function verifyClient({ req }: { req: IncomingMessage }, next: (result: any, code: number, name: string) => void) {
		try {
			timingStart('verify client');
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
		} finally {
			timingEnd();
		}
	}

	function close() {
		servers.forEach(closeServer);
		wsServer.close();
	}

	function closeAndRemoveServer(server: InternalServer) {
		closeServer(server);
		const index = servers.indexOf(server);
		if (index !== -1) servers.splice(index, 1);
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
		const internalServer = createInternalServer(createServer, { ...options, path }, { timingStart, timingEnd }, errorHandler, log);

		if (servers.some(s => s.id === internalServer.id)) {
			throw new Error('Cannot open two sokets with the same id');
		}

		servers.push(internalServer);
		internalServer.server.close = () => closeAndRemoveServer(internalServer);
		return internalServer.server;
	}

	function upgrade(request: IncomingMessage, socket: Socket) {
		// have to run verifyClient manually because clusterws/cws doesn't do that
		verifyClient({ req: request }, (result, code, name) => {
			if (result) {
				wsServer.handleUpgrade(request, socket, Buffer.alloc(0), socket => connectSocket(socket, request));
			} else {
				if (socket.writable) {
					socket.write(
						`HTTP/1.1 ${code} ${name}\r\n` +
						`Connection: close\r\n` +
						`Content-Type: text/html\r\n` +
						`Content-Length: ${Buffer.byteLength(name)}\r\n` +
						'\r\n\r\n' +
						name
					);
				}
				socket.destroy();
			}
		});
	}

	function connectSocket(socket: ws, request: IncomingMessage) {
		try {
			timingStart('socket connected');
			const originalRequest = createOriginalRequest(socket, request);
			const query = getQuery(originalRequest.url);
			const server = getServer(query.id);
			connectClient(socket, server, originalRequest, errorHandler, log);
		} catch (e) {
			socket.terminate();
			errorHandler.handleError(null, e);
		} finally {
			timingEnd();
		}
	}

	return { close, socket, socketRaw, upgrade };
}

interface ExtraServerOptions {
	timingStart: (name: string) => void;
	timingEnd: () => void;
}

function createInternalServer(createServer: CreateServerMethod, options: ServerOptions, extraOptions: ExtraServerOptions, errorHandler: ErrorHandler, log: Logger): InternalServer {
	options = optionsWithDefaults(options);

	const onSend = options.onSend;
	const handlerOptions: HandlerOptions = {
		debug: options.debug,
		development: options.development,
		forceBinary: options.forceBinary,
		forceBinaryPackets: options.forceBinaryPackets,
		useBinaryByDefault: options.useBinaryByDefault,
		printGeneratedCode: options.printGeneratedCode,
		useBinaryResultByDefault: options.useBinaryResultByDefault,
		onSend,
		onRecv: options.onRecv,
		useBuffer: true,
	};

	const packetHandler = createPacketHandler(options.server, options.client, handlerOptions, log);
	const clientOptions = toClientOptions(options);
	const clientMethods = getNames(options.client!);
	const serverMethods = getNames(options.server!);
	const serverResults = serverMethods.map(name => `resolve (${name})`);
	const serverErrors = serverMethods.map(name => `reject (${name})`);
	const serverMethodOptions: MethodOptions[] = options.server!.map(m => Array.isArray(m) ? m[1] : {});
	const { createClient = x => x, verifyClient = returnTrue } = options;
	const { timingStart, timingEnd } = extraOptions;

	const server: InternalServer = {
		id: options.id ?? 'socket',
		clients: [],
		freeTokens: new Map(),
		clientsByToken: new Map(),
		totalSent: 0,
		totalReceived: 0,
		batchClient: undefined,
		currentClientId: options.clientBaseId ?? 1,
		path: options.path ?? '',
		hash: options.hash ?? '',
		debug: !!options.debug,
		forceBinary: !!options.forceBinary,
		connectionTokens: !!options.connectionTokens,
		keepOriginalRequest: !!options.keepOriginalRequest,
		errorIfNotConnected: !!options.errorIfNotConnected,
		tokenLifetime: options.tokenLifetime ?? 0,
		clientLimit: options.clientLimit ?? 0,
		transferLimit: options.transferLimit ?? 0,
		verifyClient,
		createClient,
		timingStart,
		timingEnd,
		serverMethods: options.server!,
		clientMethods,
		rateLimits: serverMethodOptions.map(parseRateLimitDef),
		resultBinary: serverMethodOptions.map(m => m.binaryResult ?? options.useBinaryResultByDefault ?? false),
		handleResult,
		createServer,
		packetHandler,
		server: {} as any,
		pingInterval: undefined,
		tokenInterval: undefined,
	};

	function handleResult(send: Send, obj: ClientState, funcId: number, funcBinary: boolean, result: Promise<any>, messageId: number) {
		if (obj.batch) throw new Error('Handling result in the middle of packet batching');
		
		if (result && typeof result.then === 'function') {
			result.then(result => {
				try {
					timingStart(serverResults[funcId]);

					if (obj.client.isConnected()) {
						if (funcBinary) {
							packetHandler.sendBinary(send, MessageType.Resolved, funcId, messageId, result);
						} else {
							packetHandler.sendString(send, MessageType.Resolved, funcId, messageId, result);
						}
					}
				} finally {
					timingEnd();
				}
			}, (e: Error) => {
				try {
					timingStart(serverErrors[funcId]);
					e = errorHandler.handleRejection(obj.client, e) || e;

					if (!obj.client.isConnected()) return;

					if (funcBinary) {
						packetHandler.sendBinary(send, MessageType.Rejected, funcId, messageId, e ? e.message : 'error');
					} else {
						packetHandler.sendString(send, MessageType.Rejected, funcId, messageId, e ? e.message : 'error');
					}
				} finally {
					timingEnd();
				}
			}).catch((e: Error) => errorHandler.handleError(obj.client, e));
		}
	}

	const pingInterval = options.pingInterval;

	if (pingInterval) {
		server.pingInterval = setInterval(() => {
			timingStart('ping');
			const now = Date.now();
			const threshold = now - pingInterval;
			const timeoutThreshold = now - options.connectionTimeout!;

			for (let i = 0; i < server.clients.length; i++) {
				const c = server.clients[i];

				try {
					if (c.lastMessageTime < timeoutThreshold) {
						c.client.disconnect(true, false, 'timeout');
					} else if (c.lastSendTime < threshold) {
						c.ping();
						if (onSend) onSend(-1, 'PING', 0, false);
					}
				} catch { }
			}
			timingEnd();
		}, pingInterval);
	}

	if (options.connectionTokens) {
		server.tokenInterval = setInterval(() => {
			timingStart('expire tokens');
			const now = Date.now();
			const ids: string[] = [];

			server.freeTokens.forEach(token => {
				if (token.expire < now) {
					ids.push(token.id);
				}
			});

			for (const id of ids) {
				server.freeTokens.delete(id);
			}
			timingEnd();
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
			return createToken(server, data).id;
		},
		clearToken(id: string) {
			server.freeTokens.delete(id);
			server.clientsByToken.get(id)?.client.disconnect(true, true, 'clear tokens');
		},
		clearTokens(test: (id: string, data?: any) => boolean) {
			const ids: string[] = [];

			server.freeTokens.forEach(token => {
				if (test(token.id, token.data)) {
					ids.push(token.id);
				}
			});

			server.clientsByToken.forEach(({ token }) => {
				if (token && test(token.id, token.data)) {
					ids.push(token.id);
				}
			});

			for (const id of ids) {
				this.clearToken(id);
			}
		},
		info() {
			const writerBufferSize = packetHandler.writerBufferSize();
			const freeTokens = server.freeTokens.size;
			const clientsByToken = server.clientsByToken.size;
			return { writerBufferSize, freeTokens, clientsByToken };
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

function connectClient(socket: ws, server: InternalServer, originalRequest: OriginalRequest, errorHandler: ErrorHandler, log: Logger) {
	const query = getQuery(originalRequest.url);
	const t = (query.t || '') as string;
	const token = server.connectionTokens ? getToken(server, t) || getTokenFromClient(server, t) : undefined;

	if (server.hash && query.hash !== server.hash) {
		if (server.debug) log('client disconnected (hash mismatch)');
		socket.send(JSON.stringify([MessageType.Version, 0, 0, server.hash]));
		socket.terminate();
		return;
	}

	if (server.connectionTokens && !token) {
		errorHandler.handleError({ originalRequest } as any, new Error(`Invalid token: ${t}`));
		socket.send(JSON.stringify([MessageType.Error, 0, 0, 'invalid token']));
		socket.terminate();
		return;
	}

	const callsList: number[] = [];
	const { timingStart, timingEnd, handleResult, createClient } = server;

	let bytesReset = Date.now();
	let bytesReceived = 0;
	let transferLimitExceeded = false;
	let isConnected = true;
	let serverActions: SocketServer | undefined = undefined;
	let closeReason: string | undefined = undefined;

	const obj: ClientState = {
		lastMessageTime: Date.now(),
		lastMessageId: 0,
		lastSendTime: Date.now(),
		sentSize: 0,
		supportsBinary: !!server.forceBinary || !!(query && query.bin === 'true'),
		batch: false,
		token,
		ping() {
			socket.send('');
		},
		client: createClient({
			id: server.currentClientId++,
			tokenId: token ? token.id : undefined,
			tokenData: token ? token.data : undefined,
			originalRequest: server.keepOriginalRequest ? originalRequest : undefined,
			transferLimit: server.transferLimit,
			isConnected() {
				return isConnected;
			},
			lastMessageTime() {
				return obj.lastMessageTime;
			},
			disconnect(force = false, invalidateToken = false, reason = '') {
				isConnected = false;

				if (invalidateToken && obj.token) {
					if (server.clientsByToken.get(obj.token.id) === obj) {
						server.clientsByToken.delete(obj.token.id);
					}
					obj.token = undefined;
				}

				if (force) {
					close(0, reason);
					socket.terminate();
				} else {
					closeReason = reason;
					socket.close();
				}
			},
			beginBatch() {
				if (server.batchClient) errorHandler.handleError(null, new Error(`Already in batch`));
				server.batchClient = obj;
				obj.batch = true;
			},
			commitBatch() {
				if (!server.batchClient) errorHandler.handleError(null, new Error(`Not in a batch`));
				if (server.batchClient !== obj) errorHandler.handleError(null, new Error(`Incorrect client for batch`));

				try {
					server.packetHandler.commitBatch(send, obj);
				} finally {
					server.batchClient = undefined;
					obj.batch = false;
				}
			},
		}, send),
	};

	if (obj.token) {
		server.clientsByToken.set(obj.token.id, obj);
	}

	// TODO: remove Uint8Array from here
	function send(data: string | Uint8Array | Buffer) {
		if (server.errorIfNotConnected && !isConnected) {
			errorHandler.handleError(obj.client, new Error('Not Connected'));
		}

		try {
			timingStart('send');
			if (data instanceof Buffer) {
				server.totalSent += data.byteLength;
				socket.send(data);
			} else if (typeof data !== 'string') {
				server.totalSent += data.byteLength;
				socket.send(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
			} else {
				server.totalSent += data.length;
				socket.send(data);
			}
		} finally {
			timingEnd();
		}

		obj.lastSendTime = Date.now();
	}

	const handleResult2: HandleResult = (funcId, funcBinary, result, messageId) => {
		handleResult(send, obj, funcId, funcBinary, result, messageId);
	};

	function serverActionsCreated(serverActions: SocketServer) {
		socket.on('message', (message: string | Buffer | ArrayBuffer, flags?: { binary: boolean; }) => {
			try {
				timingStart('packet');
				if (transferLimitExceeded || !isConnected) return;

				const messageLength = getLength(message);
				bytesReceived += messageLength;
				server.totalReceived += bytesReceived;

				let data: string | undefined = undefined;
				let reader: BinaryReader | undefined = undefined;

				if (messageLength) {
					if (message instanceof Buffer) {
						reader = createBinaryReaderFromBuffer(message.buffer, message.byteOffset, message.byteLength);
					} else if (message instanceof ArrayBuffer) {
						reader = createBinaryReaderFromBuffer(message, 0, message.byteLength);
					} else {
						data = message;
					}
				}

				const now = Date.now();
				const diff = now - bytesReset;
				const bytesPerSecond = bytesReceived * 1000 / Math.max(1000, diff);
				const transferLimit = obj.client.transferLimit;

				if (transferLimit && transferLimit < bytesPerSecond) {
					transferLimitExceeded = true;
					obj.client.disconnect(true, true, 'transfer limit');
					errorHandler.handleRecvError(obj.client, new Error(`Transfer limit exceeded ${bytesPerSecond.toFixed(0)}/${transferLimit} (${diff}ms)`), reader ? getBinaryReaderBuffer(reader) : data!);
					return;
				}

				if (server.forceBinary && data !== undefined) {
					obj.client.disconnect(true, true, 'non-binary message');
					errorHandler.handleRecvError(obj.client, new Error(`String message while forced binary`), reader ? getBinaryReaderBuffer(reader) : data!);
					return;
				}

				obj.lastMessageTime = Date.now();
				obj.supportsBinary = obj.supportsBinary || !!(flags && flags.binary);

				if (reader) {
					try {
						while (reader.offset < reader.view.byteLength) { // read batch of packets
							try {
								obj.lastMessageId++;
								server.packetHandler.recvBinary(reader, serverActions, {}, callsList, obj.lastMessageId, strings, handleResult2);
							} catch (e) {
								errorHandler.handleRecvError(obj.client, e, getBinaryReaderBuffer(reader));
							}
						}
					} finally {
						strings.length = 0;
					}
				} else if (data) {
					try {
						obj.lastMessageId++;
						const messageId = obj.lastMessageId;
						server.packetHandler.recvString(data, serverActions, {}, (funcId, func, funcObj, args) => {
							const rate = server.rateLimits[funcId];
							const funcBinary = server.resultBinary[funcId];

							// TODO: move rate limits to packet handler
							if (checkRateLimit2(funcId, callsList, server.rateLimits)) {
								handleResult(send, obj, funcId, funcBinary, func.apply(funcObj, args), messageId);
							} else if (rate && rate.promise) {
								handleResult(send, obj, funcId, funcBinary, Promise.reject(new Error('Rate limit exceeded')), messageId);
							} else {
								throw new Error(`Rate limit exceeded (${funcId})`);
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
			} finally {
				timingEnd();
			}
		});

		server.packetHandler.createRemote(obj.client, send, obj);

		if (server.debug) log('client connected');

		server.packetHandler.sendString(send, MessageType.Version, 0, 0, server.hash);
		server.clients.push(obj);

		if (serverActions.connected) {
			callWithErrorHandling(() => serverActions.connected!(), () => { }, e => {
				errorHandler.handleError(obj.client, e);
				obj.client.disconnect(false, false, 'error on connected()');
			});
		}
	}

	let closed = false;

	function close(code: number, reason: string) {
		if (closed) return;

		try {
			timingStart('socket closed');
			closed = true;
			isConnected = false;

			// remove client
			const index = server.clients.indexOf(obj);
			if (index !== -1) {
				server.clients[index] = server.clients[server.clients.length - 1];
				server.clients.pop();
			}

			if (server.debug) log('client disconnected');

			if (serverActions?.disconnected) {
				callWithErrorHandling(() => serverActions!.disconnected!(code, closeReason || reason), () => { },
					e => errorHandler.handleError(obj.client, e));
			}

			if (obj.token) {
				obj.token.expire = Date.now() + server.tokenLifetime;

				if (server.clientsByToken.get(obj.token.id) === obj) {
					server.clientsByToken.delete(obj.token.id);
					server.freeTokens.set(obj.token.id, obj.token);
				}
			}
		} catch (e) {
			errorHandler.handleError(obj.client, e);
		} finally {
			timingEnd();
		}
	}

	socket.on('error', e => errorHandler.handleError(obj.client, e));
	socket.on('close', close);

	Promise.resolve(server.createServer(obj.client))
		.then(actions => {
			timingStart('client connected');
			if (isConnected) {
				serverActions = actions;
				serverActionsCreated(serverActions);
			}
			timingEnd();
		})
		.catch(e => {
			socket.terminate();
			errorHandler.handleError(obj.client, e);
		});
}
