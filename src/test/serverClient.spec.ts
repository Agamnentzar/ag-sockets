import { delay, createKillMethod } from './common';
import * as http from 'http';
import * as WebSocket from 'ws';
import { WebSocketServer as ClusterWsServer } from 'clusterws-uws';
import { expect } from 'chai';
import { assert, stub, spy, SinonSpy } from 'sinon';
import { Bin, ServerOptions, ClientOptions, SocketService } from '../interfaces';
import {
	Socket, Method, ClientExtensions, Server as ServerController,
	SocketClient, SocketServer, ErrorHandler, createClientSocket
} from '../index';
import { ServerHost } from '../serverInterfaces';
import { createServerHost } from '../serverSocket';

const apply = (f: () => void) => f();

@Socket({ path: '/ws/test', pingInterval: 100, debug: true, clientLimit: 2 })
class Server implements SocketServer {
	constructor(public client: Client & ClientExtensions) { }
	@Method({ binary: [Bin.Str], ignore: true })
	hello(_message: string) { }
	@Method({ promise: true })
	login(login: string) {
		return login === 'ok' ? Promise.resolve(true) : Promise.reject(new Error('fail'));
	}
	@Method({ promise: true })
	nullReject() {
		return Promise.reject(null);
	}
	@Method()
	err() {
		throw new Error('err');
	}
	@Method()
	test(_message: string) {
	}
	@Method({ rateLimit: '1/s' })
	limited() {
		console.log('limited');
	}
	@Method({ rateLimit: '1/s', promise: true })
	limitedPromise() {
		return Promise.resolve();
	}
	connected() { }
	disconnected() { }
}

@Socket({ path: '/ws/omg' })
class Server2 implements SocketServer {
	constructor(public client: Client & ClientExtensions) { }
	@Method({ ignore: true })
	hello(_message: string) { }
}

class Client implements SocketClient {
	@Method({ binary: [Bin.Str], ignore: true })
	bin(_message: string) { }
	@Method()
	hi(message: string) {
		console.log('hi', message);
	}
	@Method({ binary: [Bin.Buffer, [Bin.U8]] })
	bin2(_buffer: ArrayBuffer, _values: number[]) {
	}
	connected() { }
	disconnected() { }
}

