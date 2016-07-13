import * as express from 'express';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { createServer, Method, Socket, SocketServer } from '../index';
import { DemoClient } from './demoClient';

const clients: DemoClient[] = [];

@Socket({
	path: '/ws',
	debug: false,
	connectionTokens: true,
	//transferLimit: 100,
})
class DemoServer {
	constructor(private client: DemoClient) {
	}
	connected() {
		console.log('connected');
		clients.push(this.client);
	}
	disconnected() {
		clients.splice(clients.indexOf(this.client), 1);
	}
	@Method()
	name(text: string) {
		console.log('name', text);
		this.client.name = text;
	}
	@Method({ rateLimit: 500 })
	message(text: string) {
		console.log('message', text);
		clients.forEach(c => c.message(this.client.name, text));
	}
}

const app = express();
app.set('port', 8071);

const server = http.createServer(app);
const socket = createServer(server, DemoServer, DemoClient, client => new DemoServer(client), {}, {
	handleError: console.log,
	handleRejection: console.log,
	handleRecvError: console.log,
});

app.get('/demo.js', (req, res) => res.sendFile(path.join(__dirname, 'demo.js')));
app.get('/', (req, res) => {
	const html = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'demo', 'demo.html'), 'utf8');
	res.send(html.replace(/CONFIG/, JSON.stringify(socket.options())));
});

server.listen(app.get('port'), () => console.log('Listening on ' + app.get('port')));
