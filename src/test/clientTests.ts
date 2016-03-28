import './common';
import * as Promise from 'bluebird';
import { stub, spy, assert } from 'sinon';
import { expect } from 'chai';
import { MessageType } from '../packet/packetHandler';
import { ClientSocket } from '../clientSocket';
import { SocketClient, SocketServer } from '../interfaces';

let lastWebSocket: MockWebSocket;

interface Client extends SocketClient {
	test(): void;
	foo(): void;
}

interface Server extends SocketServer {
	test2(): void;
	foo(): Promise<any>;
	fooInProgress: boolean;
	foo2(): Promise<any>;
}

class MockWebSocket {
	constructor(public url: string) {
		lastWebSocket = this;
	}
	onmessage(message: { data: string | Buffer | ArrayBuffer }) { }
	onopen() { }
	onerror() { }
	onclose() { }
	close() { }
}

describe('SocketService', function () {
	let location = { protocol: '', host: '' };
	let window = { addEventListener() { }, removeEventListener() { } };
	let service: ClientSocket<Client, Server>;

	before(function () {
		(<any>global).window = window;
		(<any>global).location = location;
		(<any>global).WebSocket = MockWebSocket;
	});

	beforeEach(function () {
		location.protocol = 'http:';
		location.host = 'example.com';
		window.addEventListener = () => { };
		window.removeEventListener = () => { };
		lastWebSocket = null;

		service = new ClientSocket<Client, Server>({
			hash: 123,
			path: '/test',
			client: ['test', 'foo'],
			server: ['test2', ['foo', { promise: true, progress: 'fooInProgress' }], ['foo2', { promise: true }]],
		});
	});

	describe('invalidVersion', function () {
		it('should not be called if version is correct', function () {
			service.client.invalidVersion = () => { };
			let invalidVersion = stub(service.client, 'invalidVersion');
			service.connect();

			lastWebSocket.onmessage({ data: JSON.stringify([MessageType.Version, 123]) });

			assert.notCalled(invalidVersion);
		});

		it('should be called if version is incorrect', function () {
			service.client.invalidVersion = () => { };
			let invalidVersion = stub(service.client, 'invalidVersion');
			service.connect();

			lastWebSocket.onmessage({ data: JSON.stringify([MessageType.Version, 321]) });

			assert.calledOnce(invalidVersion);
		});
	});

	describe('connect()', function () {
		it('should create websocket with proper url', function () {
			service.connect();

			expect(lastWebSocket).not.undefined;
			expect(lastWebSocket.url).equal('ws://example.com/test');
		});

		it('should create websocket with SSL for HTTPS url', function () {
			location.protocol = 'https:';

			service.connect();

			expect(lastWebSocket.url).equal('wss://example.com/test');
		});

		it('should add event listener for "beforeunload"', function () {
			let addEventListener = stub(window, 'addEventListener');

			service.connect();

			assert.calledOnce(addEventListener);
		});

		it('should add event listener that closes the socket', function () {
			let addEventListener = stub(window, 'addEventListener');
			service.connect();
			let close = stub(lastWebSocket, 'close');

			addEventListener.args[0][1]();

			assert.calledOnce(close);
		});

		it('should add event listener that does nothing if not connected', function () {
			let addEventListener = stub(window, 'addEventListener');
			service.connect();
			let close = stub(lastWebSocket, 'close');

			lastWebSocket.onclose();
			addEventListener.args[0][1]();

			assert.notCalled(close);
		});

		it('should do nothing on second call', function () {
			service.connect();
			service.connect();
		});
	});

	describe('disconnect()', function () {
		it('should do nothing if not connected', function () {
			service.disconnect();
		});

		it('should close socket', function () {
			service.connect();
			let close = stub(lastWebSocket, 'close');

			service.disconnect();

			assert.calledOnce(close);
		});

		it('should remove event listener for "beforeunload"', function () {
			service.connect();
			let removeEventListener = stub(window, 'removeEventListener');

			service.disconnect();

			assert.calledOnce(removeEventListener);
		});
	});

	describe('server', function () {
		it('should have methods', function () {
			service.connect();
			lastWebSocket.onopen();

			service.server.test2();
		});

		it('should reject if called promise methods when not connected', function () {
			return expect(service.server.foo()).rejectedWith('not connected');
		});
	});

	describe('websocket', function () {
		beforeEach(function () {
			service.connect();
		});

		describe('websocket.onopen()', function () {
			it('should set isConnected to true', function () {
				lastWebSocket.onopen();

				expect(service.isConnected).true;
			});

			it('should call client.connected', function () {
				let connected = spy();
				service.client.connected = connected;

				lastWebSocket.onopen();

				assert.calledOnce(connected);
			});
		});

		describe('websocket.onclose()', function () {
			it('should set isConnected to false', function () {
				lastWebSocket.onopen();

				lastWebSocket.onclose();

				expect(service.isConnected).false;
			});

			it.skip('should call client.disconnected', function () {
				let disconnected = spy();
				service.client.disconnected = disconnected;
				lastWebSocket.onopen();

				lastWebSocket.onclose();

				assert.calledOnce(disconnected);
			});

			it('should reject all pending promises', function () {
				lastWebSocket.onopen();

				let promise = service.server.foo();

				lastWebSocket.onclose();

				return expect(promise).rejectedWith('disconnected');
			});
		});

		describe('websocket.onerror()', function () {
			it('should do nothing', function () {
				lastWebSocket.onopen();

				lastWebSocket.onerror();
			});
		});

		describe('websocket.onmessage()', function () {
			it('should call received mesasge', function () {
				service.client.foo = function () { };
				let foo = stub(service.client, 'foo');
				lastWebSocket.onopen();

				lastWebSocket.onmessage({ data: '[1, 2]' });

				assert.calledWith(foo, 2);
			});

			it('should resolve pending promise', function () {
				lastWebSocket.onopen();

				let promise = service.server.foo();

				lastWebSocket.onmessage({ data: JSON.stringify([MessageType.Resolved, 1, 1, 'ok']) });

				return promise.then(x => expect(x).equal('ok'));
			});

			it('shoudl change progress field', function () {
				lastWebSocket.onopen();

				let promise = service.server.foo();

				expect(service.server.fooInProgress).true;

				lastWebSocket.onmessage({ data: JSON.stringify([MessageType.Resolved, 1, 1, 'ok']) });

				return promise.then(() => expect(service.server.fooInProgress).false);
			});

			it('should reject pending promise', function () {
				lastWebSocket.onopen();

				let promise = service.server.foo();

				lastWebSocket.onmessage({ data: JSON.stringify([MessageType.Rejected, 1, 1, 'fail']) });

				return expect(promise).rejectedWith('fail');
			});

			it('should do nothing for resolving non-existing promise', function () {
				lastWebSocket.onopen();

				let promise = service.server.foo();

				lastWebSocket.onmessage({ data: JSON.stringify([MessageType.Resolved, 1, 5, 'ok']) });
			});

			it('should do nothing for rejecting non-existing promise', function () {
				lastWebSocket.onopen();

				let promise = service.server.foo();

				lastWebSocket.onmessage({ data: JSON.stringify([MessageType.Rejected, 1, 5, 'fail']) });
			});

			it('should resolve promises with correct id', function () {
				lastWebSocket.onopen();

				let promise1 = service.server.foo();
				let promise2 = service.server.foo();

				lastWebSocket.onmessage({ data: JSON.stringify([MessageType.Resolved, 1, 2, 'a']) });
				lastWebSocket.onmessage({ data: JSON.stringify([MessageType.Resolved, 1, 1, 'b']) });

				return Promise.all([promise1, promise2])
					.then(([result1, result2]) => {
						expect(result1).equal('b');
						expect(result2).equal('a');
					});
			});
		});
	});
});
