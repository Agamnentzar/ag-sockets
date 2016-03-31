import './common';
import * as Promise from 'bluebird';
import * as http from 'http';
import { expect } from 'chai';
import { createServer } from '../serverSocket';
import { Method, Socket } from '../method';

@Socket({ path: '/test', pingInterval: 1000 })
class Server {
	constructor(private client: Client) { }
	@Method({ binary: ['String'], ignore: true })
	hello(message: string) { }
	@Method({ promise: true })
	login(login: string) {
		return login === 'test' ? Promise.resolve(true) : Promise.reject<boolean>(new Error('fail'));
	}
}

class Client {
	@Method({ binary: ['String'], ignore: true })
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
	describe('createServer()', function () {
		let server: http.Server;

		beforeEach(function () {
			server = http.createServer();
		});

		afterEach(function (done) {
			server.close(() => done());
		});

		it('no metadata', function (done) {
			let socket = createServer(server, Server2, Client2, c => new Server2(c), { path: '/test2' });
			server.listen(12345, done);
		});

		it('close()', function (done) {
			let socket = createServer(server, Server2, Client2, c => new Server2(c), { path: '/test2' });
			server.listen(12345, () => {
				socket.close();
				done();
			});
		});

		it('should throw if passed object with too many methods', function () {
			let Ctor: any = () => { };

			for (let i = 0; i < 251; i++) {
				Ctor.prototype[`foo${i}`] = () => { };
			}

			expect(() => createServer(server, Ctor, Ctor, () => null)).throw('too many methods');
		});
	});
});
