import { Server as HttpServer, ServerRequest } from 'http';
import * as ws from 'ws';
import * as Promise from 'bluebird';
import { cloneDeep, assign, remove, findIndex } from 'lodash';
import { parse as parseUrl } from 'url';
import { ServerOptions, ClientOptions, MethodDef, getNames, getBinary, getIgnore, SocketServer, Logger } from './interfaces';
import { randomString, checkRateLimit, parseRateLimit, RateLimit } from './utils';
import { SocketServerClient, ErrorHandler } from './server';
import { getSocketMetadata, getMethods } from './method';
import { PacketHandler, MessageType, Packet } from './packet/packetHandler';
import { DebugPacketHandler } from './packet/debugPacketHandler';
import { createHandlers } from './packet/binaryHandler';
import BufferPacketWriter from './packet/bufferPacketWriter';
import BufferPacketReader from './packet/bufferPacketReader';

export interface Token {
	id: string;
	expire: number;
}

export interface ServerHooks {
	sendPacket(packet: Packet): void;
	executeForClients(clients: any[], action: (client: any) => any): void;
}

export interface ClientInternal {
	__internalHooks: ServerHooks;
}

export interface Client {
	lastMessageTime: number;
	lastMessageId: number;
	token: Token | null;
	ping(): void;
	client: SocketServerClient & ClientInternal;
	supportsBinary: boolean;
}

export interface Server {
	clients: Client[];
	close(): void;
	options(): ClientOptions;
}

const defaultErrorHandler: ErrorHandler = {
	handleError() { },
	handleRejection() { },
	handleRecvError() { },
};

function getMethodsFromType(ctor: Function) {
	return getMethods(ctor).map<MethodDef>(m => Object.keys(m.options).length ? [m.name, m.options] : m.name);
}

function callWithErrorHandling(action: () => any, handle: (e: Error) => void) {
	try {
		const result = action();

		if (result && result.catch) {
			result.catch(handle);
		}
	} catch (e) {
		handle(e);
	}
}

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
	server: HttpServer,
	serverType: new (...args: any[]) => TServer,
	clientType: new (...args: any[]) => TClient,
	createServer: (client: TClient & SocketServerClient) => TServer,
	options?: ServerOptions,
	errorHandler?: ErrorHandler,
	log?: Logger
) {
	return create(server, createServer, assign({}, getSocketMetadata(serverType), options, {
		client: getMethodsFromType(clientType),
		server: getMethodsFromType(serverType),
	}) as ClientOptions, errorHandler, log);
}

