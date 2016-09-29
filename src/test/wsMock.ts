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
	constructor(public options: ws.IServerOptions & { verifyClient: Function; }) { // TODO: remove after typings are updated
		super();
		lastServer = this;
	}
	close() { }
	// mock helpers
	connectClient() {
		const client = new MockWebSocket();
		this.invoke('connection', client);
		return client;
	}
}

export class MockWebSocket extends MockEventEmitter {
	static Server = MockWebSocketServer;
	upgradeReq = { url: '' };
	constructor() {
		super();
	}
	terminate() { }
}

export function getLastServer() {
	return lastServer;
}
