import { delay } from './common';
import { VerifyClientCallbackAsync } from 'ws';
import * as http from 'http';
import { expect } from 'chai';
import { assert, stub, spy, match, SinonStub, useFakeTimers, SinonFakeTimers } from 'sinon';
import {
	createServer, createServerRaw, ErrorHandler, Method, Socket, Server as TheServer,
	SocketClient, ClientExtensions, Bin, createClientOptions, ServerHost,
} from '../index';
import { MessageType } from '../packet/packetHandler';
import { MockWebSocket, MockWebSocketServer, getLastServer } from './wsMock';
import { createServerHost } from '../serverSocket';
import { randomString } from '../serverUtils';
import { ServerOptions } from '../serverInterfaces';

@Socket()
class Server1 {
	constructor(public client: Client1 & SocketClient & ClientExtensions) { }
	connected() { }
	disconnected() { }
	@Method()
	hello(_message: string) { }
	@Method({ promise: true })
	login(_login: string) { return Promise.resolve(0); }
	@Method({ rateLimit: '1/s' })
	rate() { }
	@Method({ rateLimit: '1/s', promise: true })
	ratePromise() { return Promise.resolve(0); }
}

@Socket()
class ServerThrowingOnConnected {
	constructor(public client: Client1 & SocketClient & ClientExtensions) {
	}
	connected() {
		throw new Error('failed to connect');
	}
	disconnected = stub() as any;
}

class Client1 {
	@Method()
	hi(_message: string) { }
	@Method({ binary: [Bin.U8] })
	bye(_value: number) { }
}

const CLIENT_OPTIONS = {
	id: 'socket',
	client: [
		'hi',
		['bye', { binary: [1] }],
	],
	path: '/ws',
	reconnectTimeout: 500,
	server: [
		'hello',
		['login', { promise: true }],
		['rate', { rateLimit: '1/s' }],
		['ratePromise', { rateLimit: '1/s', promise: true }]
	],
	tokenLifetime: 3600000,
};

