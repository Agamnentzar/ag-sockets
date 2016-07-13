# ag-sockets

[![Build Status](https://travis-ci.org/Agamnentzar/ag-sockets.svg)](https://travis-ci.org/Agamnentzar/ag-sockets)
[![npm version](https://badge.fury.io/js/ag-sockets.svg)](https://badge.fury.io/js/ag-sockets)

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

const server = http.createServer();
const wsServer = createServer(server, ExampleServer, ExampleClient, client => new Server(client));

// pass 'wsServer.options()' to client side

server.listen(12345, () => console.log('server listening...'));
```

#### Connect client

```typescript
import { ClientSocket } from 'ag-sockets';
import { ExampleClient } from './client';
import { IExampleClient, IExampleServer } from './interfaces';

const options = // get 'wsServer.options()' from server side
const service = new ClientSocket<IExampleClient, IExampleServer>(options);
service.client = new ExampleClient(service.server);
service.connect();
```

### Binary communication

```typescript
export const enum Bin {
	I8,
	U8,
	I16,
	U16,
	I32,
	U32,
	F32,
	F64,
	Bool,
	Str,
	Obj,
}

// examples

class Client {
	@Method({ binary: [Bin.I32, Bin.Str] })
	foo(a: number, b: string) {
	}
	@Method({ binary: [[Bin.I32], [Bin.I32, Bin.I32, Bin.I32]] })
	bar(a: number[], b: [number, number, number][]) {
	}
	@Method({ binary: [[Bin.F32], Bin.Obj] })
	boo(a: number[], b: any) {
	}
}
```

## Development

```bash
gulp build          # build production version of code

gulp dev            # build and start watch tasks
gulp dev --tests    # build and start watch tasks with tests
gulp dev --coverage # build and start watch tasks with tests and code coverage

gulp lint           # typescript lint
```
