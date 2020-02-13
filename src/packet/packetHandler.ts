import { FuncList, Packet, Logger, getBinary, getNames, getIgnore, MethodDef, OnSendRecv, Bin, RemoteOptions } from '../interfaces';
import { getLength, checkRateLimit, RateLimits } from '../utils';
import { BinaryWriter, resetWriter, resizeWriter, getWriterBuffer, createBinaryWriter } from './binaryWriter';
import { BinaryReader, createBinaryReader, readUint8 } from './binaryReader';
import { createHandlers, binaryNames, readerMethods, writerMethods } from './binaryHandler';
import { getBinaryOnlyPackets, isBinaryOnlyPacket } from '../serverUtils';

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

export interface RemoteState {
	supportsBinary: boolean;
}

export type HandleResult = (funcId: number, funcName: string, result: Promise<any>, messageId: number) => void;

export interface HandlerOptions {
	forceBinary?: boolean;
	useBuffer?: boolean;
	debug?: boolean;
	development?: boolean;
	onSend?: OnSendRecv;
	onRecv?: OnSendRecv;
}

type CreateRemoteHandler = (
	remote: any, send: Send, writer: BinaryWriter, state: RemoteState, options: RemoteOptions, writerMethods: any
) => any;

type LocalHandler = (
	actions: any, reader: BinaryReader, rates: RateLimits, messageId: number, handleResult: HandleResult
) => void;

export interface PacketHandler {
	send(send: Send, name: string, id: number, args: any[], supportsBinary: boolean): number;
	recv(data: string | Uint8Array, funcList: FuncList, specialFuncList: FuncList, handleFunction?: IFunctionHandler): void;
	recvBinary(actions: any, reader: BinaryReader, rates: RateLimits, messageId: number, handleResult: HandleResult): void;
	createRemote(remote: any, send: Send, state: RemoteState): void;
}

export class ReleasePacketHandler implements PacketHandler {
	private writeHandlers: IBinaryWriteHandlers;
	private readHandlers: IBinaryReadHandlers;
	protected lastWriteBinary = false;
	protected remoteOptions: RemoteOptions;
	constructor(
		private localHandler: LocalHandler,
		private createRemoteHandler: CreateRemoteHandler,
		private localNames: string[],
		private remoteNames: string[],
		private packetWriter: BinaryWriter,
		handlers: IBinaryHandlers,
		private onlyBinary: any,
		private onSend?: OnSendRecv,
		private onRecv?: OnSendRecv,
		private development = false,
	) {
		this.writeHandlers = handlers.write;
		this.readHandlers = handlers.read;
		this.remoteOptions = { onSend, onRecv };
	}
	protected writePacket(send: Send, packet: Packet, supportsBinary: boolean) {
		const handler = this.writeHandlers[packet.name];

		if (supportsBinary && handler) {
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

			const data = packet.binary;
			send(data);
			this.lastWriteBinary = true;
			return getLength(data);
		} else {
			if (this.onlyBinary[packet.name]) {
				throw new Error(`Packet "${packet.name}" supports only binary protocol`);
			}

			if (!packet.json) {
				packet.json = JSON.stringify(packet.args);
			}

			const data = packet.json;
			send(data);
			return data.length;
		}
	}
	send(send: Send, name: string, id: number, args: any[], supportsBinary: boolean): number {
		try {
			const packet: Packet = { id, name, args: [id, ...args] };
			const size = this.writePacket(send, packet, supportsBinary);
			this.onSend?.(packet.id, packet.name, size, !!packet.binary);
			return size;
		} catch (e) {
			if (this.development) {
				console.error(e);
			}
			return 0;
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
			return this.localNames[id];
		}
	}
	protected read(data: string | Uint8Array): any[] {
		if (typeof data === 'string') {
			return JSON.parse(data);
		} else {
			const packetReader = createBinaryReader(data);
			const id = readUint8(packetReader);
			const name = this.localNames[id];
			const handler = this.readHandlers[name];
			const result = [id];

			if (!handler) throw new Error(`Missing packet handler for: ${name} (${id})`);

			handler(packetReader, result);
			return result;
		}
	}
	recv(
		data: string | Uint8Array, funcList: FuncList, specialFuncList: FuncList,
		handleFunction: IFunctionHandler = defaultHandleFunction
	) {
		const args = this.read(data);
		const funcId = args.shift();
		const funcName = this.getFuncName(funcId, args);
		const funcSpecial = funcName && funcName.charAt(0) === '*';
		const funcObj = funcSpecial ? specialFuncList : funcList;
		const func = funcObj[funcName];

		if (func) handleFunction(funcId, funcName, func, funcObj, args);

		this.onRecv?.(funcId, funcName, data.length, typeof data !== 'string');
	}
	createRemote(remote: any, send: Send, state: RemoteState) {
		this.createRemoteHandler(remote, send, this.packetWriter, state, this.remoteOptions, writerMethods);
	}
	recvBinary(actions: any, reader: BinaryReader, rates: RateLimits, messageId: number, handleResult: HandleResult) {
		this.localHandler(actions, reader, rates, messageId, handleResult);
	}
}

