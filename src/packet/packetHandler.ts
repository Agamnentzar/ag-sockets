import { FuncList, Logger, getNames, getIgnore, MethodDef, OnSend, OnRecv, Bin, RemoteOptions } from '../interfaces';
import { isBinaryOnlyPacket, parseRateLimit, checkRateLimit3 } from '../utils';
import {
	writeUint8, writeInt16, writeUint16, writeUint32, writeInt32, writeFloat64, writeFloat32, writeBoolean,
	writeString, writeArrayBuffer, writeUint8Array, writeInt8, writeArray, writeArrayHeader,
	writeBytes, resizeWriter, createBinaryWriter, writeBytesRange, writeAny, BinaryWriter,
} from './binaryWriter';
import {
	readInt8, readUint8, readUint16, readInt16, readUint32, readInt32, readFloat32, readFloat64, readBoolean,
	readString, readArrayBuffer, readUint8Array, readArray, readBytes, BinaryReader, readAny
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
binaryNames[Bin.Obj] = 'Any';
binaryNames[Bin.Buffer] = 'ArrayBuffer';
binaryNames[Bin.U8Array] = 'Uint8Array';
binaryNames[Bin.Raw] = 'Bytes';

function readBytesRaw(reader: BinaryReader) {
	const length = reader.view.byteLength - (reader.view.byteOffset + reader.offset);
	return readBytes(reader, length);
}

declare const IndexSizeError: any;

function isSizeError(e: Error) {
	if (typeof RangeError !== 'undefined' && e instanceof RangeError) return true;
	if (typeof TypeError !== 'undefined' && e instanceof TypeError) return true;
	if (typeof IndexSizeError !== 'undefined' && e instanceof IndexSizeError) return true;
	if (/DataView/.test(e.message)) return true;
	return false;
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
	readAny,
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
	writeAny,
	writeArrayBuffer,
	writeUint8Array,
	writeArrayHeader,
	writeArray,
	writeBytes,
	writeBytesRange,
	isSizeError,
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
	forceBinaryPackets?: boolean;
	useBuffer?: boolean;
	debug?: boolean;
	development?: boolean;
	onSend?: OnSend;
	onRecv?: OnRecv;
}

type CreateRemoteHandler = (
	remote: any, send: Send, state: RemoteState, options: RemoteOptions, writerMethods: any, writer: BinaryWriter,
) => any;

type LocalHandler = (
	actions: any, reader: BinaryReader, callsList: number[], messageId: number, handleResult?: HandleResult
) => void;

export interface PacketHandler {
	sendString(send: Send, name: string, id: number, args: any[]): number;
	createRemote(remote: any, send: Send, state: RemoteState): void;
	recvString(data: string, funcList: FuncList, specialFuncList: FuncList, handleFunction?: FunctionHandler): void;
	recvBinary(actions: any, reader: BinaryReader, callsList: number[], messageId: number, handleResult?: HandleResult): void;
	writerBufferSize(): number;
}

export function createPacketHandler(
	local: MethodDef[] | undefined, remote: MethodDef[] | undefined, options: HandlerOptions, log: Logger
): PacketHandler {
	if (!local || !remote) throw new Error('Missing server or client method definitions');
	if (local.length > 250 || remote.length > 250) throw new Error('Too many methods');

	const debug = !!options.debug;
	const forceBinaryPackets = !!options.forceBinaryPackets;
	const development = !!options.development;
	const onSend = options.onSend;
	const onRecv = options.onRecv ?? (() => { });

	const remoteNames = getNames(remote);
	const localNames = getNames(local);
	const localWithBinary = new Set(local
		.map(x => typeof x === 'string' ? { name: x, binary: false } : { name: x[0], binary: !!x[1].binary })
		.filter(x => x.binary)
		.map(x => x.name));
	const ignorePackets = new Set([...getIgnore(remote), ...getIgnore(local)]);
	const recvBinary = generateLocalHandlerCode(local, options, onRecv);
	const createRemoteHandler = generateRemoteHandlerCode(remote, options);
	const writer = createBinaryWriter();

	function sendString(send: Send, name: string, id: number, args: any[]): number {
		try {
			const data = JSON.stringify([id, ...args]);
			send(data);

			if (debug && ignorePackets.has(name)) {
				log(`SEND [${data.length}] (str)`, name, [id, ...args]);
			}

			onSend?.(id, name, data.length, false);
			return data.length;
		} catch (e) {
			if (debug || development) throw e;
			return 0;
		}
	}

	function createRemote(remote: any, send: Send, state: RemoteState) {
		createRemoteHandler(remote, send, state, options, writerMethods, writer);
	}

	function recvString(data: string, funcList: FuncList, specialFuncList: FuncList, handleFunction = defaultHandler) {
		const args = JSON.parse(data);
		const funcId = args.shift() | 0;
		let funcName: string | undefined;
		let funcSpecial = false;

		if (funcId === MessageType.Version) {
			funcName = '*version';
			funcSpecial = true;
		} else if (funcId === MessageType.Rejected) {
			funcName = '*reject:' + remoteNames[args.shift() | 0];
			funcSpecial = true;
		} else if (funcId === MessageType.Resolved) {
			funcName = '*resolve:' + remoteNames[args.shift() | 0];
			funcSpecial = true;
		} else {
			funcName = localNames[funcId];
		}

		const funcObj = funcSpecial ? specialFuncList : funcList;
		const func = funcObj[funcName];

		if (debug && ignorePackets.has(funcName)) {
			log(`RECV [${data.length}] (str)`, funcName, args);
		}

		if (forceBinaryPackets && localWithBinary.has(funcName)) {
			throw new Error(`Invalid non-binary packet (${funcName})`);
		}

		if (func) {
			handleFunction(funcId, funcName, func, funcObj, args);
		} else {
			if (debug) log(`invalid message: ${funcName}`, args);
			if (development) throw new Error(`Invalid packet (${funcName})`);
		}

		onRecv(funcId, funcName, data.length, false);
	}

	function writerBufferSize() {
		return writer.bytes.byteLength;
	}

	return { sendString, createRemote, recvString, recvBinary, writerBufferSize };
}

// code generation

function generateLocalHandlerCode(methods: MethodDef[], { debug }: HandlerOptions, onRecv: OnRecv): LocalHandler {
	let code = ``;
	code += `var anyState = { strings: [] };\n`;
	code += `${Object.keys(readerMethods).map(key => `  var ${key} = methods.${key};`).join('\n')}\n\n`;
	code += `  return function (actions, reader, callsList, messageId, handleResult) {\n`;
	code += `    anyState.strings.length = 0;\n`;
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
				const { limit, frame } = options.serverRateLimit ? parseRateLimit(options.serverRateLimit, false) : parseRateLimit(options.rateLimit!, true);

				code += `        if (!checkRateLimit(${packetId}, callsList, ${limit}, ${frame})) `;

				if (options.promise) {
					code += `handleResult(${packetId}, '${name}', Promise.reject(new Error('Rate limit exceeded')), messageId);\n`;
				} else {
					code += `throw new Error('Rate limit exceeded (${name})');\n`;
				}
			}

			code += createReadFunction(options.binary, '        ');

			for (let i = 0, j = 0; i < options.binary.length; i++, j++) {
				if (options.binary[i] === Bin.U8ArrayOffsetLength) args.push(j++, j++);
				args.push(j);
			}

			const argList = args.map(i => `a${i}`).join(', ');

			if (debug) {
				code += `        console.log('RECV [' + reader.view.byteLength + '] (bin)', '${name}', [${argList}]);\n`;
			}

			code += `        onRecv(${packetId}, '${name}', reader.view.byteLength, true, reader.view, actions);\n`;

			if (options.promise) {
				code += `        var result = actions.${name}(${argList});\n`;
				code += `        handleResult(${packetId}, '${name}', result, messageId);\n`;
			} else {
				code += `        actions.${name}(${argList});\n`;
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
	return new Function('methods', 'checkRateLimit', 'onRecv', code)(readerMethods, checkRateLimit3, onRecv) as any;
}

function generateRemoteHandlerCode(methods: MethodDef[], handlerOptions: HandlerOptions): CreateRemoteHandler {
	let code = ``;
	code += `${Object.keys(writerMethods).map(key => `  var ${key} = methods.${key};`).join('\n')}\n`;
	code += `  var log = remoteOptions.log || function () {};\n`;
	code += `  var onSend = remoteOptions.onSend || function () {};\n`;
	code += `  var anyState = { strings: new Map() };\n\n`;

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

		const catchError = !(handlerOptions.debug || handlerOptions.development);

		if (catchError) {
			code += `    try {\n`;
		}

		const indent = options.binary ? `      ` : `    `;

		if (options.binary) {
			code += `${indent}if (remoteState.supportsBinary) {\n`;
			code += `${indent}  while (true) {\n`;
			code += `${indent}    try {\n`;
			code += `${indent}      anyState.strings.clear();\n`;
			code += `${indent}      writer.offset = 0;\n`;
			code += createWriteFunction(packetId, options.binary, `${indent}      `);
			code += `${indent}      var buffer = ${bufferCtor}(writer.bytes.buffer, writer.bytes.byteOffset, writer.offset);\n`;
			code += `${indent}      send(buffer);\n`;
			code += `${indent}      remoteState.sentSize += buffer.${bufferLength};\n`; // TODO: move from here, just count in send function
			code += `${indent}      onSend(${packetId}, '${name}', buffer.${bufferLength}, true);\n`;

			if (handlerOptions.debug && !options.ignore) {
				code += `${indent}      log('SEND [' + buffer.${bufferLength} + '] (bin) "${name}"', arguments);\n`;
			}

			code += `${indent}      break;\n`;
			code += `${indent}    } catch (e) {\n`;
			code += `${indent}      if (isSizeError(e)) {\n`;
			code += `${indent}        resizeWriter(writer);\n`;
			code += `${indent}      } else {\n`;

			if (catchError) {
				code += `${indent}        return false;\n`;
			} else {
				code += `${indent}        throw e;\n`;
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
			code += `${indent}  remoteState.sentSize += json.length;\n`; // TODO: move from here, just count in send function
			code += `${indent}  onSend(${packetId}, '${name}', json.length, false);\n`;

			if (handlerOptions.debug && !options.ignore) {
				code += `${indent}  log('SEND [' + json.length + '] (json) "${name}"', arguments);\n`;
			}
		}

		if (options.binary) {
			code += `${indent}}\n`;
		}

		if (catchError) {
			code += `    } catch (e) {\n`;
			code += `      return false;\n`;
			code += `    }\n`;
		}

		code += `    return true;\n`;
		code += `  };\n`;
		packetId++;
	}

	// console.log(`\n\nfunction createMethods(send, state, methods) {\n${code}}\n`);
	return new Function('remote', 'send', 'remoteState', 'remoteOptions', 'methods', 'writer', code) as any;
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
		return `${indent}write${binaryNames[f]}(writer, ${n}${f === Bin.Obj ? ', anyState' : ''});\n`;
	}
}

function createWriteFunction(id: number, fields: any[], indent: string) {
	let code = `${indent}writeUint8(writer, ${id});\n`;

	for (let i = 0, j = 0; i < fields.length; i++, j++) {
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
			code += `\n${indent}  ${readField(f[0], indent + '  ')}\n${indent}`;
		} else {
			code += '[\n';

			for (let i = 0; i < f.length; i++) {
				code += `${indent}  ${readField(f[i], indent + '  ')},\n`;
			}

			code += `${indent}]`;
		}

		return `readArray(reader, function (reader) { return ${code.trim()}; })`;
	} else {
		return `read${binaryNames[f]}(reader${f === Bin.Obj ? ', anyState' : ''})`;
	}
}

function createReadFunction(fields: any[], indent: string) {
	let code = '';

	for (let i = 0, j = 0; i < fields.length; i++, j++) {
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
