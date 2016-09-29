import { ServerRequest } from 'http';
import { SocketClient } from './interfaces';

export interface ClientExtensions {
	id: number;
	isConnected: boolean;
	tokenId?: string;
	originalRequest: ServerRequest;
	disconnect(force?: boolean, invalidateToken?: boolean): void;
}

export type SocketServerClient = SocketClient & ClientExtensions;

export interface ErrorHandler {
	handleError(obj: SocketServerClient | null, e: Error): void;
	handleRejection(obj: SocketServerClient, e: Error): void;
	handleRecvError(obj: SocketServerClient, e: Error, message: string | Buffer): void;
}
