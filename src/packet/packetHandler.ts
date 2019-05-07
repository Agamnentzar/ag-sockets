import { FuncList, Packet, PacketHandlerHooks } from '../interfaces';
import { getLength } from '../utils';
import { BinaryWriter, resetWriter, resizeWriter, getWriterBuffer } from './binaryWriter';
import { BinaryReader, createBinaryReader, readUint8 } from './binaryReader';

export interface Send {
	(data: string | Uint8Array): void;
}

export const enum MessageType {
	Version = 255,
	Resolved = 254,
	Rejected = 253,
}

export interface IBinaryWriteHandler {
	(writer: BinaryWriter, args: any[]): void;
}

export interface IBinaryWriteHandlers {
	[key: string]: IBinaryWriteHandler;
}

export interface IBinaryReadHandlers {
	[key: string]: (reader: BinaryReader, result: any[]) => void;
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
		private packetWriter: BinaryWriter,
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
			do {
				try {
					resetWriter(this.packetWriter);
					handler(this.packetWriter, packet.args);
					break;
				} catch (e) {
					if (e instanceof RangeError || /DataView/.test(e.message)) {
						resizeWriter(this.packetWriter);
					} else {
						throw e;
					}
				}
			} while (true);

			packet.binary = getWriterBuffer(this.packetWriter);
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
	protected writePacket(send: Send, packet: Packet, supportsBinary: boolean, hooks: PacketHandlerHooks) {
		const handler = this.writeHandlers[packet.name];

		if (supportsBinary && handler) {
			hooks.writing();
			const data = this.getBinary(packet, handler);
			hooks.sending();
			send(data);
			hooks.done();
			this.lastWriteBinary = true;
			return getLength(data);
		} else {
			hooks.writing();
			const data = this.getJSON(packet);
			hooks.sending();
			send(data);
			hooks.done();
			return data.length;
		}
	}
	protected read(data: string | Uint8Array): any[] {
		if (typeof data === 'string') {
			return JSON.parse(data);
		} else {
			const packetReader = createBinaryReader(data);
			const id = readUint8(packetReader);
			const name = this.readNames[id];
			const handler = this.readHandlers[name];
			const result = [id];

			if (!handler) {
				throw new Error(`Missing packet handler for: ${name} (${id})`);
			}

			handler(packetReader, result);
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
	send(send: Send, name: string, id: number, args: any[], supportsBinary: boolean, hooks: PacketHandlerHooks): number {
		return this.sendPacket(send, { id, name, args: [id, ...args] }, supportsBinary, hooks);
	}
	sendPacket(send: Send, packet: Packet, supportsBinary: boolean, hooks: PacketHandlerHooks): number {
		try {
			const size = this.writePacket(send, packet, supportsBinary, hooks);

			if (this.onSend) {
				this.onSend(packet);
			}

			return size;
		} catch {
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
				binary: binary ? data as any : undefined,
				json: binary ? undefined : data as any,
			});
		}

		return getLength(data);
	}
}
