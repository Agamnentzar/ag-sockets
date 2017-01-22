import { FuncList } from '../interfaces';
import { getLength } from '../utils';
import { PacketWriter } from './packetWriter';
import { PacketReader } from './packetReader';

export interface Send {
	(data: any): void;
}

export interface Packet {
	id: number;
	name: string;
	args: any[];
	binary?: any;
	json?: string;
}

export const enum MessageType {
	Version = 255,
	Resolved = 254,
	Rejected = 253,
}

export interface IBinaryWriteHandler<T> {
	(writer: PacketWriter<T>, args: any[]): void;
}

export interface IBinaryWriteHandlers<T> {
	[key: string]: IBinaryWriteHandler<T>;
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
	private getBinary(packet: Packet, handler: IBinaryWriteHandler<T>) {
		if (!packet.binary) {
			handler(this.packetWriter, packet.args);
			packet.binary = this.packetWriter.getBuffer();
		}

		return packet.binary;
	}
	private getJSON(packet: Packet) {
		if (!packet.json) {
			packet.json = JSON.stringify(packet.args);
		}

		return packet.json;
	}
	protected writePacket(send: Send, packet: Packet, supportsBinary: boolean) {
		const handler = this.writeHandlers[packet.name];

		if (supportsBinary && handler) {
			const data = this.getBinary(packet, handler);
			send(data);
			this.lastWriteBinary = true;
			return getLength(data);
		} else {
			const data = this.getJSON(packet);
			send(data);
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
	send(send: Send, name: string, id: number, args: any[], supportsBinary: boolean): number {
		return this.sendPacket(send, { id, name, args: [id, ...args] }, supportsBinary);
	}
	sendPacket(send: Send, packet: Packet, supportsBinary: boolean): number {
		try {
			return this.writePacket(send, packet, supportsBinary);
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

		return getLength(data);
	}
}
