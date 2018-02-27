import './common';
import { expect } from 'chai';
import { stub, spy, assert } from 'sinon';
import { MessageType } from '../packet/packetHandler';
import { ClientOptions, ClientSocket, SocketClient, SocketServer, SocketService, ClientErrorHandler } from '../index';
import { cloneDeep } from '../utils';

let lastWebSocket: MockWebSocket;

class MockWebSocket {
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly CLOSING = 2;
	static readonly CLOSED = 3;
	readyState = MockWebSocket.OPEN;
	constructor(public url: string) {
		lastWebSocket = this;
	}
	onmessage(_message: any) { }
	onopen() { }
	onerror() { }
	onclose() { }
	close() { }
	send() { }
}

interface Client extends SocketClient {
	test(): void;
	foo(): void;
}

interface Server extends SocketServer {
	test2(): void;
	foo(): Promise<any>;
	fooInProgress: boolean;
	foo2(): Promise<any>;
	foo3(): void;
}

describe('ClientSocket', () => {
	const location = { protocol: '', host: '' };
	const window = { addEventListener() { }, removeEventListener() { } };
	const clientOptions: ClientOptions = {
		hash: 123,
		path: '/test',
		client: ['test', 'foo'],
		server: [
			'test2',
			['foo', { promise: true, progress: 'fooInProgress' }],
			['foo2', { promise: true, rateLimit: '1/s' }],
			['foo3', { rateLimit: '1/s' }],
			'',
			'',
		],
		pingInterval: 1000,
		requestParams: { foo: 'bar', x: 5 },
		reconnectTimeout: 1000, // prevent immediate reconnect changing lastWebSocket
	};

	let service: SocketService<Client, Server>;
	let errorHandler: ClientErrorHandler;

	before(() => {
		(<any>global).window = window;
		(<any>global).location = location;
		(<any>global).WebSocket = MockWebSocket;
	});

	beforeEach(() => {
		location.protocol = 'http:';
		location.host = 'example.com';
		window.addEventListener = () => { };
		window.removeEventListener = () => { };
		lastWebSocket = null as any;
		errorHandler = { handleRecvError() { } };

		service = new ClientSocket<Client, Server>(clientOptions, void 0, errorHandler);
	});

	describe('invalidVersion', () => {
		it('should not be called if version is correct', () => {
			service.client.invalidVersion = () => { };
			const invalidVersion = stub(service.client, 'invalidVersion');
			service.connect();

			lastWebSocket.onmessage({ data: JSON.stringify([MessageType.Version, 123]) });

			assert.notCalled(invalidVersion);
		});

		it('should be called if version is incorrect', () => {
			service.client.invalidVersion = () => { };
			const invalidVersion = stub(service.client, 'invalidVersion');
			service.connect();

			lastWebSocket.onmessage({ data: JSON.stringify([MessageType.Version, 321]) });

			assert.calledOnce(invalidVersion);
		});

		it('should do nothing if there is no callback', () => {
			service.client.invalidVersion = void 0;
			service.connect();

			lastWebSocket.onmessage({ data: JSON.stringify([MessageType.Version, 321]) });
		});
	});

	describe('ping', () => {
		it('should respond to empty message with ping', () => {
			service.connect();
			const send = stub(lastWebSocket, 'send');
			lastWebSocket.onmessage({ data: JSON.stringify([MessageType.Version, 123]) });

			lastWebSocket.onmessage({ data: '' });

			assert.calledWith(send, '');
		});

		it('should not send ping if connection is not open', () => {
			service.connect();
			const send = stub(lastWebSocket, 'send');
			lastWebSocket.onmessage({ data: JSON.stringify([MessageType.Version, 123]) });
			lastWebSocket.readyState = WebSocket.CLOSED;

			lastWebSocket.onmessage({ data: '' });

			assert.notCalled(send);
		});

		it('should not respond to empty message with ping if ping was already sent', () => {
			service.connect();
			const send = stub(lastWebSocket, 'send');
			lastWebSocket.onmessage({ data: JSON.stringify([MessageType.Version, 123]) });

			lastWebSocket.onmessage({ data: '' });
			lastWebSocket.onmessage({ data: '' });

			assert.calledOnce(send);
		});

		it('should not respond to empty message with ping if version is not yet validated', () => {
			service.connect();
			const send = stub(lastWebSocket, 'send');

			lastWebSocket.onmessage({ data: '' });

			assert.notCalled(send);
		});
	});

	describe('connect()', () => {
		it('should create websocket with proper url', () => {
			service.connect();

			expect(lastWebSocket).not.undefined;
			expect(lastWebSocket.url).equal('ws://example.com/test?foo=bar&x=5&bin=true');
		});

		it('should use "/ws" as default path', () => {
			const options = cloneDeep(clientOptions);
			delete options.path;
			service = new ClientSocket<Client, Server>(options);
			service.connect();

			expect(lastWebSocket.url).equal('ws://example.com/ws?foo=bar&x=5&bin=true');
		});

		it('should create websocket with SSL for HTTPS url', () => {
			location.protocol = 'https:';

			service.connect();

			expect(lastWebSocket.url).equal('wss://example.com/test?foo=bar&x=5&bin=true');
		});

		it('should add event listener for "beforeunload"', () => {
			const addEventListener = stub(window, 'addEventListener');

			service.connect();

			assert.calledOnce(addEventListener);
		});

		it('should add event listener that closes the socket', () => {
			let addEventListener = stub(window, 'addEventListener');
			service.connect();
			let close = stub(lastWebSocket, 'close');

			addEventListener.args[0][1]();
			lastWebSocket.onclose();

			assert.calledOnce(close);
		});

		it('should add event listener that does nothing if not connected', () => {
			const addEventListener = stub(window, 'addEventListener');
			service.connect();
			const close = stub(lastWebSocket, 'close');

			lastWebSocket.onclose();
			addEventListener.args[0][1]();

			assert.notCalled(close);
		});

		it('should do nothing on second call', () => {
			service.connect();
			service.connect();
		});
	});

	describe('disconnect()', () => {
		it('should do nothing if not connected', () => {
			service.disconnect();
		});

		it('should close socket', () => {
			service.connect();
			const close = stub(lastWebSocket, 'close');

			service.disconnect();

			assert.calledOnce(close);
		});

		it('should remove event listener for "beforeunload"', () => {
			service.connect();
			const removeEventListener = stub(window, 'removeEventListener');

			service.disconnect();

			assert.calledOnce(removeEventListener);
		});
	});

	describe('(not connected)', () => {
		it('should reject if called promise methods when not connected', () => {
			return expect(service.server.foo()).rejectedWith('not connected');
		});
	});

	describe('(connected)', () => {
		beforeEach(() => {
			service.connect();
			lastWebSocket.onopen();
		});

		it('should have methods', () => {
			service.server.test2();
		});

		it('should send data to socket', () => {
			const send = stub(lastWebSocket, 'send');

			service.server.test2();

			assert.calledWith(send, '[0]');
		});

		it('should reject when rate limit is exceeded', () => {
			service.server.foo2();
			expect(service.server.foo2()).rejectedWith('rate limit exceeded');
		});

		it('should return false when rate limit is exceeded', () => {
			service.server.foo3();
			expect(service.server.foo3()).false;
		});

		it('should not send request when rate limit is exceeded', () => {
			service.server.foo3();
			const send = stub((service as any).packet, 'send');

			expect(service.server.foo3()).false;

			assert.notCalled(send);
		});

		it('should reject when rate limit is exceeded', () => {
			service.server.foo2();
			expect(service.server.foo2()).rejectedWith('rate limit exceeded');
		});

		it('should not send request when rate limit is exceeded (promise)', () => {
			service.server.foo2();
			const send = stub((service as any).packet, 'send');

			expect(service.server.foo2()).rejectedWith('rate limit exceeded');

			assert.notCalled(send);
		});

		it('should not send data when socket readyState is not OPEN', () => {
			const send = stub(lastWebSocket, 'send');
			lastWebSocket.readyState = WebSocket.CLOSED;

			service.server.test2();

			assert.notCalled(send);
		});
	});

	describe('(websocket events)', () => {
		beforeEach(() => {
			service.connect();
		});

		describe('websocket.onopen()', () => {
			it('should set isConnected to true', () => {
				lastWebSocket.onopen();

				expect(service.isConnected).true;
			});

			it('should call client.connected', () => {
				const connected = spy();
				service.client.connected = connected;

				lastWebSocket.onopen();

				assert.calledOnce(connected);
			});
		});

		describe('websocket.onclose()', () => {
			it('should set isConnected to false', () => {
				lastWebSocket.onopen();

				lastWebSocket.onclose();

				expect(service.isConnected).false;
			});

			it('should call client.disconnected', () => {
				const disconnected = spy();
				service.client.disconnected = disconnected;
				lastWebSocket.onopen();

				lastWebSocket.onclose();

				assert.calledOnce(disconnected);
			});

			it('should not call client.disconnected if not connected', () => {
				const disconnected = spy();
				service.client.disconnected = disconnected;

				lastWebSocket.onclose();

				assert.notCalled(disconnected);
			});

			it('should reject all pending promises', () => {
				lastWebSocket.onopen();

				const promise = service.server.foo();

				lastWebSocket.onclose();

				return expect(promise).rejectedWith('disconnected');
			});
		});

		describe('websocket.onerror()', () => {
			it('should do nothing', () => {
				lastWebSocket.onopen();

				lastWebSocket.onerror();
			});
		});

		describe('websocket.onmessage()', () => {
			it('should call received mesasge', () => {
				service.client.foo = () => { };
				const foo = stub(service.client, 'foo');
				lastWebSocket.onopen();

				lastWebSocket.onmessage({ data: '[1, 2]' });

				assert.calledWith(foo, 2);
			});

			it('should resolve pending promise', () => {
				lastWebSocket.onopen();

				const promise = service.server.foo();

				lastWebSocket.onmessage({ data: JSON.stringify([MessageType.Resolved, 1, 1, 'ok']) });

				return promise.then(x => expect(x).equal('ok'));
			});

			it('shoudl change progress field', () => {
				lastWebSocket.onopen();

				const promise = service.server.foo();

				expect(service.server.fooInProgress).true;

				lastWebSocket.onmessage({ data: JSON.stringify([MessageType.Resolved, 1, 1, 'ok']) });

				return promise.then(() => expect(service.server.fooInProgress).false);
			});

			it('should reject pending promise', () => {
				lastWebSocket.onopen();

				const promise = service.server.foo();

				lastWebSocket.onmessage({ data: JSON.stringify([MessageType.Rejected, 1, 1, 'fail']) });

				return expect(promise).rejectedWith('fail');
			});

			it('should pass error from packet recv method to error handler', () => {
				lastWebSocket.onopen();
				const error = new Error('test error');
				const handleRecvError = stub(errorHandler, 'handleRecvError');
				stub((service as any).packet, 'recv').throws(error);

				lastWebSocket.onmessage({ data: '[0]' });

				assert.calledWith(handleRecvError, error, '[0]');
			});

			it('should do nothing for resolving non-existing promise', () => {
				lastWebSocket.onopen();

				service.server.foo();

				lastWebSocket.onmessage({ data: JSON.stringify([MessageType.Resolved, 1, 5, 'ok']) });
			});

			it('should do nothing for rejecting non-existing promise', () => {
				lastWebSocket.onopen();

				service.server.foo();

				lastWebSocket.onmessage({ data: JSON.stringify([MessageType.Rejected, 1, 5, 'fail']) });
			});

			it('should resolve promises with correct id', () => {
				lastWebSocket.onopen();

				const promise1 = service.server.foo();
				const promise2 = service.server.foo();

				lastWebSocket.onmessage({ data: JSON.stringify([MessageType.Resolved, 1, 2, 'a']) });
				lastWebSocket.onmessage({ data: JSON.stringify([MessageType.Resolved, 1, 1, 'b']) });

				return Promise.all([promise1, promise2])
					.then(([result1, result2]) => {
						expect(result1).equal('b');
						expect(result2).equal('a');
					});
			});

			it('should throw error if with default error handler', () => {
				service = new ClientSocket<Client, Server>(clientOptions);
				service.connect();
				stub((service as any).packet, 'recv').throws(new Error('test'));
				lastWebSocket.onopen();

				expect(() => lastWebSocket.onmessage({ data: '[1, 2]' })).throw('test');
			});
		});
	});
});