export function create(
	server: HttpServer,
	createServer: (client: any) => SocketServer,
	options: ClientOptions,
	errorHandler: ErrorHandler = defaultErrorHandler,
	log: Logger = console.log.bind(console)
): Server {
	if (options.client.length > 250 || options.server.length > 250)
		throw new Error('too many methods');

	options.hash = options.hash || Date.now();
	options.path = options.path || '/ws';
	options.tokenLifetime = options.tokenLifetime || 3600 * 1000; // 1 hour
	options.reconnectTimeout = options.reconnectTimeout || 500; // 0.5 sec
	options.connectionTimeout = options.connectionTimeout || 10000; // 10 sec

	let currentClientId = 1;
	let tokens: Token[] = [];
	const clients: Client[] = [];
	const verifyClient = options.verifyClient;
	const wsLibrary: typeof ws = (options.ws || ws) as any;

	delete options.ws;
	delete options.verifyClient;

	function createToken(): Token {
		const token = {
			id: randomString(16),
			expire: Date.now() + options.tokenLifetime,
		};
		tokens.push(token);
		return token;
	}

	function getToken(id: string): Token | null {
		const token = remove(tokens, t => t.id === id)[0];
		return token && token.expire < Date.now() ? null : token;
	}

	function getTokenFromClient(id: string): Token | null {
		const index = findIndex(clients, c => c.token && c.token.id === id);

		if (index !== -1) {
			const { client, token } = clients[index];
			client.disconnect(true);
			return token;
		} else {
			return null;
		}
	}

	function hasToken(id: string) {
		return tokens.some(t => t.id === id) || clients.some(c => !!(c.token && c.token.id === id));
	}

	const wsServer = new wsLibrary.Server({
		server: server,
		path: options.path,
		perMessageDeflate: typeof options.perMessageDeflate === 'undefined' ? true : options.perMessageDeflate,
		verifyClient({ req }: { req: ServerRequest }, callback: (result: boolean) => void) {
			Promise.resolve()
				.then(() => verifyClient ? verifyClient(req) : true)
				.then(result => {
					if (!result) {
						return false;
					} else if (options.clientLimit && options.clientLimit <= clients.length) {
						return false;
					} else if (options.connectionTokens) {
						return hasToken(parseUrl(req.url || '', true).query.t);
					} else {
						return true;
					}
				})
				.then(result => callback(result))
				.catch((e: Error) => {
					errorHandler.handleError(null, e);
					callback(false);
				});
		}
	});

	const handlers = createHandlers(getBinary(options.client), getBinary(options.server));
	const reader = new BufferPacketReader();
	const writer = new BufferPacketWriter();
	const serverMethods = getNames(options.server);
	const clientMethods = getNames(options.client);
	const ignore = getIgnore(options.client).concat(getIgnore(options.server));
	const packetHandler = options.debug ?
		new DebugPacketHandler(serverMethods, serverMethods, writer, reader, handlers, ignore, log) :
		new PacketHandler(serverMethods, serverMethods, writer, reader, handlers);

	const proxy: any = {};
	let proxyPacket: Packet | null = null;
	//let clients: any[];

	clientMethods.forEach((name, id) => proxy[name] = (...args: any[]) => proxyPacket = { id, name, args: [id, ...args] });

	function createPacket(action: (client: any) => any): Packet {
		action(proxy);
		const packet = proxyPacket!;
		proxyPacket = null;
		return packet;
	}

	function executeForClients(clients: ClientInternal[], action: (client: any) => any) {
		const packet = createPacket(action);
		clients.forEach(c => c.__internalHooks.sendPacket(packet));
	}

	function handleResult(socket: any, obj: Client, funcId: number, funcName: string, result: Promise<any>, messageId: number) {
		if (result && typeof result.then === 'function') {
			result.then(result => {
				packetHandler.send(socket, `*resolve:${funcName}`, MessageType.Resolved, [funcId, messageId, result], obj.supportsBinary);
			}, (e: Error) => {
				errorHandler.handleRejection(obj.client, e);
				packetHandler.send(socket, `*reject:${funcName}`, MessageType.Rejected, [funcId, messageId, e ? e.message : 'error'], obj.supportsBinary);
			}).catch((e: Error) => errorHandler.handleError(obj.client, e));
		}
	}

	function onConnection(socket: ws) {
		const query = parseUrl(socket.upgradeReq.url || '', true).query;
		const token = options.connectionTokens ? getToken(query.t) || getTokenFromClient(query.t) : null;

		if (options.connectionTokens && !token) {
			errorHandler.handleError({ originalRequest: socket.upgradeReq } as any, new Error(`invalid token: ${query.t}`));
			socket.terminate();
			return;
		}

		const rates = options.server
			.map(v => typeof v !== 'string' && v[1].rateLimit ? v[1] : null)
			.map(v => v ? assign({ calls: [], promise: !!v.promise }, parseRateLimit(v.rateLimit!)) as RateLimit : null);

		let bytesReset = Date.now();
		let transferLimitExceeded = false;

		const obj: Client = {
			lastMessageTime: Date.now(),
			lastMessageId: 0,
			supportsBinary: query.bin === 'true',
			token,
			ping() {
				socket.send('');
			},
			client: {
				__internalHooks: {
					executeForClients,
					sendPacket,
				},
				id: currentClientId++,
				isConnected: true,
				tokenId: token ? token.id : void 0,
				originalRequest: socket.upgradeReq,
				disconnect(force = false, invalidateToken = false) {
					if (invalidateToken) {
						obj.token = null;
					}

					if (force) {
						socket.terminate();
					} else {
						socket.close();
					}
				},
			},
		};

		function sendPacket(packet: Packet) {
			packetHandler.sendPacket(socket as any, packet, obj.supportsBinary)
		}

		const serverActions: SocketServer = createServer(obj.client);

		socket.on('message', (message: string | Buffer, flags?: { binary: boolean; }) => {
			if (transferLimitExceeded)
				return;

			const now = Date.now();
			const diff = now - bytesReset;
			const bytesPerSecond = socket.bytesReceived * 1000 / Math.max(1000, diff);

			if (options.transferLimit && options.transferLimit < bytesPerSecond) {
				transferLimitExceeded = true;
				obj.client.disconnect(true, true);
				errorHandler.handleRecvError(obj.client, new Error(`transfer limit exceeded ${bytesPerSecond.toFixed(0)}/${options.transferLimit} (${diff}ms)`), message);
				return;
			}

			obj.lastMessageTime = Date.now();
			obj.supportsBinary = obj.supportsBinary || !!(flags && flags.binary);

			if (message && message.length) {
				obj.lastMessageId++;
				const messageId = obj.lastMessageId;

				try {
					packetHandler.recv(message, serverActions, {}, (funcId, funcName, func, funcObj, args) => {
						const rate = rates[funcId];

						if (checkRateLimit(funcId, rates)) {
							handleResult(socket, obj, funcId, funcName, func.apply(funcObj, args), messageId);
						} else if (rate && rate.promise) {
							handleResult(socket, obj, funcId, funcName, Promise.reject(new Error('rate limit exceeded')), messageId);
						} else {
							throw new Error(`rate limit exceeded (${funcName})`);
						}
					});
				} catch (e) {
					errorHandler.handleRecvError(obj.client, e, message);
				}
			}

			if (diff > 1000) {
				socket.bytesReceived = 0;
				bytesReset = now;
			}
		});

		socket.on('close', () => {
			obj.client.isConnected = false;
			clients.splice(clients.indexOf(obj), 1);

			if (options.debug)
				log('client disconnected');

			if (serverActions.disconnected) {
				callWithErrorHandling(() => serverActions.disconnected!(), e => errorHandler.handleError(obj.client, e));
			}

			if (obj.token) {
				obj.token.expire = Date.now() + options.tokenLifetime;
				tokens.push(obj.token);
			}
		});

		socket.on('error', e => errorHandler.handleError(obj.client, e));

		clientMethods.forEach((name, id) => obj.client[name] = (...args: any[]) => packetHandler.send(<any>socket, name, id, args, obj.supportsBinary));

		if (options.debug)
			log('client connected');

		packetHandler.send(<any>socket, '*version', MessageType.Version, [options.hash], obj.supportsBinary);

		clients.push(obj);

		if (serverActions.connected) {
			callWithErrorHandling(() => serverActions.connected!(), e => errorHandler.handleError(obj.client, e));
		}
	}

	wsServer.on('connection', socket => {
		try {
			onConnection(socket);
		} catch (e) {
			socket.terminate();
			errorHandler.handleError(null, e);
		}
	});

	wsServer.on('error', e => errorHandler.handleError(null, e));

	let pingInterval: any;
	let tokenInterval: any;

	if (options.pingInterval) {
		pingInterval = setInterval(() => {
			const now = Date.now();

			clients.forEach(c => {
				try {
					if ((now - c.lastMessageTime) > options.connectionTimeout) {
						c.client.disconnect();
					} else {
						c.ping();
					}
				} catch (e) { }
			});
		}, options.pingInterval);
	}

	if (options.connectionTokens) {
		tokenInterval = setInterval(() => {
			const now = Date.now();
			tokens = tokens.filter(t => t.expire > now);
		}, 10000);
	}

	return {
		clients,
		close() {
			if (pingInterval) {
				clearInterval(pingInterval);
				pingInterval = null;
			}

			if (tokenInterval) {
				clearInterval(tokenInterval);
				tokenInterval = null;
			}

			wsServer.close();
		},
		options() {
			const clone = cloneDeep(options);
			const token = options.connectionTokens ? { token: createToken().id } : {};
			return assign(token, clone, { clientLimit: 0 }) as ClientOptions;
		},
	};
}
