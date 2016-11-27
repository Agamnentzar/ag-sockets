import './common';
import * as Promise from 'bluebird';
import * as http from 'http';
import * as WebSocket from 'ws';
import { expect } from 'chai';
import { assert, stub, spy, SinonSpy } from 'sinon';
import { Bin, ServerOptions, ClientOptions } from '../interfaces';
import { randomString } from '../utils';
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
		return login === 'ok' ? Promise.resolve(true) : Promise.reject<boolean>(new Error('fail'));
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
	connected() { }
	disconnected() { }
}

describe('ClientSocket + Server', function () {
	let httpServer: http.Server;
	let server: Server;
	let serverSocket: ServerController;
	let clientSocket: ClientSocket<Client, Server>;
	let errorHandler: ErrorHandler;
	let connected: SinonSpy;
	let log: SinonSpy;

	function setupClient(options: ClientOptions) {
		return new Promise(resolve => {
			clientSocket = new ClientSocket<Client, Server>(options, void 0, apply, <any>log);
			clientSocket.client = new Client();
			clientSocket.client.connected = resolve;
			clientSocket.connect();
		});
	}

	function setupServerClient(done: () => void, options: ServerOptions = {}, onClient: (options: ClientOptions) => void = () => { }) {
		connected = spy();

		serverSocket = createServer(httpServer, Server, Client, c => {
			server = new Server(c);
			server.connected = connected as any;
			return server;
		}, options, errorHandler, <any>log);

		const clientOptions = serverSocket.options();
		onClient(clientOptions);
		httpServer.listen(12345, () => setupClient(clientOptions).then(done));
	}

	function closeServerClient(done: () => void) {
		clientSocket.disconnect();
		httpServer.close(done);
	}

	beforeEach(function () {
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

	describe('(default)', function () {
		beforeEach(function (done) {
			setupServerClient(done);
		});

		afterEach(function (done) {
			closeServerClient(done);
		});

		it('should call connected when client connects', function () {
			assert.calledOnce(connected);
		});

		it('should send version info to client', function () {
			const version = stub((<any>clientSocket).special, '*version');

			return Promise.delay(50)
				.then(() => assert.calledWith(version, serverSocket.options().hash));
		});

		it('should ping clients', function () {
			return Promise.delay(200);
		});

		it('should receive message from client', function () {
			const hello = stub(server, 'hello');

			return Promise.resolve()
				.then(() => clientSocket.server.hello('yay'))
				.delay(50)
				.then(() => assert.calledWith(hello, 'yay'));
		});

		it('should handle resolved promise from server method', function () {
			return expect(clientSocket.server.login('ok')).eventually.true;
		});

		it('should handle rejected promise from server method', function () {
			return expect(clientSocket.server.login('fail')).rejectedWith('fail');
		});

		it('should handle rejected promise with null error from server method', function () {
			return expect(clientSocket.server.nullReject()).rejectedWith('error');
		});

		it('should report promise rejection to error handler', function () {
			const handleRejection = stub(errorHandler, 'handleRejection');

			return Promise.resolve()
				.then(() => clientSocket.server.login('fail'))
				.catch(() => { })
				.then(() => assert.calledOnce(handleRejection));
		});

		it('should be able to disconnect the client', function () {
			const disconnected = stub(clientSocket.client, 'disconnected');

			serverSocket.clients[0].client.disconnect();

			return Promise.delay(50)
				.then(() => assert.calledOnce(disconnected));
		});

		it('should call disconnected on client disconnect', function () {
			const disconnected = stub(server, 'disconnected');

			clientSocket.disconnect();

			return Promise.delay(50)
				.then(() => assert.calledOnce(disconnected));
		});

		it('should be able to call client methods from server', function () {
			const hi = stub(clientSocket.client, 'hi');
			server.client.hi('yay');

			return Promise.delay(50)
				.then(() => assert.calledWith(hi, 'yay'));
		});

		it('should pass exception to error handler', function () {
			const handleRecvError = stub(errorHandler, 'handleRecvError');

			clientSocket.server.err();

			return Promise.delay(50)
				.then(() => assert.calledOnce(handleRecvError));
		});

		it('should log client connected', function () {
			log.calledWith('client connected');
		});

		it('should log client disconnected', function () {
			clientSocket.disconnect();

			return Promise.delay(50)
				.then(() => log.calledWith('client disconnected'));
		});

		describe('close()', function () {
			it('should close the socket', function () {
				serverSocket.close();
			});
		});
	});

	describe('(client side rate limit)', function () {
		beforeEach(function (done) {
			setupServerClient(done);
		});

		afterEach(function (done) {
			closeServerClient(done);
		});

		it('should call method if rate limit is not exceeded', function () {
			const limited = stub(server, 'limited');

			clientSocket.server.limited();

			return Promise.delay(50)
				.then(() => assert.calledOnce(limited));
		});

		it('should not call method if rate limit is exceeded', function () {
			const limited = stub(server, 'limited');

			clientSocket.server.limited();
			clientSocket.server.limited();

			return Promise.delay(50)
				.then(() => assert.calledOnce(limited));
		});

		it('should reject if rate limit is exceeded', function () {
			return clientSocket.server.limitedPromise()
				.then(() => expect(clientSocket.server.limitedPromise()).rejectedWith('rate limit exceeded'));
		});
	});

	describe('(server side rate limit)', function () {
		beforeEach(function (done) {
			setupServerClient(done, {}, opt => {
				opt.server.forEach(x => {
					if (typeof x !== 'string') {
						delete x[1].rateLimit;
					}
				});
			});
		});

		afterEach(function (done) {
			closeServerClient(done);
		});

		it('should not call method if rate limit is exceeded', function () {
			const limited = stub(server, 'limited');

			clientSocket.server.limited();
			clientSocket.server.limited();

			return Promise.delay(50)
				.then(() => assert.calledOnce(limited));
		});

		it('should reject if rate limit is exceeded', function () {
			stub(server, 'limited');

			clientSocket.server.limitedPromise();

			return expect(clientSocket.server.limitedPromise()).rejectedWith('rate limit exceeded');
		});
	});

	describe('(transfer limit)', function () {
		beforeEach(function (done) {
			setupServerClient(done, { transferLimit: 100 });
		});

		afterEach(function (done) {
			closeServerClient(done);
		});

		it('should work if not exceeding limit', function () {
			const test = stub(server, 'test');

			clientSocket.server.test('foo bar boo');

			return Promise.delay(50)
				.then(() => assert.calledWith(test, 'foo bar boo'));
		});

		it('should not call method if exceeded limit (one message)', function () {
			const test = stub(server, 'test');

			clientSocket.server.test('LJKzNQwbEF7xOTW4aoXiXBrIKQLg2DS2tWkhGNK4HL2K1HLidWPNs0q0O3pVMKD77diXrfLjhudLmd7bGHwPSijtcwtkSEnpqKTMm2BOP6N');

			return Promise.delay(50)
				.then(() => assert.notCalled(test));
		});

		it('should disconnect if exceeded limit (one message)', function () {
			const disconnected = stub(clientSocket.client, 'disconnected');

			clientSocket.server.test('LJKzNQwbEF7xOTW4aoXiXBrIKQLg2DS2tWkhGNK4HL2K1HLidWPNs0q0O3pVMKD77diXrfLjhudLmd7bGHwPSijtcwtkSEnpqKTMm2BOP6N');

			return Promise.delay(50)
				.then(() => assert.calledOnce(disconnected));
		});

		it('should disconnect if exceeded limit (many messages)', function () {
			const disconnected = stub(clientSocket.client, 'disconnected');

			for (let i = 0; i < 15; i++)
				clientSocket.server.test(randomString(10));

			return Promise.delay(50)
				.then(() => assert.calledOnce(disconnected));
		});

		// TODO: fix unreliable timing
		it.skip('should reset transfer after a second', function () {
			const test = stub(server, 'test');

			clientSocket.server.test(randomString(10));

			return Promise.delay(1100)
				.then(() => clientSocket.server.test(randomString(10)))
				.delay(300)
				.then(() => assert.calledTwice(test));
		});
	});

	describe('(security token)', function () {
		let clientOptions: ClientOptions;

		beforeEach(function (done) {
			setupServerClient(done, { connectionTokens: true, perMessageDeflate: false }, opt => clientOptions = opt);
		});

		afterEach(function (done) {
			closeServerClient(done);
		});

		it('should connect with token', function () {
			assert.calledOnce(connected);
		});

		it('should replace user with the same token', function () {
			return setupClient(clientOptions)
				.then(() => assert.calledTwice(connected));
		});
	});
});