describe('ClientSocket + Server', () => {
	let httpServer: http.Server;
	let killServer: (callback: () => void) => void;
	let server: Server;
	let serverHost: ServerHost;
	let serverSocket: ServerController;
	let clientSocket: SocketService<Client, Server>;
	let errorHandler: ErrorHandler;
	let connected: SinonSpy;
	let log: SinonSpy;
	// let version: SinonStub;

	function setupClient(options: ClientOptions, token?: string) {
		return new Promise(resolve => {
			clientSocket = createClientSocket<Client, Server>(options, token, undefined, apply, log);
			// version = stub((<any>clientSocket).special, '*version');
			clientSocket.client = new Client();
			clientSocket.client.connected = resolve;
			clientSocket.connect();
		});
	}

	function setupServerClient(
		done: () => void, options: ServerOptions = {}, onClient: (options: ClientOptions, token?: string) => void = () => { }
	) {
		connected = spy();

		serverHost = createServerHost(httpServer, { path: '/ws', ws: options.ws, errorHandler, log });
		serverSocket = serverHost.socket(Server, Client, c => {
			server = new Server(c);
			server.connected = connected as any;
			return server;
		}, options);

		const clientOptions = serverSocket.options();
		const token = options.connectionTokens ? serverSocket.token() : undefined;

		onClient(clientOptions, token);

		startListening()
			.then(() => setupClient(clientOptions, token))
			.then(done);
	}

	function closeServerClient(done: () => void) {
		clientSocket.disconnect();
		serverHost.close();
		killServer(done);
	}

	function startListening() {
		return new Promise(resolve => {
			httpServer.listen(12345, resolve);
		});
	}

	beforeEach(() => {
		(global as any).window = { addEventListener() { }, removeEventListener() { } };
		(global as any).location = { protocol: 'http', host: `localhost:12345` };
		(global as any).WebSocket = WebSocket;

		log = spy();
		errorHandler = {
			handleError() { },
			handleRejection() { },
			handleRecvError() { },
		};
		httpServer = http.createServer();
		killServer = createKillMethod(httpServer);
	});

	[
		{ name: 'ws', ws: WebSocket },
		{ name: 'clusterWS-µWS', ws: { Server: ClusterWsServer } },
	].forEach(({ name, ws }) => {
		describe(`[${name}]`, () => {
			afterEach(function (done) {
				killServer(done);
			});

			it('connects to correct end point', async () => {
				let server1: Server;
				let server2: Server2;
				const host = createServerHost(httpServer, { path: '/ws', ws, errorHandler, log });
				const socket1 = host.socket(Server, Client, c => server1 = new Server(c), { id: 'socket1' });
				host.socket(Server2, Client, c => server2 = new Server2(c), { id: 'socket2' });

				await startListening();
				await setupClient(socket1.options());

				const hello1 = stub(server1!, 'hello');

				await delay(50);

				clientSocket.server.hello('yay');

				await delay(50);

				assert.calledWith(hello1, 'yay');
				expect(server2!).undefined;
			});
		});

		describe(`[${name}]`, () => {
			beforeEach(function (done) {
				setupServerClient(done, { ws });
			});

			afterEach(function (done) {
				closeServerClient(done);
			});

			it('calls connected when client connects', () => {
				assert.calledOnce(connected);
			});

			// it('sends version info to client', () => {
			// 	return delay(50)
			// 		.then(() => assert.calledWith(version, serverSocket.options().hash));
			// });

			it.skip('pings clients', () => {
				return delay(200);
				// TODO: add asserts
			});

			it('receives message from client', () => {
				const hello = stub(server, 'hello');

				return Promise.resolve()
					.then(() => clientSocket.server.hello('yay'))
					.then(() => delay(50))
					.then(() => assert.calledWith(hello, 'yay'));
			});

			it('handles resolved promise from server method', async () => {
				await expect(clientSocket.server.login('ok')).eventually.true;
			});

			it('handles rejected promise from server method', async () => {
				await expect(clientSocket.server.login('fail')).rejectedWith('fail');
			});

			it('sends error from error handler instead of original error', async () => {
				stub(errorHandler, 'handleRejection').returns(new Error('aaa'));

				await expect(clientSocket.server.login('fail')).rejectedWith('aaa');
			});

			it('handles rejected promise with null error from server method', async () => {
				await expect(clientSocket.server.nullReject()).rejectedWith('error');
			});

			it('reports promise rejection to error handler', () => {
				const handleRejection = stub(errorHandler, 'handleRejection');

				return Promise.resolve()
					.then(() => clientSocket.server.login('fail'))
					.catch(() => { })
					.then(() => assert.calledOnce(handleRejection));
			});

			// TODO: fix unreliable test
			it.skip('is able to disconnect the client', () => {
				const disconnected = stub(clientSocket.client, 'disconnected');

				return delay(50)
					.then(() => serverSocket.clients[0].client.disconnect())
					.then(() => delay(50))
					.then(() => assert.calledOnce(disconnected));
			});

			it('calls disconnected on client disconnect', () => {
				const disconnected = stub(server, 'disconnected');

				clientSocket.disconnect();

				return delay(50)
					.then(() => assert.calledOnce(disconnected));
			});

			it('is able to call client methods with arrayBuffer from server', () => {
				const bin2 = stub(clientSocket.client, 'bin2');

				server.client.bin2(new Uint8Array([1, 2, 3]).buffer, [4, 5, 6]);

				return delay(50)
					.then(() => {
						assert.calledOnce(bin2);
						expect(new Uint8Array(bin2.args[0][0])).eql(new Uint8Array([1, 2, 3]));
						expect(bin2.args[0][1]).eql([4, 5, 6]);
					});
			});

			it('is able to call client methods with array buffer from server ', () => {
				const hi = stub(clientSocket.client, 'hi');

				server.client.hi('yay');

				return delay(50)
					.then(() => assert.calledWith(hi, 'yay'));
			});

			it('passes exception to error handler', () => {
				const handleRecvError = stub(errorHandler, 'handleRecvError');

				clientSocket.server.err();

				return delay(50)
					.then(() => assert.calledOnce(handleRecvError));
			});

			it('logs client connected', () => {
				log.calledWith('client connected');
			});

			it('logs client disconnected', () => {
				clientSocket.disconnect();

				return delay(50)
					.then(() => log.calledWith('client disconnected'));
			});

			describe('close()', () => {
				it('closes the socket', () => {
					serverSocket.close();
				});
			});
		});
	});

	describe('(connection token)', () => {
		let clientOptions: ClientOptions;
		let clientToken: string;

		beforeEach(function (done) {
			setupServerClient(done, { connectionTokens: true, perMessageDeflate: false }, (opt, token) => {
				clientOptions = opt;
				clientToken = token!;
			});
		});

		afterEach(function (done) {
			closeServerClient(done);
		});

		it('connects with token', () => {
			assert.calledOnce(connected);
		});

		it('replaces user with the same token', () => {
			return setupClient(clientOptions, clientToken)
				.then(() => assert.calledTwice(connected));
		});
	});
});
