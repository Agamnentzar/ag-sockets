import { delay } from './common';
import * as http from 'http';
import * as WebSocket from 'ws';
import * as uWebSocket from 'uws';
import { expect } from 'chai';
import { assert, stub, spy, SinonSpy, SinonStub } from 'sinon';
import { Bin, ServerOptions, ClientOptions } from '../interfaces';
import {
	Socket, Method, ClientSocket, createServer, ClientExtensions, Server as ServerController,
	SocketClient, SocketServer, ErrorHandler
} from '../index';

const apply = (f: () => void) => f();

@Socket({ path: '/test', pingInterval: 100, debug: true, clientLimit: 2 })
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
	let server: Server;
	let serverSocket: ServerController;
	let clientSocket: ClientSocket<Client, Server>;
	let errorHandler: ErrorHandler;
	let connected: SinonSpy;
	let log: SinonSpy;
	let version: SinonStub;

	function setupClient(options: ClientOptions, token?: string) {
		return new Promise(resolve => {
			clientSocket = new ClientSocket<Client, Server>(options, token, undefined, apply, <any>log);
			version = stub((<any>clientSocket).special, '*version');
			clientSocket.client = new Client();
			clientSocket.client.connected = resolve;
			clientSocket.connect();
		});
	}

	function setupServerClient(done: () => void, options: ServerOptions = {}, onClient: (options: ClientOptions, token?: string) => void = () => { }) {
		connected = spy();

		serverSocket = createServer(httpServer, Server, Client, c => {
			server = new Server(c);
			server.connected = connected as any;
			return server;
		}, options, errorHandler, <any>log);

		const clientOptions = serverSocket.options();
		const token = options.connectionTokens ? serverSocket.token() : undefined;

		onClient(clientOptions, token);

		httpServer.listen(12345, () => {
			setupClient(clientOptions, token).then(done);
		});
	}

	function closeServerClient(done: () => void) {
		clientSocket.disconnect();
		httpServer.close(done);
	}

	beforeEach(() => {
		(<any>global).window = { addEventListener() { }, removeEventListener() { } };
		(<any>global).location = { protocol: 'http', host: 'localhost:12345' };
		(<any>global).WebSocket = WebSocket;

		log = spy();
		errorHandler = {
			handleError() { },
			handleRejection() { },
			handleRecvError() { },
		};
		httpServer = http.createServer();
	});

	[
		{ name: 'ws', ws: WebSocket, arrayBuffer: false },
		{ name: 'µWS', ws: uWebSocket, arrayBuffer: true },
	].forEach(({ name, ws, arrayBuffer }) => {
		describe(`[${name}]`, () => {
			beforeEach(function (done) {
				setupServerClient(done, { ws, arrayBuffer });
			});

			afterEach(function (done) {
				closeServerClient(done);
			});

			it('should call connected when client connects', () => {
				assert.calledOnce(connected);
			});

			it('should send version info to client', () => {
				return delay(50)
					.then(() => assert.calledWith(version, serverSocket.options().hash));
			});

			it.skip('should ping clients', () => {
				return delay(200);
				// TODO: add asserts
			});

			it('should receive message from client', () => {
				const hello = stub(server, 'hello');

				return Promise.resolve()
					.then(() => clientSocket.server.hello('yay'))
					.then(() => delay(50))
					.then(() => assert.calledWith(hello, 'yay'));
			});

			it('should handle resolved promise from server method', () => {
				return expect(clientSocket.server.login('ok')).eventually.true;
			});

			it('should handle rejected promise from server method', () => {
				return expect(clientSocket.server.login('fail')).rejectedWith('fail');
			});

			it('should send error from error handler instead of original error', () => {
				stub(errorHandler, 'handleRejection').returns(new Error('aaa'));

				return expect(clientSocket.server.login('fail')).rejectedWith('aaa');
			});

			it('should handle rejected promise with null error from server method', () => {
				return expect(clientSocket.server.nullReject()).rejectedWith('error');
			});

			it('should report promise rejection to error handler', () => {
				const handleRejection = stub(errorHandler, 'handleRejection');

				return Promise.resolve()
					.then(() => clientSocket.server.login('fail'))
					.catch(() => { })
					.then(() => assert.calledOnce(handleRejection));
			});

			// TODO: fix unreliable test
			it.skip('should be able to disconnect the client', () => {
				const disconnected = stub(clientSocket.client, 'disconnected');

				return delay(50)
					.then(() => serverSocket.clients[0].client.disconnect())
					.then(() => delay(50))
					.then(() => assert.calledOnce(disconnected));
			});

			it('should call disconnected on client disconnect', () => {
				const disconnected = stub(server, 'disconnected');

				clientSocket.disconnect();

				return delay(50)
					.then(() => assert.calledOnce(disconnected));
			});

			it('should be able to call client methods with arrayBuffer from server', () => {
				const bin2 = stub(clientSocket.client, 'bin2');

				server.client.bin2(new Uint8Array([1, 2, 3]).buffer, [4, 5, 6]);

				return delay(50)
					.then(() => {
						assert.calledOnce(bin2);
						expect(new Uint8Array(bin2.args[0][0])).eql(new Uint8Array([1, 2, 3]));
						expect(bin2.args[0][1]).eql([4, 5, 6]);
					});
			});

			it('should be able to call client methods with array buffer from server ', () => {
				const hi = stub(clientSocket.client, 'hi');

				server.client.hi('yay');

				return delay(50)
					.then(() => assert.calledWith(hi, 'yay'));
			});

			it('should pass exception to error handler', () => {
				const handleRecvError = stub(errorHandler, 'handleRecvError');

				clientSocket.server.err();

				return delay(50)
					.then(() => assert.calledOnce(handleRecvError));
			});

			it('should log client connected', () => {
				log.calledWith('client connected');
			});

			it('should log client disconnected', () => {
				clientSocket.disconnect();

				return delay(50)
					.then(() => log.calledWith('client disconnected'));
			});

			describe('close()', () => {
				it('should close the socket', () => {
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

		it('should connect with token', () => {
			assert.calledOnce(connected);
		});

		it('should replace user with the same token', () => {
			return setupClient(clientOptions, clientToken)
				.then(() => assert.calledTwice(connected));
		});
	});
});
