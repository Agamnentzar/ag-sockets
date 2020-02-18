import { FuncList, Logger, getNames, getIgnore, MethodDef, OnSendRecv, Bin, RemoteOptions } from '../interfaces';
import { checkRateLimit, RateLimits } from '../utils';
import { isBinaryOnlyPacket } from '../serverUtils';
import {
	writeUint8, writeInt16, writeUint16, writeUint32, writeInt32, writeFloat64, writeFloat32, writeBoolean,
	writeString, writeObject, writeArrayBuffer, writeUint8Array, writeInt8, writeArray, writeArrayHeader,
	writeBytes, resizeWriter, createBinaryWriter, writeBytesRange,
} from './binaryWriter';
import {
	readInt8, readUint8, readUint16, readInt16, readUint32, readInt32, readFloat32, readFloat64, readBoolean,
	readString, readObject, readArrayBuffer, readUint8Array, readArray, readBytes, BinaryReader
} from './binaryReader';

const binaryNames: string[] = [];
binaryNames[Bin.I8] = 'Int8';
binaryNames[Bin.U8] = 'Uint8';
binaryNames[Bin.I16] = 'Int16';
binaryNames[Bin.U16] = 'Uint16';
binaryNames[Bin.I32] = 'Int32';
binaryNames[Bin.U32] = 'Uint32';
binaryNames[Bin.F32] = 'Float32';
binaryNames[Bin.F64] = 'Float64';
binaryNames[Bin.Bool] = 'Boolean';
binaryNames[Bin.Str] = 'String';
binaryNames[Bin.Obj] = 'Object';
binaryNames[Bin.Buffer] = 'ArrayBuffer';
binaryNames[Bin.U8Array] = 'Uint8Array';
binaryNames[Bin.Raw] = 'Bytes';

function readBytesRaw(reader: BinaryReader) {
	const length = reader.view.byteLength - (reader.view.byteOffset + reader.offset);
	return readBytes(reader, length);
}

const readerMethods = {
	readUint8,
	readInt8,
	readUint16,
	readInt16,
	readUint32,
	readInt32,
	readFloat32,
	readFloat64,
	readBoolean,
	readString,
	readObject,
	readArrayBuffer,
	readUint8Array,
	readArray,
	readBytes: readBytesRaw,
};

const writerMethods = {
	createWriter: createBinaryWriter,
	resizeWriter,
	writeUint8,
	writeInt8,
	writeUint16,
	writeInt16,
	writeUint32,
	writeInt32,
	writeFloat32,
	writeFloat64,
	writeBoolean,
	writeString,
	writeObject,
	writeArrayBuffer,
	writeUint8Array,
	writeArrayHeader,
	writeArray,
	writeBytes,
	writeBytesRange,
};

export interface Send {
	(data: string | Uint8Array): void; // or Buffer
}

export const enum MessageType {
	Version = 255,
	Resolved = 254,
	Rejected = 253,
}

export interface FunctionHandler {
	(funcId: number, funcName: string, func: Function, funcObj: any, args: any[]): void;
}

export const defaultHandler: FunctionHandler =
	(_funcId, _funcName, func, funcObj, args) => func.apply(funcObj, args);

export interface RemoteState {
	supportsBinary: boolean;
	sentSize: number;
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
	remote: any, send: Send, state: RemoteState, options: RemoteOptions, writerMethods: any
) => any;

type LocalHandler = (
	actions: any, reader: BinaryReader, rates: RateLimits, messageId: number, handleResult?: HandleResult
) => void;

export interface PacketHandler {
	sendString(send: Send, name: string, id: number, args: any[]): number;
	createRemote(remote: any, send: Send, state: RemoteState): void;
	recvString(data: string, funcList: FuncList, specialFuncList: FuncList, handleFunction?: FunctionHandler): void;
	recvBinary(actions: any, reader: BinaryReader, rates: RateLimits, messageId: number, handleResult?: HandleResult): void;
}

