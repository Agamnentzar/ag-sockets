import { FuncList, Packet } from '../interfaces';
import { getLength } from '../utils';
import { PacketWriter, PacketReader } from './packetCommon';

export interface Send {
	(data: string | ArrayBuffer): void;
}

export const enum MessageType {
	Version = 255,
	Resolved = 254,
	Rejected = 253,
}

export interface IBinaryWriteHandler {
	(writer: PacketWriter, args: any[]): void;
}

export interface IBinaryWriteHandlers {
	[key: string]: IBinaryWriteHandler;
}

export interface IBinaryReadHandlers {
	[key: string]: (reader: PacketReader, result: any[]) => void;
}

export interface IBinaryHandlers {
	write: IBinaryWriteHandlers;
	read: IBinaryReadHandlers;
}

export interface IFunctionHandler {
	(funcId: number, funcName: string, func: Function, funcObj: any, args: any[]): void;
}

export const defaultHandleFunction: IFunctionHandler =
	(_funcId, _funcName, func, funcObj, args) => func.apply(funcObj, args);

export class PacketHandler {
	private writeHandlers: IBinaryWriteHandlers;
	private readHandlers: IBinaryReadHandlers;
	protected lastWriteBinary = false;
	constructor(
		private readNames: string[],
		private remoteNames: string[],
		private packetWriter: PacketWriter,
		private packetReader: PacketReader,
		handlers: IBinaryHandlers,
		private onlyBinary: any,
		private onSend?: (packet: Packet) => void,
		private onRecv?: (packet: Packet) => void,
	) {
		this.writeHandlers = handlers.write;
		this.readHandlers = handlers.read;
	}
	private getBinary(packet: Packet, handler: IBinaryWriteHandler) {
		if (!packet.binary) {
			handler(this.packetWriter, packet.args);
			packet.binary = this.packetWriter.getBuffer();
		}

		return packet.binary;
	}
	private getJSON(packet: Packet) {
		if (this.onlyBinary[packet.name]) {
			throw new Error(`Packet "${packet.name}" supports only binary protocol`);
		}

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
	protected read(data: string | Uint8Array): any[] {
		if (typeof data === 'string') {
			return JSON.parse(data);
		} else {
			this.packetReader.setBuffer(data);
			const id = this.packetReader.readUint8();
			const name = this.readNames[id];
			const handler = this.readHandlers[name];
			const result = [id];

			if (!handler) {
				throw new Error(`Missing packet handler for: ${name} (${id})`);
			}

			handler(this.packetReader, result);
			this.packetReader.done();
			return result;
		}
	}
	protected getFuncName(id: any, args: any[]) {
		if (id === MessageType.Version) {
			return '*version';
		} else if (id === MessageType.Rejected) {
			return '*reject:' + this.remoteNames[args.shift()];
		} else if (id === MessageType.Resolved) {
			return '*resolve:' + this.remoteNames[args.shift()];
		} else {
			return this.readNames[id];
		}
	}
	send(send: Send, name: string, id: number, args: any[], supportsBinary: boolean): number {
		return this.sendPacket(send, { id, name, args: [id, ...args] }, supportsBinary);
	}
	sendPacket(send: Send, packet: Packet, supportsBinary: boolean): number {
		try {
			const size = this.writePacket(send, packet, supportsBinary);

			if (this.onSend) {
				this.onSend(packet);
			}

			return size;
		} catch (e) {
			return 0;
		}
	}
	recv(
		data: string | Uint8Array, funcList: FuncList, specialFuncList: FuncList,
		handleFunction: IFunctionHandler = defaultHandleFunction
	): number {
		const args = this.read(data);
		const funcId = args.shift();
		const funcName = this.getFuncName(funcId, args);
		const funcSpecial = funcName && funcName.charAt(0) === '*';
		const funcObj = funcSpecial ? specialFuncList : funcList;
		const func = funcObj[funcName];

		if (func) {
			handleFunction(funcId, funcName, func, funcObj, args);
		}

		if (this.onRecv) {
			const binary = typeof data !== 'string';
			this.onRecv({
				id: funcId,
				name: funcName,
				args,
				binary: binary ? data : undefined,
				json: binary ? undefined : data as any,
			});
		}

		return getLength(data);
	}
}