function bufferToArray(buffer: Buffer) {
	return Array.from(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
}

function emptyErrorHandler(): ErrorHandler {
	return {
		handleError() { },
		handleRecvError() { },
		handleRejection() { },
	};
}

function defaultErrorHandler(): ErrorHandler {
	return {
		handleError(...args: any[]) { console.error('handleError', ...args); },
		handleRecvError(...args: any[]) { console.error('handleRecvError', ...args); },
		handleRejection(...args: any[]) { console.error('handleRejection', ...args); },
	};
}

function withoutUndefinedProperties(obj: any) {
	return JSON.parse(JSON.stringify(obj));
}

const ws = MockWebSocket as any;

describe('serverSocket', () => {
	describe('createServer() (real)', () => {
		let server: http.Server;

		beforeEach(() => {
			server = http.createServer();
		});

		afterEach(function (done) {
			server.close(() => done());
		});

		it('is able to start server', function (done) {
			createServer(server, Server1, Client1, c => new Server1(c), { path: '/test2' });
			server.listen(12345, done);
		});

		it('is able to close server', function (done) {
			const socket = createServer(server, Server1, Client1, c => new Server1(c), { path: '/test2' });
			server.listen(12345, () => {
				socket.close();
				done();
			});
		});

		it('throws if passed object with too many methods', () => {
			const Ctor: any = () => { };

			for (let i = 0; i < 251; i++) {
				Ctor.prototype[`foo${i}`] = () => { };
			}

			expect(() => createServer(server, Ctor, Ctor, () => null)).throw('Too many methods');
		});
	});

	describe('createServer() (mock) (creation)', () => {
		it('createServerRaw() throws if passed empty client or server method definitions', () => {
			expect(() => createServerRaw({} as any, c => new Server1(c), { ws, client: [], server: null } as any))
				.throws('Missing server or client method definitions');
			expect(() => createServerRaw({} as any, c => new Server1(c), { ws, client: null, server: [] } as any))
				.throws('Missing server or client method definitions');
		});

		it('handles server errors without error handler', () => {
			createServer({} as any, Server1, Client1, c => new Server1(c), { ws });
			getLastServer().invoke('error', new Error('test'));
		});

		it('passes request info to client if keepOriginalRequest option is true', async () => {
			let server1: Server1;
			createServer({} as any, Server1, Client1, c => server1 = new Server1(c), { ws, keepOriginalRequest: true, hash: '123' });
			await getLastServer().connectClient();

			await delay(50);

			expect(server1!.client.originalRequest).eql({ url: 'ws://test/?bin=false&hash=123', headers: { foo: 'bar' } });
		});

		it('does not pass request info to client if keepOriginalRequest option is not true', async () => {
			let server1: Server1;
			createServer({} as any, Server1, Client1, c => server1 = new Server1(c), { ws });
			await getLastServer().connectClient();

			await delay(50);

			expect(server1!.client.originalRequest).undefined;
		});

		it('handles async creation of server actions', async () => {
			let server1: Server1;
			createServer({} as any, Server1, Client1, c => Promise.resolve().then(() => server1 = new Server1(c)), { ws });
			await getLastServer().connectClient();

			await delay(50);

			expect(server1!).not.undefined;
		});

		it('closes connection if connected() handler threw an error', async () => {
			createServer({} as any, Server1, Client1, c => new ServerThrowingOnConnected(c) as any, { ws });

			const socket = await getLastServer().connectClient();

			await delay(50);
			assert.calledOnce(socket.close as any);
		});

		describe('if token does not exist', () => {
			let webSocket: MockWebSocket;
			let errorHandler: ErrorHandler;

			beforeEach(() => {
				createServer(
					{} as any, Server1, Client1, c => new Server1(c), { ws, connectionTokens: true, hash: '123' },
					errorHandler = emptyErrorHandler());
				webSocket = new MockWebSocket();
				webSocket.upgradeReq.url = '?t=foobar';
			});

			it('terminates connection', async () => {
				const terminate = stub(webSocket, 'terminate');

				await getLastServer().connectWebSocket(webSocket);

				assert.calledOnce(terminate);
			});

			it('reports error', async () => {
				const handleError = stub(errorHandler, 'handleError');

				await getLastServer().connectWebSocket(webSocket);

				assert.calledOnce(handleError);
			});
		});

		describe('.token()', () => {
			it('returns new token string', () => {
				const socketServer = createServer({} as any, Server1, Client1, c => new Server1(c), { ws, connectionTokens: true, hash: '123' });

				expect(socketServer.token()).a('string');
			});

			it('passes custom token data to client', async () => {
				let server1: Server1;
				const data = {};
				const socketServer = createServer({} as any, Server1, Client1, c => server1 = new Server1(c), { ws, connectionTokens: true, hash: '123' });
				await getLastServer().connectClient(false, socketServer.token(data));

				await delay(50);

				expect(server1!.client.tokenData).equal(data);
			});
		});

		describe('.clearTokens()', () => {
			it('does nothing for no tokens and no clients', () => {
				const socketServer = createServer({} as any, Server1, Client1, c => new Server1(c), { ws, connectionTokens: true, hash: '123' });

				socketServer.clearTokens(() => true);
			});

			it('clears marked token', () => {
				const socketServer = createServer({} as any, Server1, Client1, c => new Server1(c), { ws, connectionTokens: true, hash: '123' });
				const token = socketServer.token({ remove: true });

				socketServer.clearTokens((_, data) => data.remove);

				const verifyClient = getLastServer().options.verifyClient! as VerifyClientCallbackAsync;
				const next = spy();
				verifyClient({ req: { url: `?t=${token}` } } as any, next);
				assert.calledWith(next, false);
			});

			it('does not clear not marked token', () => {
				const socketServer = createServer({} as any, Server1, Client1, c => new Server1(c), { ws, connectionTokens: true, hash: '123' });
				const token = socketServer.token({ remove: false });

				socketServer.clearTokens((_, data) => data.remove);

				const verifyClient = getLastServer().options.verifyClient! as VerifyClientCallbackAsync;
				const next = spy();
				verifyClient({ req: { url: `?t=${token}` } } as any, next);
				assert.calledWith(next, true);
			});

			it('disconnects client using marked token', async () => {
				const socketServer = createServer({} as any, Server1, Client1, c => new Server1(c), { ws, connectionTokens: true, hash: '123' });
				const token = socketServer.token({ remove: true });
				const client = await getLastServer().connectClient(false, token);
				const terminate = stub(client, 'terminate');

				socketServer.clearTokens((_, data) => data.remove);

				assert.calledOnce(terminate);
			});
		});

		describe('(transfer limit)', () => {
			let errorHandler: ErrorHandler;
			let server: Server1;
			let clock: SinonFakeTimers | undefined;

			beforeEach(() => {
				clock = undefined;
				errorHandler = emptyErrorHandler();
				createServer({} as any, Server1, Client1, c => server = new Server1(c), { ws, transferLimit: 1000, hash: '123' }, errorHandler);
			});

			afterEach(() => {
				clock && clock.restore();
			});

			it('calls method if not exceeding limit', async () => {
				const client = await getLastServer().connectClient();
				const hello = stub(server, 'hello');

				client.invoke('message', '[0,"hello there"]');

				assert.calledWith(hello, 'hello there');
			});

			it('does not call method if exceeded limit (one message)', async () => {
				const client = await getLastServer().connectClient();
				const hello = stub(server, 'hello');

				client.invoke('message', `[0,"${randomString(1000)}"]`);

				assert.notCalled(hello);
			});

			it('does not call method if exceeded limit (multiple messages)', async () => {
				const client = await getLastServer().connectClient();
				const hello = stub(server, 'hello');

				for (let i = 0; i < 10; i++) {
					client.invoke('message', `[0,"${randomString(100)}"]`);
				}

				client.invoke('message', `[0,"hi"]`);

				assert.neverCalledWith(hello, 'hi');
			});

			it('reports error when limit is exceeded', async () => {
				const client = await getLastServer().connectClient();
				const handleRecvError = stub(errorHandler, 'handleRecvError');

				client.invoke('message', `[0,"${randomString(1000)}"]`);

				assert.calledOnce(handleRecvError);
			});

			it('terminates socket connection when limit is exceeded', async () => {
				const client = await getLastServer().connectClient();
				const terminate = stub(client, 'terminate');

				client.invoke('message', `[0,"${randomString(1000)}"]`);

				assert.calledOnce(terminate);
			});

			// TODO: fix
			it.skip('resets counter after a second', async () => {
				const client = await getLastServer().connectClient();
				const hello = stub(server, 'hello');

				clock = useFakeTimers();

				client.invoke('message', `[0,"${randomString(900)}"]`);

				clock.tick(2000);

				client.invoke('message', `[0,"${randomString(900)}"]`);

				assert.calledTwice(hello);
			});
		});
	});

	describe('createServer() (mock)', () => {
		const httpServer: http.Server = {} as any;

		let server: MockWebSocketServer;
		let serverHost: ServerHost;
		let serverSocket: TheServer;
		let errorHandler: ErrorHandler;
		let servers: Server1[] = [];
		let onServer: (s: Server1) => void;
		let onSend: SinonStub;
		let onRecv: SinonStub;

		async function connectClientAndSaveMessages(bin = false) {
			const client = await server.connectClient(bin);
			const result = { message: undefined as any };
			client.send = message => result.message = message.slice(0);
			return result;
		}

		beforeEach(() => {
			errorHandler = defaultErrorHandler();
			servers = [];
			onServer = s => servers.push(s);
			onSend = stub();
			onRecv = stub();
			serverHost = createServerHost(
				httpServer, { ws, path: '/foo', perMessageDeflate: false, errorHandler });
			serverSocket = serverHost.socket(Server1, Client1, client => {
				const s = new Server1(client);
				onServer(s);
				return s;
			}, { ws, path: '/foo', perMessageDeflate: false, onSend, onRecv, development: true, hash: '123' });
			server = getLastServer();
		});

		it('passes http server to websocket server', () => {
			expect(server.options.server).equal(httpServer);
		});

		it('passes path to websocket server', () => {
			expect(server.options.path).equal('/foo');
		});

		it('passes perMessageDeflate option to websocket server', () => {
			expect(server.options.perMessageDeflate).false;
		});

		it('connects client', async () => {
			await server.connectClient();
		});

		it('reports socket server error', () => {
			const error = new Error('test');
			const handleError = stub(errorHandler, 'handleError');

			server.invoke('error', error);

			assert.calledWith(handleError, null, error);
		});

		it('reports socket error', async () => {
			const client = await server.connectClient();
			const error = new Error('test');
			const handleError = stub(errorHandler, 'handleError');

			client.invoke('error', error);

			assert.calledWith(handleError, serverSocket.clients[0].client, error);
		});

		it('terminates and reports connection error if failed to attach events', async () => {
			const client = new MockWebSocket();
			const error = new Error('test');
			stub(client, 'on').throws(error);
			const terminate = stub(client, 'terminate');
			const handleError = stub(errorHandler, 'handleError');

			server.invoke('connection', client);

			await delay(5);

			assert.calledOnce(terminate);
			assert.calledWith(handleError, match.any, error);
		});

		it('reports exception from server.connected()', async () => {
			const error = new Error('test');
			onServer = s => stub(s, 'connected').throws(error);
			const handleError = stub(errorHandler, 'handleError');

			await server.connectClient();

			assert.calledWithMatch(handleError as any, match.any, error);
		});

		it('reports rejection from server.connected()', async () => {
			const error = new Error('test');
			onServer = s => stub(s, 'connected').rejects(error);
			const handleError = stub(errorHandler, 'handleError');

			await server.connectClient();

			await Promise.resolve();
			assert.calledWithMatch(handleError as any, match.any, error);
		});

		it('reports exception from server.disconnected()', async () => {
			const error = new Error('test');
			onServer = s => stub(s, 'disconnected').throws(error);
			const handleError = stub(errorHandler, 'handleError');
			const client = await server.connectClient();

			client.invoke('close');

			assert.calledWithMatch(handleError as any, match.any, error);
		});

		it('reports rejection from server.disconnected()', async () => {
			const error = new Error('test');
			onServer = s => stub(s, 'disconnected').rejects(error);
			const handleError = stub(errorHandler, 'handleError');
			const client = await server.connectClient();

			client.invoke('close');

			await Promise.resolve();

			assert.calledWithMatch(handleError as any, match.any, error);
		});

		it('does not handle any messages after socket is closed', async () => {
			const client = await server.connectClient();
			const hello = stub(servers[0], 'hello');
			client.invoke('close');

			client.invoke('message', '[0,"test"]');

			assert.notCalled(hello);
		});

		it('handles message from client', async () => {
			const client = await server.connectClient();
			const hello = stub(servers[0], 'hello');

			client.invoke('message', '[0,"test"]');

			assert.calledWith(hello, 'test');
		});

		it('reports received packet to onRecv hook', async () => {
			const client = await server.connectClient();

			client.invoke('message', '[0,"test"]');

			assert.calledWithMatch(onRecv, 0, 'hello', 10, false);
		});

		it('sends promise result back to client', async () => {
			const client = await server.connectClient();
			const send = stub(client, 'send');
			stub(servers[0], 'login').resolves({ foo: 'bar' } as any);

			client.invoke('message', '[1, "test"]');

			await delay(10);

			assert.calledWith(send, JSON.stringify([MessageType.Resolved, 1, 1, { foo: 'bar' }]));
		});

		it('sends message to client (JSON)', async () => {
			const client = await server.connectClient();
			const send = stub(client, 'send');

			servers[0].client.hi('boop');

			assert.calledWith(send, '[0,"boop"]');
		});

		it('sends message to client (binary)', async () => {
			const send = await connectClientAndSaveMessages(true);

			servers[0].client.bye(5);

			expect(bufferToArray(send.message)).eql([1, 5]);
		});

		it('reports sent packet to onSend hook', async () => {
			await server.connectClient(true);

			servers[0].client.bye(5);

			expect(onSend.args[1]).eql([1, 'bye', 2, true]);
		});

		describe('(rate limit)', () => {
			let handleRecvError: SinonStub<any>;
			let handleRejection: SinonStub<any>;

			beforeEach(() => {
				handleRecvError = stub(errorHandler, 'handleRecvError');
				handleRejection = stub(errorHandler, 'handleRejection');
			});

			it('does not call method if rate limit is exceeded', async () => {
				const client = await server.connectClient();
				const rate = stub(servers[0]!, 'rate');

				client.invoke('message', '[2]');
				client.invoke('message', '[2]');
				client.invoke('message', '[2]');

				assert.calledTwice(rate);
			});

			it('logs recv error if rate limit is exceeded', async () => {
				const client = await server.connectClient();

				client.invoke('message', '[2]');
				client.invoke('message', '[2]');
				client.invoke('message', '[2]');

				assert.calledOnce(handleRecvError);
			});

			it('sends reject if rate limit is exceeded on method with promise', async () => {
				const client = await server.connectClient();
				const send = stub(client, 'send');
				const data = JSON.stringify([MessageType.Rejected, 3, 3, 'Rate limit exceeded']);

				client.invoke('message', '[3]');
				client.invoke('message', '[3]');
				client.invoke('message', '[3]');

				await delay(10);

				assert.calledWith(send, data);
			});

			it('logs rejection error if rate limit is exceeded on method with promise', async () => {
				const client = await server.connectClient();

				client.invoke('message', '[3]');
				client.invoke('message', '[3]');
				client.invoke('message', '[3]');

				await delay(10);
				assert.calledOnce(handleRejection);
			});
		});

		describe('.close()', () => {
			it('closes web socket server', () => {
				const close = stub(getLastServer(), 'close');

				serverHost.close();

				assert.calledOnce(close);
			});
		});

		describe('.options()', () => {
			it('returns socket options', () => {
				const socketServer = createServer({} as any, Server1, Client1, c => new Server1(c), { ws });

				const options = socketServer.options();

				expect(withoutUndefinedProperties(options)).eql(Object.assign({ hash: options.hash }, CLIENT_OPTIONS));
			});
		});
	});

	describe('createServer() (verifyClient hook)', () => {
		const ws = MockWebSocket as any;

		function create(options: ServerOptions, errorHandler?: ErrorHandler) {
			createServer({} as any, Server1, Client1, c => new Server1(c), { hash: '123', ...options }, errorHandler);
			return getLastServer();
		}

		function verify(server: MockWebSocketServer, info: any = { req: {} }) {
			const verifyClient = server.options.verifyClient! as VerifyClientCallbackAsync;
			let result = false;
			verifyClient(info, x => result = x);
			return result;
		}

		it('returns true by default', () => {
			const server = create({ ws });

			expect(verify(server)).true;
		});

		it('passes request to custom verifyClient', () => {
			const verifyClient = spy();
			const server = create({ ws, verifyClient });
			const req = {};

			verify(server, { req });
			assert.calledWith(verifyClient, req);
		});

		it('returns false if custom verifyClient returns false', () => {
			const verifyClient = stub().returns(false);
			const server = create({ ws, verifyClient });

			expect(verify(server)).false;
		});

		it('returns true if custom verifyClient returns true', () => {
			const verifyClient = stub().returns(true);
			const server = create({ ws, verifyClient });

			expect(verify(server)).true;
		});

		it('returns false if client limit is reached', async () => {
			const server = create({ ws, clientLimit: 1 });
			await server.connectClient();

			expect(verify(server)).false;
		});

		it('returns false if custom verifyClient throws an error', () => {
			const verifyClient = stub().throws(new Error('test'));
			const server = create({ ws, verifyClient });

			expect(verify(server)).false;
		});

		it('reports error if custom verifyClient throws an error', () => {
			const error = new Error('test');
			const errorHandler: any = { handleError() { } };
			const handleError = stub(errorHandler, 'handleError');
			const verifyClient = stub().throws(error);
			const server = create({ ws, verifyClient }, errorHandler);

			verify(server);
			assert.calledWith(handleError, null, error);
		});
	});

	describe('createClientOptions()', () => {
		it('returns client options', () => {
			const options = createClientOptions(Server1, Client1, { ws, id: 'socket' });

			expect(withoutUndefinedProperties(options)).eql({ hash: options.hash, ...CLIENT_OPTIONS });
		});
	});
});
