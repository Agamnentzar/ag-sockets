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

export interface IFunctionHandler {
	(funcId: number, funcName: string, func: Function, funcObj: any, args: any[]): void;
}

export const defaultHandleFunction: IFunctionHandler = (_funcId, _funcName, func, funcObj, args) => func.apply(funcObj, args);

export class PacketHandler<T> {
	private writeHandlers: IBinaryWriteHandlers<T>;
	private readHandlers: IBinaryReadHandlers<T>;
	protected lastWriteBinary = false;
	constructor(private readNames: string[], private remoteNames: string[], private packetWriter: PacketWriter<T>, private packetReader: PacketReader<T>, handlers: IBinaryHandlers<T>) {
		this.writeHandlers = handlers.write;
		this.readHandlers = handlers.read;
	}
	protected write(socket: WebSocket, name: string, id: number, args: any[], supportsBinary: boolean) {
		const handler = this.writeHandlers[name];

		if (supportsBinary && handler) {
			handler(this.packetWriter, id, args);
			const buffer: any = this.packetWriter.getBuffer();
			socket.send(buffer);
			this.lastWriteBinary = true;
			return (<ArrayBuffer>buffer).byteLength || (<Buffer>buffer).length || 0;
		} else {
			args.unshift(id);
			const data = JSON.stringify(args);
			socket.send(data);
			return data.length;
		}
	}
	protected read(data: string | T): any[] {
		if (typeof data === 'string') {
			return JSON.parse(data);
		} else {
			this.packetReader.setBuffer(data);
			const id = this.packetReader.readUint8();
			const name = this.readNames[id];
			const handler = this.readHandlers[name];
			const result = [id];

			if (!handler)
				throw new Error(`Missing packet handler for: ${name} (${id})`);

			handler(this.packetReader, result);
			return result;
		}
	}
	protected getFuncName(id: any, args: any[]) {
		if (id === MessageType.Version)
			return '*version';
		else if (id === MessageType.Rejected)
			return '*reject:' + this.remoteNames[args.shift()];
		else if (id === MessageType.Resolved)
			return '*resolve:' + this.remoteNames[args.shift()];
		else
			return this.readNames[id];
	}
	send(socket: WebSocket, name: string, id: number, args: any[], supportsBinary: boolean): number {
		try {
			return this.write(socket, name, id, args, supportsBinary);
		} catch (e) {
			return 0;
		}
	}
	recv(data: string | T, funcList: FuncList, specialFuncList: FuncList, handleFunction: IFunctionHandler = defaultHandleFunction): number {
		const args = this.read(data);
		const funcId = args.shift();
		const funcName = this.getFuncName(funcId, args);
		const funcSpecial = funcName && funcName.charAt(0) === '*';
		const funcObj = funcSpecial ? specialFuncList : funcList;
		const func = funcObj[funcName];

		if (func) {
			handleFunction(funcId, funcName, func, funcObj, args);
		}

		return (<any>data).length || (<any>data).byteLength || 0;
	}
}
