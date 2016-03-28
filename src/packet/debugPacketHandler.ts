import { FuncList, Logger } from '../interfaces';
import { PacketWriter } from './packetWriter';
import { PacketReader } from './packetReader';
import { PacketHandler, IResultHandler, IBinaryHandlers } from './packetHandler';

export class DebugPacketHandler<T> extends PacketHandler<T> {
	constructor(readNames: string[], remoteNames: string[], packetWriter: PacketWriter<T>, packetReader: PacketReader<T>,
		handlers: IBinaryHandlers<T>, private ignorePackets: string[], private log: Logger) {
		super(readNames, remoteNames, packetWriter, packetReader, handlers);
	}
	send(socket: WebSocket, name: string, id: number, args: any[]): number {
		var size = this.write(socket, name, id, args);

		if (this.ignorePackets.indexOf(name) === -1) {
			var mode = this.lastWriteBinary ? 'bin' : 'str';
			this.log(`SEND [${size}] (${mode})`, name, args);
		}

		return size;
	}
	recv(data: string | T, funcList: FuncList, specialFuncList: FuncList, handleResult: IResultHandler): number {
		var args = this.read(data);

		var funcId = args.shift();
		var funcName = this.getFuncName(funcId, args);

		if (!funcName)
			this.log(`invalid message id: ${funcId}`);

		var funcSpecial = funcName && funcName[0] === '*';
		var funcObj = funcSpecial ? specialFuncList : funcList;
		var func = funcObj[funcName];

		var size = (<any>data).length || (<any>data).byteLength;

		if (this.ignorePackets.indexOf(funcName) === -1) {
			var mode = typeof data !== 'string' ? 'bin' : 'str';
			this.log(`RECV [${size}] (${mode})`, funcName, args);
		}

		if (func)
			handleResult(funcId, funcName, func.apply(funcObj, args));
		else
			this.log(`invalid message: ${funcName}`, args);

		return size;
	}
}
