import { range } from 'lodash';
import * as ws from 'ws';
import { queryString } from '../utils';

let lastServer: MockWebSocketServer;

export class MockEventEmitter {
	private handlers: { event: string; handler: Function; }[] = [];
	on(event: string, handler: Function) {
		this.handlers.push({ event, handler });
		return this;
	}
	invoke(event: string, ...args: any[]) {
		this.handlers.filter(x => x.event === event).forEach(x => x.handler(...args));
	}
}

export class MockWebSocketServer extends MockEventEmitter {
	constructor(public options: ws.IServerOptions) {
		super();
		lastServer = this;
	}
	close() { }
	// mock helpers
	connectClient(bin = false, t?: string) {
		const client = new MockWebSocket();
		client.upgradeReq.url = `ws://test/${queryString({ bin, t })}`;
		this.invoke('connection', client);
		return client;
	}
	connectWebSocket(socket: MockWebSocket) {
		this.invoke('connection', socket);
		return socket;
	}
	connectClients(count: number) {
		return range(count).map(() => this.connectClient());
	}
}

export class MockWebSocket extends MockEventEmitter {
	static Server = MockWebSocketServer;
	upgradeReq = { url: '', headers: { foo: 'bar' } };
	constructor() {
		super();
	}
	terminate() { }
	send() { }
}

export function getLastServer() {
	return lastServer;
}
