import { ClientOptions, SocketServer, ServerOptions, Logger, MethodDef } from './interfaces';
import { SocketServerClient, ErrorHandler } from './server';
import { IncomingMessage } from 'http';
import { Send, PacketHandler } from './packet/packetHandler';

export interface Token {
	id: string;
	data?: any;
	expire: number;
}

export interface ClientState {
	lastMessageTime: number;
	lastMessageId: number;
	lastSendTime: number;
	sentSize: number;
	token: Token | undefined;
	ping(): void;
	client: SocketServerClient;
	supportsBinary: boolean;
}

export interface ServerInfo {
	writerBufferSize: number;
	freeTokens: number;
	clientsByToken: number;
}

export interface Server {
	clients: ClientState[];
	close(): void;
	options(): ClientOptions;
	token(data?: any): string;
	clearToken(id: string): void;
	clearTokens(test: (id: string, data?: any) => boolean): void;
	info(): ServerInfo;
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
	upgrade(request: any, socket: any): void;
}

export interface GlobalConfig {
	path?: string;
	errorHandler?: ErrorHandler;
	perMessageDeflate?: boolean;
	log?: Logger;
	ws?: any;
	errorCode?: number;
	errorName?: string;
	nativePing?: number;
}

export interface InternalServer {
	// state
	clients: ClientState[];
	freeTokens: Map<string, Token>;
	clientsByToken: Map<string, ClientState>;
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
	handleResult: (send: Send, obj: ClientState, funcId: number, funcName: string, result: Promise<any>, messageId: number) => void;
	packetHandler: PacketHandler;
	server: Server;
}
