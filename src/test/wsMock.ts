import { range } from 'lodash';
import * as ws from 'ws';

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
	connectClient(binary = false) {
		const client = new MockWebSocket();
		client.upgradeReq.url = `?bin=${binary}`;
		this.invoke('connection', client);
		return client;
	}
	connectClients(count: number) {
		return range(count).map(() => this.connectClient());
	}
}

export class MockWebSocket extends MockEventEmitter {
	static Server = MockWebSocketServer;
	upgradeReq = { url: '' };
	constructor() {
		super();
	}
	terminate() { }
	send() { }
}

export function getLastServer() {
	return lastServer;
}
