import { ClientOptions, SocketServer, Logger, MethodDef, CommonOptions, OnSend, OnRecv, RateLimitDef } from './interfaces';
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
	rateLimits: (RateLimitDef | undefined)[];
	verifyClient: (req: IncomingMessage) => boolean;
	createClient?: (client: SocketServerClient, send: (data: string | Uint8Array | Buffer) => void) => SocketServerClient;
	// methods
	createServer: CreateServerMethod;
	handleResult: (send: Send, obj: ClientState, funcId: number, funcName: string, result: Promise<any>, messageId: number) => void;
	packetHandler: PacketHandler;
	server: Server;
}

export interface ServerOptions extends CommonOptions {
	/** time after after last message from client when server assumes client is not responding (in milliseconds) */
	connectionTimeout?: number;
	/** limit connections to one per generated token */
	connectionTokens?: boolean;
	/** lifetime of connection token */
	tokenLifetime?: number;
	/** maximum number of connected clients */
	clientLimit?: number;
	/** per message deflate compression switch */
	perMessageDeflate?: boolean;
	/** transfer limit (bytes per second) */
	transferLimit?: number;
	/** custom client verification method */
	verifyClient?: (req: IncomingMessage) => boolean;
	/** allows to modify client object */
	createClient?: (client: SocketServerClient) => SocketServerClient;
	/** ws library or alternative */
	ws?: any;
	/** use ArrayBuffer instead of Buffer on server side */
	arrayBuffer?: boolean;
	/** only allow binary packets and binary connections */
	forceBinary?: boolean;
	/** only allow binary encoding for packets with binary option */
	forceBinaryPackets?: boolean;
	/** keep original request info in client.originalRequest field */
	keepOriginalRequest?: boolean;
	/** prints to console generated packet handler code */
	printGeneratedCode?: boolean;
	/** send/recv handlers */
	onSend?: OnSend;
	onRecv?: OnRecv;
	client?: MethodDef[];
	server?: MethodDef[];
}