export class DebugPacketHandler extends ReleasePacketHandler {
	constructor(
		localHandler: LocalHandler,
		createRemoteHandler: CreateRemoteHandler,
		readNames: string[],
		remoteNames: string[],
		packetWriter: BinaryWriter,
		handlers: IBinaryHandlers,
		onlyBinary: any,
		private ignorePackets: string[],
		private log: Logger,
		development = false
	) {
		super(localHandler, createRemoteHandler, readNames, remoteNames, packetWriter, handlers, onlyBinary,
			undefined, undefined, development);
		this.remoteOptions.log = log;
	}
	send(send: Send, name: string, id: number, args: any[], supportsBinary: boolean): number {
		const packet: Packet = { id, name, args: [id, ...args] };
		const size = this.writePacket(send, packet, supportsBinary);

		if (this.ignorePackets.indexOf(packet.name) === -1) {
			const mode = this.lastWriteBinary ? 'bin' : 'str';
			this.log(`SEND [${size}] (${mode})`, packet.name, packet.args);
		}

		return size;
	}
	recv(
		data: string | Uint8Array, funcList: FuncList, specialFuncList: FuncList,
		handleFunction: IFunctionHandler = defaultHandleFunction
	) {
		const args = this.read(data);
		const funcId = args.shift();
		const funcName = this.getFuncName(funcId, args);

		if (!funcName) this.log(`invalid message id: ${funcId}`);

		const funcSpecial = funcName && funcName[0] === '*';
		const funcObj = funcSpecial ? specialFuncList : funcList;
		const func = funcObj[funcName];

		if (this.ignorePackets.indexOf(funcName) === -1) {
			const size = getLength(data);
			const mode = typeof data !== 'string' ? 'bin' : 'str';
			this.log(`RECV [${size}] (${mode})`, funcName, args);
		}

		if (func) {
			handleFunction(funcId, funcName, func, funcObj, args);
		} else {
			this.log(`invalid message: ${funcName}`, args);
		}
	}
}

export function createPacketHandler(
	local: MethodDef[] | undefined, remote: MethodDef[] | undefined, options: HandlerOptions, log: Logger
): PacketHandler {
	if (!local || !remote) throw new Error('Missing server or client method definitions');
	if (local.length > 250 || remote.length > 250) throw new Error('Too many methods');

	const writer = createBinaryWriter();
	const onlyBinary = getBinaryOnlyPackets(remote);
	const handlers = createHandlers(getBinary(remote), getBinary(local));
	const remoteMethods = getNames(remote);
	const localMethods = getNames(local);
	const ignore = [...getIgnore(remote), ...getIgnore(local)];
	const localHandler = generateLocalHandlerCode(local, options, readerMethods, checkRateLimit);
	const createRemoteHandler = generateRemoteHandlerCode(remote, options);

	if (options.debug) {
		return new DebugPacketHandler(
			localHandler, createRemoteHandler, localMethods, remoteMethods, writer,
			handlers, onlyBinary, ignore, log);
	} else {
		return new ReleasePacketHandler(
			localHandler, createRemoteHandler, localMethods, remoteMethods, writer,
			handlers, onlyBinary, options.onSend, options.onRecv);
	}
}

