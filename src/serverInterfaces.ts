import { Packet, ClientOptions, SocketServer, ServerOptions, Logger, MethodDef, PacketHandlerHooks } from './interfaces';
import { SocketServerClient, ErrorHandler } from './server';
import { IncomingMessage } from 'http';
import { Send, PacketHandler } from './packet/packetHandler';

export interface Token {
	id: string;
	data?: any;
	expire: number;
}

export interface ServerHooks extends PacketHandlerHooks {
	sendPacket(packet: Packet): void;
	executeForClients(clients: any[], action: (client: any) => any): void;
}

export interface ClientInternal {
	__internalHooks: ServerHooks;
}

export interface ClientState {
	lastMessageTime: number;
	lastMessageId: number;
	token: Token | undefined;
	ping(): void;
	client: SocketServerClient & ClientInternal;
	supportsBinary: boolean;
}

export interface Server {
	clients: ClientState[];
	close(): void;
	options(): ClientOptions;
	token(data?: any): string;
	clearTokens(test: (id: string, data?: any) => boolean): void;
}

export type CreateServer<TServer, TClient> = (client: TClient & SocketServerClient) => (TServer | Promise<TServer>);
export type CreateServerMethod = (client: any) => (SocketServer | Promise<SocketServer>);

export interface ServerHost {
	close(): void;
	socket<TServer, TClient>(
		serverType: new (...args: any[]) => TServer,
		clientType: new (...args: any[]) => TClient,
		createServer: CreateServer<TServer, TClient>,
		options?: ServerOptions,
	): Server;
	socketRaw(createServer: CreateServerMethod, options: ServerOptions): Server;
}

export interface GlobalConfig {
	path?: string;
	errorHandler?: ErrorHandler;
	perMessageDeflate?: boolean;
	log?: Logger;
	ws?: any;
	errorCode?: number;
	errorName?: string;
}

export interface InternalServer {
	// state
	clients: ClientState[];
	tokens: Token[];
	currentClientId: number;
	pingInterval: any;
	tokenInterval: any;
	totalSent: number;
	totalReceived: number;
	// options
	id: string;
	path: string;
	hash: number;
	debug: boolean;
	forceBinary: boolean;
	connectionTokens: boolean;
	keepOriginalRequest: boolean;
	tokenLifetime: number;
	clientLimit: number;
	transferLimit: number;
	serverMethods: MethodDef[];
	clientMethods: string[];
	verifyClient: (req: IncomingMessage) => boolean;
	// methods
	createServer: CreateServerMethod;
	executeForClients: (clients: ClientInternal[], action: (client: any) => any) => void;
	handleResult: (send: Send, obj: ClientState, funcId: number, funcName: string, result: Promise<any>, messageId: number) => void;
	packetHandler: PacketHandler;
	server: Server;
}
