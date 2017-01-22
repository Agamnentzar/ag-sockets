import './common';
import * as Promise from 'bluebird';
import * as http from 'http';
import { expect } from 'chai';
import { assert, stub, spy, match, SinonStub } from 'sinon';
import {
	createServer, createServerRaw, ErrorHandler, Method, Socket, Server as TheServer, ServerOptions, broadcast,
	SocketClient, ClientExtensions, Bin, createClientOptions,
} from '../index';
import { MessageType } from '../packet/packetHandler';
import { MockWebSocket, MockWebSocketServer, getLastServer } from './wsMock';

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

class Client1 {
	@Method()
	hi(_message: string) { }
	@Method({ binary: [Bin.U8] })
	bye(_value: number) { }
}

const CLIENT_OPTIONS = {
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
};

function bufferEqual(expectation: number[]) {
	return match.instanceOf(Buffer)
		.and(match((value: Buffer) => value.length === expectation.length))
		.and(match((value: Buffer) => {
			for (let i = 0; i < expectation.length; i++) {
				if (value[i] !== expectation[i])
					return false;
			}

			return true;
		}));
};

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

describe('serverSocket', function () {
	describe('createServer() (real)', function () {
		let server: http.Server;

		beforeEach(function () {
			server = http.createServer();
		});

		afterEach(function (done) {
			server.close(() => done());
		});

		it('should be able to start server', function (done) {
			createServer(server, Server1, Client1, c => new Server1(c), { path: '/test2' });
			server.listen(12345, done);
		});

		it('should be able to close server', function (done) {
			const socket = createServer(server, Server1, Client1, c => new Server1(c), { path: '/test2' });
			server.listen(12345, () => {
				socket.close();
				done();
			});
		});

		it('should throw if passed object with too many methods', function () {
			const Ctor: any = () => { };

			for (let i = 0; i < 251; i++) {
				Ctor.prototype[`foo${i}`] = () => { };
			}

			expect(() => createServer(server, Ctor, Ctor, () => null)).throw('Too many methods');
		});
	});

	describe('createServer() (mock)', function () {
		it('createServerRaw() should throw if passed empty client or server method definitions', function () {
			expect(() => createServerRaw({} as any, c => new Server1(c), { ws, client: [], server: null } as any)).throws('Missing server or client method definitions');
			expect(() => createServerRaw({} as any, c => new Server1(c), { ws, client: null, server: [] } as any)).throws('Missing server or client method definitions');
		});

		it('handles server errors without error handler', function () {
			createServer({} as any, Server1, Client1, c => new Server1(c), { ws });
			getLastServer().invoke('error', new Error('test'));
		});

		it('passes request info to client if keepOriginalRequest option is true', function () {
			let server1: Server1;
			createServer({} as any, Server1, Client1, c => server1 = new Server1(c), { ws, keepOriginalRequest: true });
			getLastServer().connectClient();

			return Promise.delay(50)
				.then(() => expect(server1.client.originalRequest).eql({ url: 'ws://test/?bin=false', headers: { foo: 'bar' } }));
		});

		it('does not pass request info to client if keepOriginalRequest option is not true', function () {
			let server1: Server1;
			createServer({} as any, Server1, Client1, c => server1 = new Server1(c), { ws });
			getLastServer().connectClient();

			return Promise.delay(50)
				.then(() => expect(server1.client.originalRequest).undefined);
		});

		describe('if token does not exist', function () {
			let webSocket: MockWebSocket;
			let errorHandler: ErrorHandler;

			beforeEach(function () {
				createServer({} as any, Server1, Client1, c => new Server1(c), { ws, connectionTokens: true }, errorHandler = emptyErrorHandler());
				webSocket = new MockWebSocket();
				webSocket.upgradeReq.url = '?t=foobar';
			});

			it('terminates connection', function () {
				const terminate = stub(webSocket, 'terminate');

				getLastServer().connectWebSocket(webSocket);

				assert.calledOnce(terminate);
			});

			it('reports error', function () {
				const handleError = stub(errorHandler, 'handleError');

				getLastServer().connectWebSocket(webSocket);

				assert.calledOnce(handleError);
			});
		});

		describe('.token()', function () {
			it('returns new token string', function () {
				const socketServer = createServer({} as any, Server1, Client1, c => new Server1(c), { ws, connectionTokens: true });

				expect(socketServer.token()).a('string');
			});

			it('passes custom token data to client', function () {
				let server1: Server1;
				const data = {};
				const socketServer = createServer({} as any, Server1, Client1, c => server1 = new Server1(c), { ws, connectionTokens: true });
				getLastServer().connectClient(false, socketServer.token(data));

				return Promise.delay(50)
					.then(() => expect(server1.client.tokenData).equal(data));
			});

			it('throws if connection tokens are turned off', function () {
				const socketServer = createServer({} as any, Server1, Client1, c => new Server1(c), { ws });

				expect(() => socketServer.token()).throw('Option connectionTokens not set');
			});
		});

		describe('.clearTokens()', function () {
			it('does nothing for no tokens and no clients', function () {
				const socketServer = createServer({} as any, Server1, Client1, c => new Server1(c), { ws, connectionTokens: true });

				socketServer.clearTokens(() => true);
			});

			it('clears marked token', function () {
				const socketServer = createServer({} as any, Server1, Client1, c => new Server1(c), { ws, connectionTokens: true });
				const token = socketServer.token({ remove: true });

				socketServer.clearTokens((_, data) => data.remove);

				expect(getLastServer().options.verifyClient!({ req: { url: `?t=${token}` } } as any, () => { })).false;
			});

			it('does not clear not marked token', function () {
				const socketServer = createServer({} as any, Server1, Client1, c => new Server1(c), { ws, connectionTokens: true });
				const token = socketServer.token({ remove: false });

				socketServer.clearTokens((_, data) => data.remove);

				expect(getLastServer().options.verifyClient!({ req: { url: `?t=${token}` } } as any, () => { })).true;
			});

			it('disconnects client using marked token', function () {
				const socketServer = createServer({} as any, Server1, Client1, c => new Server1(c), { ws, connectionTokens: true });
				const token = socketServer.token({ remove: true });
				const client = getLastServer().connectClient(false, token);
				const terminate = stub(client, 'terminate');

				socketServer.clearTokens((_, data) => data.remove);

				assert.calledOnce(terminate);
			});

			it('throws if connection tokens are turned off', function () {
				const socketServer = createServer({} as any, Server1, Client1, c => new Server1(c), { ws });

				expect(() => socketServer.clearTokens(() => true)).throw('Option connectionTokens not set');
			});
		});
	});

	describe('createServer() (mock)', function () {
		const httpServer: http.Server = {} as any;

		let server: MockWebSocketServer;
		let serverSocket: TheServer;
		let errorHandler: ErrorHandler;
		let servers: Server1[] = [];
		let onServer: (s: Server1) => void;

		beforeEach(function () {
			errorHandler = defaultErrorHandler();
			servers = [];
			onServer = s => servers.push(s);
			serverSocket = createServer(httpServer, Server1, Client1, client => {
				const s = new Server1(client);
				onServer(s);
				return s;
			}, { ws, path: '/foo', perMessageDeflate: false }, errorHandler);
			server = getLastServer();
		});

		it('passes http server to websocket server', function () {
			expect(server.options.server).equal(httpServer);
		});

		it('passes path to websocket server', function () {
			expect(server.options.path).equal('/foo');
		});

		it('passes perMessageDeflate option to websocket server', function () {
			expect(server.options.perMessageDeflate).false;
		});

		it('connects client', function () {
			server.connectClient();
		});

		it('reports socket server error', function () {
			const error = new Error('test');
			const handleError = stub(errorHandler, 'handleError');

			server.invoke('error', error);

			assert.calledWith(handleError, null, error);
		});

		it('reports socket error', function () {
			const client = server.connectClient();
			const error = new Error('test');
			const handleError = stub(errorHandler, 'handleError');

			client.invoke('error', error);

			assert.calledWith(handleError, serverSocket.clients[0].client, error);
		});

		it('terminates and reports connection error', function () {
			const client = new MockWebSocket();
			const error = new Error('test');
			stub(client, 'on').throws(error);
			const terminate = stub(client, 'terminate');
			const handleError = stub(errorHandler, 'handleError');

			server.invoke('connection', client);

			assert.calledOnce(terminate);
			assert.calledWith(handleError, null, error);
		});

		it('reports exception from server.connected()', function () {
			const error = new Error('test');
			onServer = s => stub(s, 'connected').throws(error);
			const handleError = stub(errorHandler, 'handleError');

			server.connectClient();

			assert.calledWithMatch(handleError, match.any, error);
		});

		it('reports rejection from server.connected()', function () {
			const error = new Error('test');
			onServer = s => stub(s, 'connected').returns(Promise.reject(error));
			const handleError = stub(errorHandler, 'handleError');

			server.connectClient();

			return Promise.resolve()
				.then(() => assert.calledWithMatch(handleError, match.any, error));
		});

		it('reports exception from server.disconnected()', function () {
			const error = new Error('test');
			onServer = s => stub(s, 'disconnected').throws(error);
			const handleError = stub(errorHandler, 'handleError');
			const client = server.connectClient();

			client.invoke('close');

			assert.calledWithMatch(handleError, match.any, error);
		});

		it('reports rejection from server.disconnected()', function () {
			const error = new Error('test');
			onServer = s => stub(s, 'disconnected').returns(Promise.reject(error));
			const handleError = stub(errorHandler, 'handleError');
			const client = server.connectClient();

			client.invoke('close');

			return Promise.resolve()
				.then(() => assert.calledWithMatch(handleError, match.any, error));
		});

		it('handles message from client', function () {
			const client = server.connectClient();
			const hello = stub(servers[0]!, 'hello');

			client.invoke('message', '[0, "test"]');

			assert.calledWith(hello, 'test');
		});

		it('sends promise result back to client', function () {
			const client = server.connectClient();
			const send = stub(client, 'send');
			stub(servers[0], 'login').returns(Promise.resolve({ foo: 'bar' }));

			client.invoke('message', '[1, "test"]');

			return Promise.delay(10)
				.then(() => assert.calledWith(send, JSON.stringify([MessageType.Resolved, 1, 1, { foo: 'bar' }])));
		});

		it('sends message to client (JSON)', function () {
			const client = server.connectClient();
			const send = stub(client, 'send');

			servers[0].client.hi('boop');

			assert.calledWith(send, '[0,"boop"]');
		});

		it('sends message to client (binary)', function () {
			const client = server.connectClient(true);
			const send = stub(client, 'send');

			servers[0].client.bye(5);

			assert.calledWith(send, bufferEqual([1, 5]));
		});

		describe('(rate limit)', function () {
			let handleRecvError: SinonStub;
			let handleRejection: SinonStub;

			beforeEach(function () {
				handleRecvError = stub(errorHandler, 'handleRecvError');
				handleRejection = stub(errorHandler, 'handleRejection');
			});

			it('does not call method if rate limit is exceeded', function () {
				const client = server.connectClient();
				const rate = stub(servers[0]!, 'rate');

				client.invoke('message', '[2]');
				client.invoke('message', '[2]');

				assert.calledOnce(rate);
			});

			it('logs recv error if rate limit is exceeded', function () {
				const client = server.connectClient();

				client.invoke('message', '[2]');
				client.invoke('message', '[2]');

				assert.calledOnce(handleRecvError);
			});

			it('sends reject if rate limit is exceeded on method with promise', function () {
				const client = server.connectClient();
				const send = stub(client, 'send');
				const data = JSON.stringify([MessageType.Rejected, 3, 2, 'Rate limit exceeded']);

				client.invoke('message', '[3]');
				client.invoke('message', '[3]');

				return Promise.delay(10)
					.then(() => assert.calledWith(send, data));
			});

			it('logs rejection error if rate limit is exceeded on method with promise', function () {
				const client = server.connectClient();

				client.invoke('message', '[3]');
				client.invoke('message', '[3]');

				return Promise.delay(10)
					.then(() => assert.calledOnce(handleRejection));
			});
		});

		describe('.close()', function () {
			it('closes web socket server', function () {
				const close = stub(getLastServer(), 'close');

				serverSocket.close();

				assert.calledOnce(close);
			});
		});

		describe('.options()', function () {
			it('returns socket options', function () {
				const socketServer = createServer({} as any, Server1, Client1, c => new Server1(c), { ws });

				const options = socketServer.options();

				expect(withoutUndefinedProperties(options)).eql(Object.assign({ hash: options.hash }, CLIENT_OPTIONS));
			});
		});

		describe('broadcast()', function () {
			it('sends message to all clients (JSON)', function () {
				const send1 = stub(server.connectClient(), 'send');
				const send2 = stub(server.connectClient(), 'send');
				const clients = servers.map(s => s.client);

				broadcast(clients, c => c.hi('boop'));

				assert.calledWith(send1, '[0,"boop"]');
				assert.calledWith(send2, '[0,"boop"]');
			});

			it('sends message to all clients (binary)', function () {
				const send1 = stub(server.connectClient(true), 'send');
				const send2 = stub(server.connectClient(true), 'send');
				const clients = servers.map(s => s.client);

				broadcast(clients, c => c.bye(5));

				assert.calledWith(send1, bufferEqual([1, 5]));
				assert.calledWith(send2, bufferEqual([1, 5]));
			});

			it('sends message to all clients (mixed)', function () {
				const send1 = stub(server.connectClient(true), 'send');
				const send2 = stub(server.connectClient(), 'send');
				const clients = servers.map(s => s.client);

				broadcast(clients, c => c.bye(5));

				assert.calledWith(send1, bufferEqual([1, 5]));
				assert.calledWith(send2, '[1,5]');
			});

			it('does nothing for empty client list', function () {
				broadcast([] as Client1[], c => c.hi('boop'));
			});

			it('throws for invalid client object', function () {
				expect(() => broadcast([{}] as any[], c => c.hi('boop'))).throw('Invalid client');
			});

			it('calls callback only once', function () {
				server.connectClients(3);
				const clients = servers.map(s => s.client);
				const action = spy();

				broadcast(clients, action);

				assert.calledOnce(action);
			});
		});
	});

	describe('createServer() (verifyClient hook)', function () {
		const ws = MockWebSocket as any;

		function create(options: ServerOptions, errorHandler?: ErrorHandler) {
			createServer({} as any, Server1, Client1, c => new Server1(c), options, errorHandler);
			return getLastServer();
		}

		function verify(server: MockWebSocketServer, info: any = {}) {
			return server.options.verifyClient!(info, () => { });
		}

		it('returns true by default', function () {
			const server = create({ ws });

			expect(verify(server)).true;
		});

		it('passes request to custom verifyClient', function () {
			const verifyClient = spy();
			const server = create({ ws, verifyClient });
			const req = {};

			verify(server, { req });
			assert.calledWith(verifyClient, req);
		});

		it('returns false if custom verifyClient returns false', function () {
			const verifyClient = stub().returns(false);
			const server = create({ ws, verifyClient });

			expect(verify(server)).false;
		});

		it('returns true if custom verifyClient returns true', function () {
			const verifyClient = stub().returns(true);
			const server = create({ ws, verifyClient });

			expect(verify(server)).true;
		});

		it('returns false if client limit is reached', function () {
			const server = create({ ws, clientLimit: 1 });
			server.connectClient();

			expect(verify(server)).false;
		});

		it('returns false if custom verifyClient throws an error', function () {
			const verifyClient = stub().throws(new Error('test'));
			const server = create({ ws, verifyClient });

			expect(verify(server)).false;
		});

		it('reports error if custom verifyClient throws an error', function () {
			const error = new Error('test');
			const errorHandler: any = { handleError() { } };
			const handleError = stub(errorHandler, 'handleError');
			const verifyClient = stub().throws(error);
			const server = create({ ws, verifyClient }, errorHandler);

			verify(server);
			assert.calledWith(handleError, null, error);
		});
	});

	describe('createClientOptions()', function () {
		it('returns client options', function () {
			const options = createClientOptions(Server1, Client1, { ws });

			expect(withoutUndefinedProperties(options)).eql(Object.assign({ hash: options.hash }, CLIENT_OPTIONS));
		});
	});
});