function generateLocalHandlerCode(
	local: MethodDef[], { debug }: HandlerOptions, readerMethods: any, checkRateLimit: any
): LocalHandler {
	let code = ``;
	code += `${Object.keys(readerMethods).map(key => `  var ${key} = methods.${key};`).join('\n')}\n\n`;
	code += `  return function (actions, reader, rates, messageId, handleResult) {\n`;
	code += `    var packetId = readUint8(reader);\n`;
	code += `    switch (packetId) {\n`;

	let packetId = 0;

	for (const method of local) {
		const name = typeof method === 'string' ? method : method[0];
		const options = typeof method === 'string' ? {} : method[1];
		const args = [];

		code += `      case ${packetId}: {\n`;

		if (options.binary) {
			if (options.rateLimit || options.serverRateLimit) {
				code += `        if (!checkRateLimit(${packetId}, rates)) `;

				if (options.promise) {
					code += `handleResult(${packetId}, '${name}', Promise.reject(new Error('Rate limit exceeded')), messageId);\n`;
				} else {
					code += `throw new Error('Rate limit exceeded (${name})');\n`;
				}
			}

			code += createReadFunction(options.binary, '        ');

			for (let i = 0; i < options.binary.length; i++) args.push(i);

			if (debug) {
				code += `        console.log('RECV [' + reader.view.byteLength + '] (bin)', '${name}', [${args.map(i => `a${i}`).join(', ')}]);\n`;
			}

			const actionsCall = `actions.${name}(${args.map(i => `a${i}`).join(', ')})`;

			if (options.promise) {
				code += `        var result = ${actionsCall};\n`;
				code += `        handleResult(${packetId}, '${name}', result, messageId);\n`;
			} else {
				code += `        ${actionsCall};\n`;
			}

			code += `        break;\n`;
		} else {
			code += `        throw new Error('Missing binary decoder for ${name}');\n`;
		}

		code += `      }\n`;

		packetId++;
	}

	// TODO: handle binary version/reject/resolved (only needed for client-side)
	// code += `      case ${MessageType.Version}:\n`;
	// code += `        special.version();\n`;
	// code += `        break;\n`;
	// code += `      case ${MessageType.Rejected}:\n`;
	// code += `        break;\n`;
	// code += `      case ${MessageType.Resolved}:\n`;
	// code += `        break;\n`;

	code += `    };\n`;
	code += `  };\n`;

	// console.log(`\n\nfunction createMethods(methods, checkRateLimit) {\n${code}}\n`);
	return new Function('methods', 'checkRateLimit', code)(readerMethods, checkRateLimit) as any;

}

