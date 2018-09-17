import * as ws from 'ws';
import { stub } from 'sinon';
import { queryString } from '../utils';
import { delay } from './common';

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
	constructor(public options: ws.ServerOptions) {
		super();
		lastServer = this;
	}
	close() { }
	// mock helpers
	async connectClient(bin = false, t?: string) {
		const client = new MockWebSocket();
		client.upgradeReq.url = `ws://test/${queryString({ bin, t })}`;
		this.invoke('connection', client);
		await delay(1);
		return client;
	}
	async connectWebSocket(socket: MockWebSocket) {
		this.invoke('connection', socket);
		return socket;
	}
	async connectClients(count: number) {
		const result: MockWebSocket[] = [];

		for (let i = 0; i < count; i++) {
			result.push(await this.connectClient());
		}

		return result;
	}
}

export class MockWebSocket extends MockEventEmitter {
	static Server = MockWebSocketServer;
	upgradeReq = { url: '', headers: { foo: 'bar' } };
	constructor() {
		super();
	}
	terminate() { }
	close = stub() as any;
	send() { }
}

export function getLastServer() {
	return lastServer;
}
