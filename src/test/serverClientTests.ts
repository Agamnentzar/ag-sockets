import './common';
import * as Promise from 'bluebird';
import * as http from 'http';
import * as WebSocket from 'ws';
import { expect } from 'chai';
import { assert, stub, spy, SinonStub, SinonSpy } from 'sinon';
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
	hello(message: string) { }
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
	connected() { }
	disconnected() { }
}

class Client implements SocketClient {
	@Method({ binary: [Bin.Str], ignore: true })
	bin(message: string) { }
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
			clientSocket = new ClientSocket<Client, Server>(options, null, apply, <any>log);
			clientSocket.client = new Client();
			clientSocket.client.connected = resolve;
			clientSocket.connect();
		});
	}

	function setupServerClient(done: () => void, options: ServerOptions = null, onClient: (options: ClientOptions) => void = () => { }) {
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

			return Promise.delay(10)
				.then(() => assert.calledWith(version, serverSocket.options().hash));
		});

		it('should ping clients', function () {
			return Promise.delay(200);
		});

		it('should receive message from client', function () {
			const hello = stub(server, 'hello');

			return Promise.resolve()
				.then(() => clientSocket.server.hello('yay'))
				.delay(10)
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
				.catch(e => { })
				.then(() => assert.calledOnce(handleRejection));
		});

		it('should be able to disconnect the client', function () {
			const disconnected = stub(clientSocket.client, 'disconnected');

			serverSocket.clients[0].client.disconnect();

			return Promise.delay(20)
				.then(() => assert.calledOnce(disconnected));
		});

		it('should call disconnected on client disconnect', function () {
			const disconnected = stub(server, 'disconnected');

			clientSocket.disconnect();

			return Promise.delay(20)
				.then(() => assert.calledOnce(disconnected));
		});

		it('should be able to call client methods from server', function () {
			const hi = stub(clientSocket.client, 'hi');
			server.client.hi('yay');

			return Promise.delay(20)
				.then(() => assert.calledWith(hi, 'yay'));
		});

		it('should pass exception to error handler', function () {
			const handleRecvError = stub(errorHandler, 'handleRecvError');

			clientSocket.server.err();

			return Promise.delay(20)
				.then(() => assert.calledOnce(handleRecvError));
		});

		it('should log client connected', function () {
			log.calledWith('client connected');
		});

		it('should log client disconnected', function () {
			clientSocket.disconnect();

			return Promise.delay(20)
				.then(() => log.calledWith('client disconnected'));
		});

		describe('close()', function () {
			it('should close the socket', function () {
				serverSocket.close();
			});
		});
	});

	describe('(security token)', function () {
		let clientOptions: ClientOptions;

		beforeEach(function (done) {
			setupServerClient(done, { connectionTokens: true }, opt => clientOptions = opt);
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

	describe.skip('(security token, invalid)', function () {
		beforeEach(function (done) {
			setupServerClient(done, { connectionTokens: true }, opt => opt.token = 'foo');
		});

		afterEach(function (done) {
			closeServerClient(done);
		});

		it('should not connect with invalid token', function () {
			assert.notCalled(connected);
		});
	});

	describe.skip('(test)', function () {
		beforeEach(function (done) {
			setupServerClient(done, { connectionTokens: true });
		});

		afterEach(function (done) {
			closeServerClient(done);
		});

		it('should not connect with invalid token', function () {
			assert.notCalled(connected);
		});
	});
});
