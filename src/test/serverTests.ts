import './common';
import * as Promise from 'bluebird';
import * as http from 'http';
import * as ws from 'ws';
import { expect } from 'chai';
import { assert, stub, spy, SinonStub, SinonSpy } from 'sinon';
import { Bin } from '../interfaces';
import { createServer } from '../serverSocket';
import { Method, Socket } from '../method';

@Socket({ path: '/test', pingInterval: 1000 })
class Server {
	constructor(private client: Client) { }
	@Method({ binary: [Bin.Str], ignore: true })
	hello(message: string) { }
	@Method({ promise: true })
	login(login: string) {
		return login === 'test' ? Promise.resolve(true) : Promise.reject<boolean>(new Error('fail'));
	}
}

class Client {
	@Method({ binary: [Bin.Str], ignore: true })
	hi(message: string) { }
}

class Server2 {
	constructor(private client: Client2) { }
	hello(message: string) { }
	login(login: string) { return Promise.resolve(true); }
}

class Client2 {
	hi(message: string) { }
}

describe('serverSocket', function () {
	describe('createServer() (real)', function () {
		let server: http.Server;

		beforeEach(function () {
			server = http.createServer();
		});

		afterEach(function (done) {
			server.close(() => done());
		});

		it('should be able to start server (no metadata)', function (done) {
			createServer(server, Server2, Client2, c => new Server2(c), { path: '/test2' });
			server.listen(12345, done);
		});

		it('should be able to close server', function (done) {
			const socket = createServer(server, Server2, Client2, c => new Server2(c), { path: '/test2' });
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

			expect(() => createServer(server, Ctor, Ctor, () => null)).throw('too many methods');
		});

		describe('(mock WebSocketServer)', function () {
			let wsServer: SinonStub;
			let on: SinonSpy;

			beforeEach(function () {
				wsServer = stub(ws, 'Server');
				wsServer.prototype.on = on = spy();
			});

			afterEach(function () {
				wsServer.restore();
			});

			it('should pass http server to websocket server', function () {
				createServer(server, Server2, Client2, c => new Server2(c), { path: '/test2' });

				assert.calledOnce(wsServer);
				const options = wsServer.getCall(0).args[0];
				expect(options.server).equal(server);
				expect(options.path).equal('/test2');
			});

			it('should pass perMessageDeflate option to websocket server', function () {
				createServer(server, Server2, Client2, c => new Server2(c), { path: '/test2', perMessageDeflate: false });

				assert.calledOnce(wsServer);
				const options = wsServer.getCall(0).args[0];
				expect(options.perMessageDeflate).false;
			});

			it('should setup error handler', function () {
				const handleError = spy();
				createServer(server, Server2, Client2, c => new Server2(c), { path: '/test2' }, { handleError } as any);

				assert.calledWith(on, 'error');
				const [event, callback] = on.getCall(1).args;
				expect(event).equal('error');
				const error = new Error('test');
				callback(error);
				assert.calledWith(handleError, null, error);
			});

			it('should setup work without error handler', function () {
				createServer(server, Server2, Client2, c => new Server2(c), { path: '/test2' });

				assert.calledWith(on, 'error');
				const [event, callback] = on.getCall(1).args;
				expect(event).equal('error');
				callback(new Error('test'));
			});

			it('should setup connetion handler', function () {
				const handleError = spy();
				createServer(server, Server2, Client2, c => new Server2(c), { path: '/test2' });

				assert.calledWith(on, 'connection');
				const [event, callback] = on.getCall(0).args;
				expect(event).equal('connection');
			});

			// connecting

			function createTestServer() {
				createServer(server, Server2, Client2, c => new Server2(c), { path: '/test2' });
			}

			function connectTestServer(socket: any) {
				const [event, callback] = on.getCall(0).args;
				expect(event).equal('connection');
				callback(socket);
			}

			function createSocket() {
				return {
					on() { },
					upgradeReq: { url: '/path' }
				};
			}

			it('should attach message handler', function () {
				createTestServer();
				const socket = createSocket();
				const on = stub(socket, 'on');

				connectTestServer(socket);

				assert.calledWith(on, 'message');
			});
		});
	});
});
