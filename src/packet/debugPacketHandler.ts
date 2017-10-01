import { FuncList, Logger, Packet } from '../interfaces';
import { PacketWriter } from './packetWriter';
import { PacketReader } from './packetReader';
import { PacketHandler, IFunctionHandler, IBinaryHandlers, defaultHandleFunction, Send } from './packetHandler';

export class DebugPacketHandler<T> extends PacketHandler<T> {
	constructor(
		readNames: string[],
		remoteNames: string[],
		packetWriter: PacketWriter<T>,
		packetReader: PacketReader<T>,
		handlers: IBinaryHandlers<T>,
		onlyBinary: any,
		private ignorePackets: string[],
		private log: Logger
	) {
		super(readNames, remoteNames, packetWriter, packetReader, handlers, onlyBinary);
	}
	sendPacket(send: Send, packet: Packet, supportsBinary: boolean): number {
		const size = this.writePacket(send, packet, supportsBinary);

		if (this.ignorePackets.indexOf(packet.name) === -1) {
			const mode = this.lastWriteBinary ? 'bin' : 'str';
			this.log(`SEND [${size}] (${mode})`, packet.name, packet.args);
		}

		return size;
	}
	recv(data: string | T, funcList: FuncList, specialFuncList: FuncList, handleFunction: IFunctionHandler = defaultHandleFunction): number {
		const args = this.read(data);

		const funcId = args.shift();
		const funcName = this.getFuncName(funcId, args);

		if (!funcName)
			this.log(`invalid message id: ${funcId}`);

		const funcSpecial = funcName && funcName[0] === '*';
		const funcObj = funcSpecial ? specialFuncList : funcList;
		const func = funcObj[funcName];

		const size = (<any>data).length || (<any>data).byteLength;

		if (this.ignorePackets.indexOf(funcName) === -1) {
			const mode = typeof data !== 'string' ? 'bin' : 'str';
			this.log(`RECV [${size}] (${mode})`, funcName, args);
		}

		if (func)
			handleFunction(funcId, funcName, func, funcObj, args);
		else
			this.log(`invalid message: ${funcName}`, args);

		return size;
	}
}
