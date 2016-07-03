import { Server as HttpServer, ServerRequest } from 'http';
import { Server as WebSocketServer } from 'ws';
import * as Promise from 'bluebird';
import { Options, MethodMetadata, MethodDef, getNames, getBinary, getIgnore, SocketServer, SocketClient, FuncList, Logger } from './interfaces';
import { SocketServerClient, ErrorHandler } from './server';
import { PacketHandler, MessageType } from './packet/packetHandler';
import { DebugPacketHandler } from './packet/debugPacketHandler';
import { createHandlers } from './packet/binaryHandler';
import BufferPacketWriter from './packet/bufferPacketWriter';
import BufferPacketReader from './packet/bufferPacketReader';
import { getSocketMetadata, getMethods } from './method';

export interface Client {
	lastMessageTime: number;
	lastMessageId: number;
	ping(): void;
	client: SocketServerClient;
}

export interface Server {
	clients: Client[];
	options: Options;
	close(): void;
}

const defaultErrorHandler: ErrorHandler = {
	handleError() { },
	handleRejection() { },
	handleRecvError() { },
};

export function createServer<TServer, TClient>(
	server: HttpServer, serverType: new (...args: any[]) => TServer, clientType: new (...args: any[]) => TClient,
	createServer: (client: TClient & SocketServerClient) => TServer, options?: Options, errorHandler?: ErrorHandler, log?: Logger) {

	const opt = (<any>Object).assign({}, getSocketMetadata(serverType), options);
	opt.client = getMethods(clientType).map<MethodDef>(m => Object.keys(m.options).length ? [m.name, m.options] : m.name);
	opt.server = getMethods(serverType).map<MethodDef>(m => Object.keys(m.options).length ? [m.name, m.options] : m.name);
	return create(server, createServer, opt, errorHandler, log);
}

export function create(server: HttpServer, createServer: (client: any) => any, options: Options, errorHandler: ErrorHandler = defaultErrorHandler, log: Logger = console.log.bind(console)) {
	options.reconnectTimeout = options.reconnectTimeout || 500;
	options.connectionTimeout = options.connectionTimeout || 10000;
	options.path = options.path || '/websocket';
	options.hash = Date.now();

	if (options.client.length > 250 || options.server.length > 250)
		throw new Error('too many methods');

	const wsServer = new WebSocketServer({
		server: server,
		path: options.path,
		perMessageDeflate: typeof options.perMessageDeflate === 'undefined' ? true : options.perMessageDeflate,
	} as any);

	const handlers = createHandlers(getBinary(options.client), getBinary(options.server));
	const clients: Client[] = [];
	const reader = new BufferPacketReader();
	const writer = new BufferPacketWriter();
	const serverMethods = getNames(options.server);
	const clientMethods = getNames(options.client);
	const ignore = getIgnore(options.client).concat(getIgnore(options.server));
	const packet = options.debug ?
		new DebugPacketHandler(serverMethods, serverMethods, writer, reader, handlers, ignore, log) :
		new PacketHandler(serverMethods, serverMethods, writer, reader, handlers);

	let currentClientId = 1;

	function handleResult(socket: any, client: SocketServerClient, funcId: number, funcName: string, result: Promise<any>, messageId: number) {
		if (result && typeof result.then === 'function') {
			result.then(result => {
				packet.send(socket, `*resolve:${funcName}`, MessageType.Resolved, [funcId, messageId, result]);
			}, (e: Error) => {
				errorHandler.handleRejection(client, e);
				packet.send(socket, `*reject:${funcName}`, MessageType.Rejected, [funcId, messageId, e ? e.message : 'error']);
			}).catch((e: Error) => errorHandler.handleError(client, e));
		}
	}

	wsServer.on('connection', function (socket) {
		const obj: Client = {
			lastMessageTime: Date.now(),
			lastMessageId: 0,
			ping() { socket.send(''); },
			client: {
				id: currentClientId++,
				isConnected: true,
				originalRequest: socket.upgradeReq,
				disconnect() { socket.close(); },
			}
		};

		const serverActions: SocketServer = createServer(obj.client);

		socket.on('message', function (message: string | Buffer, flags: { binary: boolean; }) {
			obj.lastMessageTime = Date.now();
			packet.supportsBinary = packet.supportsBinary || flags.binary;

			if (message) {
				obj.lastMessageId++;
				const messageId = obj.lastMessageId;

				try {
					packet.recv(message, serverActions, {}, (funcId, funcName, result) =>
						handleResult(socket, obj.client, funcId, funcName, result, messageId));
				} catch (e) {
					errorHandler.handleRecvError(obj.client, e, message);
				}
			}
		});

		socket.on('close', function () {
			obj.client.isConnected = false;
			clients.splice(clients.indexOf(obj), 1);

			if (options.debug)
				log('client disconnected');
			if (serverActions.disconnected)
				serverActions.disconnected();
		});

		socket.on('error', e => errorHandler.handleError(obj.client, e));

		clientMethods.forEach(function (name, id) {
			obj.client[name] = function (...args: any[]) {
				packet.send(<any>socket, name, id, args);
			};
		});

		clients.push(obj);

		if (options.debug)
			log('client connected');

		packet.send(<any>socket, '*version', MessageType.Version, [options.hash]);

		if (serverActions.connected)
			serverActions.connected();
	});

	wsServer.on('error', e => errorHandler.handleError(null, e));

	let interval: any;

	if (options.pingInterval) {
		interval = setInterval(function () {
			var now = Date.now();

			clients.forEach(function (c) {
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

	return {
		clients: clients,
		options: options,
		close: function () {
			if (interval) {
				clearInterval(interval);
				interval = null;
			}

			wsServer.close();
		},
	};
}
