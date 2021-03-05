import { SocketClient } from './interfaces';

export interface OriginalRequest {
	headers: any;
	url: string;
}

export interface ClientExtensions {
	id: number;
	tokenId?: string;
	tokenData?: any;
	originalRequest?: OriginalRequest;
	isConnected(): boolean;
	lastMessageTime(): number;
	disconnect(force?: boolean, invalidateToken?: boolean, reason?: string): void;
}

export type SocketServerClient = SocketClient & ClientExtensions;

export interface ErrorHandler {
	handleError(obj: SocketServerClient | null, e: Error): void;
	handleRejection(obj: SocketServerClient, e: Error): Error | void;
	handleRecvError(obj: SocketServerClient, e: Error, message: string | Uint8Array): void;
}