function generateRemoteHandlerCode(methods: MethodDef[], handlerOptions: HandlerOptions): CreateRemoteHandler {
	let code = ``;
	code += `${Object.keys(writerMethods).map(key => `  var ${key} = methods.${key};`).join('\n')}\n`;
	code += `  var log = remoteOptions.log || function () {};\n`;
	code += `  var onSend = remoteOptions.onSend || function () {};\n`;
	code += `  var onRecv = remoteOptions.onRecv || function () {};\n\n`;

	let packetId = 0;
	const bufferCtor = handlerOptions.useBuffer ? 'Buffer.from' : 'new Uint8Array';
	const bufferLength = handlerOptions.useBuffer ? 'length' : 'byteLength';

	for (const method of methods) {
		const name = typeof method === 'string' ? method : method[0];
		const options = typeof method === 'string' ? {} : method[1];
		let args = [];

		if (options.binary) {
			args.push(...options.binary.map((_, i) => 'a' + i));
		}

		code += `  remote.${name} = function (${args.join(', ')}) {\n`;

		if (!handlerOptions.debug) {
			code += `    try {\n`;
		}

		const indent = options.binary ? `      ` : `    `;

		if (options.binary) {
			code += `${indent}if (remoteState.supportsBinary) {\n`;
			code += `${indent}  while (true) {\n`;
			code += `${indent}    try {\n`;
			code += `${indent}      writer.offset = 0;\n`;
			code += createWriteFunction(packetId, options.binary, `${indent}      `);
			code += `${indent}      var buffer = ${bufferCtor}(writer.bytes.buffer, writer.bytes.byteOffset, writer.offset);\n`;
			code += `${indent}      send(buffer);\n`;
			// code += `${indent}      state.sentSize += buffer.${bufferLength};\n`;
			code += `${indent}      onSend(${packetId}, '${name}', buffer.${bufferLength}, true);\n`;

			if (handlerOptions.debug && !options.ignore) {
				code += `${indent}      log('SEND [' + buffer.${bufferLength} + '] (bin) "${name}"', arguments);\n`;
			}

			code += `${indent}      break;\n`;
			code += `${indent}    } catch (e) {\n`;
			code += `${indent}      if (e instanceof RangeError || /DataView/.test(e.message)) {\n`;
			code += `${indent}        resizeWriter(writer);\n`;
			code += `${indent}      } else {\n`;

			if (handlerOptions.debug) {
				code += `${indent}        throw e;\n`;
			} else {
				if (handlerOptions.development) {
					code += `${indent}        console.error(e);\n`;
				}
				code += `${indent}        return false;\n`;
			}

			code += `${indent}      }\n`;
			code += `${indent}    }\n`;
			code += `${indent}  }\n`;
			code += `${indent}} else {\n`;
		}

		if (handlerOptions.forceBinary || isBinaryOnlyPacket(method)) {
			code += `${indent}  console.error('Only binary protocol supported');\n`;
			code += `${indent}  return false;\n`;
		} else {
			code += `${indent}  var args = [${packetId}];\n`;
			code += `${indent}  for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);\n`;
			code += `${indent}  var json = JSON.stringify(args);\n`;
			code += `${indent}  send(json);\n`;
			// code += `${indent}  state.sentSize += json.length;\n`;
			code += `${indent}  onSend(${packetId}, '${name}', json.length, false);\n`;

			if (handlerOptions.debug && !options.ignore) {
				code += `${indent}  log('SEND [' + json.length + '] (json) "${name}"', arguments);\n`;
			}
		}

		if (options.binary) {
			code += `${indent}}\n`;
		}

		if (!handlerOptions.debug) {
			code += `    } catch (e) {\n`;

			if (handlerOptions.development) {
				code += `      console.error(e);\n`;
			}

			code += `      return false;\n`;
			code += `    }\n`;
		}

		code += `    return true;\n`;
		code += `  };\n`;
		packetId++;
	}

	// console.log(`\n\nfunction createMethods(send, writer, state, methods) {\n${code}}\n`);
	return new Function('remote', 'send', 'writer', 'remoteState', 'remoteOptions', 'methods', code) as any;
}

let id = 0;

function writeField(f: Bin | any[], n: string, indent: string) {
	if (Array.isArray(f)) {
		const thisId = ++id;
		const it = `i${thisId}`;
		const array = `array${thisId}`;
		const item = `item${thisId}`;
		let code = '';

		code += `${indent}var ${array} = ${n};\n`;
		code += `${indent}if (writeArrayHeader(writer, ${array})) {\n`;
		code += `${indent}  for(var ${it} = 0; ${it} < ${array}.length; ${it}++) {\n`;
		code += `${indent}    var ${item} = ${array}[${it}];\n`;

		if (f.length === 1) {
			code += writeField(f[0], item, indent + '    ');
		} else {
			for (let i = 0; i < f.length; i++) {
				code += writeField(f[i], `${item}[${i}]`, indent + '    ');
			}
		}

		code += `${indent}  }\n`;
		code += `${indent}}\n`;
		return code;
	} else {
		return `${indent}write${binaryNames[f]}(writer, ${n});\n`;
	}
}

function createWriteFunction(id: number, fields: any[], indent: string) {
	let code = `${indent}writeUint8(writer, ${id});\n`;

	for (let i = 0; i < fields.length; i++) {
		code += writeField(fields[i], `a${i}`, indent);
	}

	return code;
}

function readField(f: Bin | any[], indent: string) {
	if (f instanceof Array) {
		let code = '';

		if (f.length === 1) {
			code += `\n${indent}\t${readField(f[0], indent + '\t')}\n${indent}`;
		} else {
			code += '[\n';

			for (let i = 0; i < f.length; i++) {
				code += `${indent}\t${readField(f[i], indent + '\t')},\n`;
			}

			code += `${indent}]`;
		}

		return `readArray(reader, function (reader) { return ${code.trim()}; })`;
	} else {
		return `read${binaryNames[f]}(reader)`;
	}
}

function createReadFunction(fields: any[], indent: string) {
	let code = '';

	for (let i = 0; i < fields.length; i++) {
		code += `${indent}var a${i} = ${readField(fields[i], indent)};\n`;
	}

	return code;
}
