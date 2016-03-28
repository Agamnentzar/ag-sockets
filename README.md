# ag-sockets

Library for communication via WebSockets

## Installation

```
npm install ag-sockets
```

## Usage

### Set up sockets

#### Common interfaces

```typescript
// interfaces.ts

import { SocketClient, SocketServer } from 'ag-sockets';

export interface IExampleClient extends SocketClient {
  message(name: string, message: string);
}

export interface IExampleServer extends SocketServer {
  connected(): void;
  diconnected(): void;
  broadcast(message: string): void;
  setName(name: string): void;
}
```

#### Client object

```typescript
// client.ts

import { Method } from 'ag-sockets';
import { IExampleClient, IExampleServer } from './interfaces';

export class ExampleClient implements IExampleClient {
  constructor(private server: IExampleServer) {
  }
  connected() {
    this.server.setName('John');
    this.server.broadcast('Hello!');
  }
  @Method()
  message(name: string, message: string) {
    console.log(`${name}: ${message}`);
  }
}
```

#### Server object

```typescript
// server.ts

import { Method, Socket, ClientExtensions } from 'ag-sockets';
import { IExampleClient, IExampleServer } from './interfaces';

const clients: ExampleClient[] = [];

@Socket({ path: '/test' })
export class ExampleServer implements IExampleServer {
  private name: string;
  constructor(private client: IExampleClient & ClientExtensions) {
  }
  connected() {
    clients.push(this.client);
  }
  disconnected() {
    clients.splice(clients.indexOf(this.client), 1);
  }
  @Method() // annotations are optional if all class methods are to be available
  broadcast(message: string) {
    clients.forEach(c => c.message(this.name, message));
  }
  @Method()
  setName(name: string) {
    this.name = name;
  }
}
```

#### Start server

```typescript
import * as http from 'http';
import { createServer } from 'ag-sockets';
import { ExampleClient } from './client';
import { ExampleServer } from './server';

let server = http.createServer();
let wsServer = createServer(server, ExampleServer, ExampleClient, client => new Server(client));

// pass 'wsServer.options' to client side

server.listen(12345, () => console.log('server listening...'));
```

#### Connect client

```typescript
import { ClientSocket } from 'ag-sockets';
import { ExampleClient } from './client';
import { IExampleClient, IExampleServer } from './interfaces';

let options = // get 'wsServer.options' from server side
let service = new ClientSocket<IExampleClient, IExampleServer>(options);
service.client = new ExampleClient(service.server);
service.connect();
```

### Binary communication

```typescript
type BinaryType = 'Int8' | 'Uint8' | 'Int16' | 'Uint16' | 'Int32' | 'Uint32' | 'Float32' | 'Float64' | 'Boolean' | 'String' | 'Object';

// examples

@Method({ binary: ['Int32', 'String'] })
foo(a: number, b: string);

@Method({ binary: [['Int32'], ['Int32', 'Int32', 'Int32']] })
bar(a: number[], b: [number, number, number][]);

@Method({ binary: [['Float32'], 'Object'] })
boo(a: number[], b: any);
```

## Development

```bash
gulp build          # build production version of code

gulp dev            # build and start watch tasks
gulp dev --tests    # build and start watch tasks with tests
gulp dev --coverage # build and start watch tasks with tests and code coverage

gulp lint           # typescript lint
```
