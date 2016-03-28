import { FuncList } from '../interfaces';
import { PacketWriter } from './packetWriter';
import { PacketReader } from './packetReader';

export const enum MessageType {
	Version = 255,
	Resolved = 254,
	Rejected = 253,
}

export interface IBinaryWriteHandlers<T> {
	[key: string]: (writer: PacketWriter<T>, id: number, args: any[]) => void;
}

export interface IBinaryReadHandlers<T> {
	[key: string]: (reader: PacketReader<T>, result: any[]) => void;
}

export interface IBinaryHandlers<T> {
	write: IBinaryWriteHandlers<T>;
	read: IBinaryReadHandlers<T>;
}

export interface IResultHandler {
	(funcId: number, funcName: string, result: any): void;
}

export class PacketHandler<T> {
	supportsBinary = false;
	private writeHandlers: IBinaryWriteHandlers<T>;
	private readHandlers: IBinaryReadHandlers<T>;
	protected lastWriteBinary = false;
	constructor(private readNames: string[], private remoteNames: string[], private packetWriter: PacketWriter<T>, private packetReader: PacketReader<T>, handlers: IBinaryHandlers<T>) {
		this.writeHandlers = handlers.write;
		this.readHandlers = handlers.read;
	}
	protected write(socket: WebSocket, name: string, id: number, args: any[]) {
		let handler = this.writeHandlers[name];

		if (this.supportsBinary && handler) {
			handler(this.packetWriter, id, args);
			let buffer: any = this.packetWriter.getBuffer();
			socket.send(buffer);
			this.lastWriteBinary = true;
			return (<ArrayBuffer>buffer).byteLength || (<Buffer>buffer).length;
		} else {
			args.unshift(id);
			let data = JSON.stringify(args);
			socket.send(data);
			return data.length;
		}
	}
	protected read(data: string | T) {
		if (typeof data === 'string') {
			return JSON.parse(data);
		} else {
			this.packetReader.setBuffer(data);
			var id = this.packetReader.readUint8();
			var name = this.readNames[id];
			var handler = this.readHandlers[name];
			var result = [id];

			if (!handler)
				throw new Error(`Missing packet handler for: ${name} (${id})`);

			handler(this.packetReader, result);
			return result;
		}
	}
	protected getFuncName(id: number, args: any[]) {
		if (id === MessageType.Version)
			return '*version';
		else if (id === MessageType.Rejected)
			return '*reject:' + this.remoteNames[args.shift()];
		else if (id === MessageType.Resolved)
			return '*resolve:' + this.remoteNames[args.shift()];
		else
			return this.readNames[id];
	}
	send(socket: WebSocket, name: string, id: number, args: any[]): number {
		try {
			return this.write(socket, name, id, args);
		} catch (e) {
			return 0;
		}
	}
	recv(data: string | T, funcList: FuncList, specialFuncList: FuncList, handleResult: IResultHandler): number {
		let args = this.read(data);

		try {
			var funcId = args.shift();
			var funcName = this.getFuncName(funcId, args);
			var funcSpecial = funcName && funcName[0] === '*';
			var funcObj = funcSpecial ? specialFuncList : funcList;
			var func = funcObj[funcName];
		} catch (e) { }

		if (func)
			handleResult(funcId, funcName, func.apply(funcObj, args));

		return (<any>data).length || (<any>data).byteLength;
	}
}
