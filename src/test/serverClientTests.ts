﻿import './common';
import * as Promise from 'bluebird';
import * as http from 'http';
import * as WebSocket from 'ws';
import { expect } from 'chai';
import { assert, stub, spy } from 'sinon';

import {
	Socket, Method, ClientSocket, createServer, ClientExtensions, Server as ServerController,
	SocketClient, SocketServer, ErrorHandler
} from '../index';

@Socket({ path: '/test', pingInterval: 100, debug: true })
class Server implements SocketServer {
	constructor(public client: Client & ClientExtensions) { }
	@Method({ binary: ['String'], ignore: true })
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
	@Method({ binary: ['String'], ignore: true })
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
	let connected: Sinon.SinonStub;
	let log: Sinon.SinonSpy;

	beforeEach(function (done) {
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
		serverSocket = createServer(httpServer, Server, Client, c => {
			server = new Server(c);
			connected = stub(server, 'connected');
			return server;
		}, null, errorHandler, <any>log);
		httpServer.listen(12345, () => {
			clientSocket = new ClientSocket<Client, Server>(serverSocket.options, f => f(), <any>log);
			clientSocket.client = new Client();
			clientSocket.client.connected = done;
			clientSocket.connect();
		});
	});

	afterEach(function (done) {
		clientSocket.disconnect();
		httpServer.close(done);
	});

	it('should call connected when client connects', function () {
		assert.calledOnce(connected);
	});

	it('should send version info to client', function () {
		let version = stub((<any>clientSocket).special, '*version');

		return Promise.delay(10)
			.then(() => assert.calledWith(version, serverSocket.options.hash));
	});

	it('should ping clients', function () {
		return Promise.delay(200);
	});

	it('should receive message from client', function () {
		let hello = stub(server, 'hello');

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
		let handleRejection = stub(errorHandler, 'handleRejection');

		return Promise.resolve()
			.then(() => clientSocket.server.login('fail'))
			.catch(e => { })
			.then(() => assert.calledOnce(handleRejection));
	});

	it('should be able to disconnect the client', function () {
		let disconnected = stub(clientSocket.client, 'disconnected');

		serverSocket.clients[0].client.disconnect();

		return Promise.delay(10)
			.then(() => assert.calledOnce(disconnected));
	});

	it('should call disconnected on client disconnect', function () {
		let disconnected = stub(server, 'disconnected');

		clientSocket.disconnect();

		return Promise.delay(10)
			.then(() => assert.calledOnce(disconnected));
	});

	it('should be able to call client methods from server', function () {
		let hi = stub(clientSocket.client, 'hi');
		server.client.hi('yay');

		return Promise.delay(10)
			.then(() => assert.calledWith(hi, 'yay'));
	});

	it('should pass exception to error handler', function () {
		let handleRecvError = stub(errorHandler, 'handleRecvError');

		clientSocket.server.err();

		return Promise.delay(10)
			.then(() => assert.calledOnce(handleRecvError));
	});

	it('should log client connected', function () {
		log.calledWith('client connected');
	});

	it('should log client disconnected', function () {
		clientSocket.disconnect();

		return Promise.delay(10)
			.then(() => log.calledWith('client disconnected'));
	});

	describe('close()', function () {
		it('should close the socket', function () {
			serverSocket.close();
		});
	});
});
