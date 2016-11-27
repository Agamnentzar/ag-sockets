import { FuncList, Logger } from '../interfaces';
import { PacketWriter } from './packetWriter';
import { PacketReader } from './packetReader';
import { PacketHandler, IFunctionHandler, IBinaryHandlers, defaultHandleFunction } from './packetHandler';

export class DebugPacketHandler<T> extends PacketHandler<T> {
	constructor(readNames: string[], remoteNames: string[], packetWriter: PacketWriter<T>, packetReader: PacketReader<T>,
		handlers: IBinaryHandlers<T>, private ignorePackets: string[], private log: Logger) {
		super(readNames, remoteNames, packetWriter, packetReader, handlers);
	}
	send(socket: WebSocket, name: string, id: number, args: any[], supportsBinary: boolean): number {
		const size = this.write(socket, name, id, args, supportsBinary);

		if (this.ignorePackets.indexOf(name) === -1) {
			const mode = this.lastWriteBinary ? 'bin' : 'str';
			this.log(`SEND [${size}] (${mode})`, name, args);
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
