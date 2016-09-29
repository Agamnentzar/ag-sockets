import { Method, ClientSocket } from '../browser';

interface DemoServer {
	name(text: string): void;
	message(text: string): void;
}

export class DemoClient {
	name: string;
	@Method()
	message(_user: string, _text: string) {
	}
}

if (typeof window !== 'undefined') {
	let lastName: string | null = null;
	const config = (window as any).config;
	const service = new ClientSocket<DemoClient, DemoServer>(config);
	service.client.message = function (name, text) {
		document.getElementById('messages')!.innerHTML += `[${name}] ${text}\n`;
	};
	service.connect();

	document.getElementById('send')!.addEventListener('click', function () {
		const name = document.getElementById('name') as HTMLInputElement;
		const msg = document.getElementById('message') as HTMLInputElement;
		const status = document.getElementById('status') as HTMLSpanElement;

		if (name.value !== lastName) {
			service.server.name(name.value);
			lastName = name.value;
		}

		status.innerHTML = service.server.message(msg.value) ? 'sent' : 'not sent';
	});
}