export function createPacketHandler(
	local: MethodDef[] | undefined, remote: MethodDef[] | undefined, options: HandlerOptions, log: Logger
): PacketHandler {
	if (!local || !remote) throw new Error('Missing server or client method definitions');
	if (local.length > 250 || remote.length > 250) throw new Error('Too many methods');

	const remoteNames = getNames(remote);
	const localNames = getNames(local);
	const ignorePackets = [...getIgnore(remote), ...getIgnore(local)];
	const recvBinary = generateLocalHandlerCode(local, options, readerMethods, checkRateLimit);
	const createRemoteHandler = generateRemoteHandlerCode(remote, options);

	const debug = !!options.debug;
	const development = !!options.development;
	const onSend = options.onSend;
	const onRecv = options.onRecv;

	function sendString(send: Send, name: string, id: number, args: any[]): number {
		try {
			const data = JSON.stringify([id, ...args]);
			send(data);

			if (debug && ignorePackets.indexOf(name) === -1) {
				log(`SEND [${data.length}] (str)`, name, [id, ...args]);
			}

			onSend?.(id, name, data.length, false);
			return data.length;
		} catch (e) {
			if (debug) throw e;
			if (development) console.error(e);
			return 0;
		}
	}

	function createRemote(remote: any, send: Send, state: RemoteState) {
		createRemoteHandler(remote, send, state, options, writerMethods);
	}

	function recvString(
		data: string, funcList: FuncList, specialFuncList: FuncList, handleFunction: FunctionHandler = defaultHandler
	) {
		const args = JSON.parse(data);
		const funcId = args.shift();
		let funcName: string | undefined;
		let funcSpecial = false;

		if (funcId === MessageType.Version) {
			funcName = '*version';
			funcSpecial = true;
		} else if (funcId === MessageType.Rejected) {
			funcName = '*reject:' + remoteNames[args.shift()];
			funcSpecial = true;
		} else if (funcId === MessageType.Resolved) {
			funcName = '*resolve:' + remoteNames[args.shift()];
			funcSpecial = true;
		} else {
			funcName = localNames[funcId];
		}

		const funcObj = funcSpecial ? specialFuncList : funcList;
		const func = funcObj[funcName];

		if (debug && ignorePackets.indexOf(funcName) === -1) {
			log(`RECV [${data.length}] (str)`, funcName, args);
		}

		if (func) {
			handleFunction(funcId, funcName, func, funcObj, args);
		} else {
			if (debug) log(`invalid message: ${funcName}`, args);
			if (development) console.error('Invalid packet');
		}

		onRecv?.(funcId, funcName, data.length, false);
	}

	return { sendString, createRemote, recvString, recvBinary };
}

// code generation

function generateLocalHandlerCode(
	methods: MethodDef[], { debug }: HandlerOptions, readerMethods: any, checkRateLimit: any
): LocalHandler {
	let code = ``;
	code += `${Object.keys(readerMethods).map(key => `  var ${key} = methods.${key};`).join('\n')}\n\n`;
	code += `  return function (actions, reader, rates, messageId, handleResult) {\n`;
	code += `    var packetId = readUint8(reader);\n`;
	code += `    switch (packetId) {\n`;

	let packetId = 0;

	for (const method of methods) {
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

			for (let i = 0, j = 0; i < options.binary.length; i++ , j++) {
				if (options.binary[i] === Bin.U8ArrayOffsetLength) args.push(j++, j++);
				args.push(j);
			}

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
			code += `        throw new Error('Missing binary decoder for: ${name} (${packetId})');\n`;
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
	code += `  var onRecv = remoteOptions.onRecv || function () {};\n`;
	code += `  var writer = createWriter();\n\n`;

	let packetId = 0;
	const bufferCtor = handlerOptions.useBuffer ? 'Buffer.from' : 'new Uint8Array';
	const bufferLength = handlerOptions.useBuffer ? 'length' : 'byteLength';

	for (const method of methods) {
		const name = typeof method === 'string' ? method : method[0];
		const options = typeof method === 'string' ? {} : method[1];
		let args = [];

		if (options.binary) {
			for (let i = 0, j = 0; i < options.binary.length; i++) {
				if (options.binary[i] === Bin.U8ArrayOffsetLength) {
					args.push(`a${j++}`, `a${j++}`);
				}

				args.push(`a${j++}`);
			}
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
			code += `${indent}      remoteState.sentSize += buffer.${bufferLength};\n`;
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
			code += `${indent}  remoteState.sentSize += json.length;\n`;
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

	// console.log(`\n\nfunction createMethods(send, state, methods) {\n${code}}\n`);
	return new Function('remote', 'send', 'remoteState', 'remoteOptions', 'methods', code) as any;
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

	for (let i = 0, j = 0; i < fields.length; i++ , j++) {
		if (fields[i] === Bin.U8ArrayOffsetLength) {
			code += `${indent}writeBytesRange(writer, a${j}, a${j + 1}, a${j + 2});\n`;
			j += 2;
		} else {
			code += writeField(fields[i], `a${j}`, indent);
		}
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

	for (let i = 0, j = 0; i < fields.length; i++ , j++) {
		if (fields[i] === Bin.U8ArrayOffsetLength) {
			code += `${indent}var a${j} = readUint8Array(reader);\n`;
			code += `${indent}var a${j + 1} = a${j}.byteOffset;\n`;
			code += `${indent}var a${j + 2} = a${j}.byteLength;\n`;
			j += 2;
		} else {
			code += `${indent}var a${j} = ${readField(fields[i], indent)};\n`;
		}
	}

	return code;
}
