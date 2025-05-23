import { FuncList, Logger, getNames, MethodDef, OnSend, OnRecv, Bin, RemoteOptions, BinaryDefItem, StringsDictionary } from '../interfaces';
import { isBinaryOnlyPacket, parseRateLimit, checkRateLimit3, createStringsDictionary } from '../utils';
import {
	writeUint8, writeInt16, writeUint16, writeUint32, writeInt32, writeFloat64, writeFloat32, writeBoolean,
	writeString, writeArrayBuffer, writeUint8Array, writeInt8, writeArray, writeArrayHeader,
	writeBytes, resizeWriter, createBinaryWriter, writeBytesRange, writeAny, BinaryWriter, isSizeError, writeBytesRangeView,
} from './binaryWriter';
import {
	readInt8, readUint8, readUint16, readInt16, readUint32, readInt32, readFloat32, readFloat64, readBoolean,
	readString, readArrayBuffer, readUint8Array, readArray, readBytes, BinaryReader, readAny, readLength
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
	readLength,
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
	writeBytesRangeView,
	isSizeError,
};

export interface Send {
	(data: string | Uint8Array): void; // or Buffer
}

export const enum MessageType {
	Version = 255,
	Resolved = 254,
	Rejected = 253,
	Error = 252,
}

export interface FunctionHandler {
	(funcId: number, func: Function, funcObj: any, args: any[]): void;
}

export const defaultHandler: FunctionHandler = (_funcId, func, funcObj, args) => func.apply(funcObj, args);

export interface RemoteState {
	supportsBinary: boolean;
	sentSize: number;
	batch: boolean;
}

export type HandleResult = (funcId: number, funcBinary: boolean, result: Promise<any>, messageId: number) => void;

export interface HandlerOptions {
	forceBinary?: boolean;
	forceBinaryPackets?: boolean;
	useBinaryByDefault?: boolean;
	useBuffer?: boolean;
	debug?: boolean;
	development?: boolean;
	printGeneratedCode?: boolean;
	useBinaryResultByDefault?: boolean;
	onSend?: OnSend;
	onRecv?: OnRecv;
}

type CreateRemoteHandler = (remote: any, send: Send, state: RemoteState, options: RemoteOptions, writerMethods: any, writer: BinaryWriter, strings: StringsDictionary) => any;

type LocalHandler = (reader: BinaryReader, actions: any, specialActions: any, callsList: number[], messageId: number, strings: string[], handleResult?: HandleResult) => void;

export interface PacketHandler {
	sendString(send: Send, id: number, funcId: number, messageId: number, result: any): number;
	sendBinary(send: Send, id: number, funcId: number, messageId: number, result: any): number;
	createRemote(remote: any, send: Send, state: RemoteState): void;
	recvString(data: string, funcList: FuncList, specialFuncList: FuncList, handleFunction?: FunctionHandler): void;
	recvBinary(reader: BinaryReader, funcList: FuncList, specialFuncList: FuncList, callsList: number[], messageId: number, strings: string[], handleResult?: HandleResult): void;
	writerBufferSize(): number;
	commitBatch(send: Send, state: RemoteState): void;
}

export function createPacketHandler(
	local: MethodDef[] | undefined, remote: MethodDef[] | undefined, options: HandlerOptions, log: Logger
): PacketHandler {
	if (!local || !remote) throw new Error('Missing server or client method definitions');
	if (local.length > 250 || remote.length > 250) throw new Error('Too many methods');

	const debug = !!options.debug;
	const forceBinaryPackets = !!options.forceBinaryPackets;
	const development = !!options.development;
	const useBuffer = !!options.useBuffer;
	const onSend = options.onSend;
	const onRecv = options.onRecv ?? (() => { });

	const remoteNames = getNames(remote);
	const localNames = getNames(local);
	const localWithBinary = new Set(local
		.map(x => typeof x === 'string' ? { name: x, binary: false } : { name: x[0], binary: !!x[1].binary })
		.filter(x => x.binary)
		.map(x => x.name));
	const recvBinary = generateLocalHandlerCode(local, remoteNames, options, onRecv);
	const createRemoteHandler = generateRemoteHandlerCode(remote, options);
	const writer = createBinaryWriter();
	const strings = createStringsDictionary();

	function sendString(send: Send, id: number, funcId: number, messageId: number, result: any): number {
		try {
			const data = JSON.stringify([id, funcId, messageId, result]);
			send(data);

			if (debug) {
				log(`SEND [${data.length}] (str)`, [id, funcId, messageId, result]);
			}

			if (onSend) onSend(id, '', data.length, false);
			return data.length;
		} catch (e) {
			if (debug || development) throw e;
			return 0;
		}
	}

	function sendBinary(send: Send, id: number, funcId: number, messageId: number, result: any): number {
		while (true) {
			try {
				strings.clear();
				writer.offset = 0;
				writeUint8(writer, id);
				writeUint8(writer, funcId);
				writeUint32(writer, messageId);
				writeAny(writer, result, strings);

				const data = options.useBuffer ?
					Buffer.from(writer.view.buffer, writer.view.byteOffset, writer.offset) :
					new Uint8Array(writer.view.buffer, writer.view.byteOffset, writer.offset);

				send(data);

				if (debug) {
					log(`SEND [${data.length}] (bin)`, [id, funcId, messageId, result]);
				}

				if (onSend) onSend(id, '', data.length, true);
				return data.length;
			} catch (e) {
				if (isSizeError(e)) {
					resizeWriter(writer);
				} else {
					if (debug || development) throw e;
					return 0;
				}
			}
		}
	}

	function createRemote(remote: any, send: Send, state: RemoteState) {
		createRemoteHandler(remote, send, state, options, writerMethods, writer, strings);
	}

	function commitBatchUint8Array(send: Send, state: RemoteState) {
		try {
			const buffer = new Uint8Array(writer.view.buffer, writer.view.byteOffset, writer.offset);
			send(buffer);
			state.sentSize += buffer.byteLength;
		} finally {
			strings.clear();
			writer.offset = 0;
		}
	}

	function commitBatchBuffer(send: Send, state: RemoteState) {
		try {
			const buffer = Buffer.from(writer.view.buffer, writer.view.byteOffset, writer.offset);
			send(buffer);
			state.sentSize += buffer.length;
		} finally {
			strings.clear();
			writer.offset = 0;
		}
	}

	function recvString(data: string, funcList: FuncList, specialFuncList: FuncList, handleFunction = defaultHandler) {
		const args = JSON.parse(data) as any[];
		const funcId = args.shift() | 0;
		let funcName: string | undefined;
		let funcSpecial = false;

		if (funcId === MessageType.Version) {
			funcName = '*version';
			args.shift(); // skip funcId
			args.shift(); // skip messageId
			funcSpecial = true;
		} else if (funcId === MessageType.Error) {
			funcName = '*error';
			args.shift(); // skip funcId
			args.shift(); // skip messageId
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

		// TODO: use different lists, don't use funcName for rejects/resolves/error/version
		const funcObj = funcSpecial ? specialFuncList : funcList;
		const func = funcObj[funcName];

		if (debug) {
			log(`RECV [${data.length}] (str)`, funcName, args);
		}

		if (forceBinaryPackets && localWithBinary.has(funcName)) {
			throw new Error(`Invalid non-binary packet (${funcName})`);
		}

		if (func) {
			handleFunction(funcId, func, funcObj, args);
		} else {
			if (debug) log(`invalid message: ${funcName}`, args);
			if (development) throw new Error(`Invalid packet (${funcName})`);
		}

		onRecv(funcId, funcName, data.length, false, undefined, funcList);
	}

	function writerBufferSize() {
		return writer.view.byteLength;
	}

	const commitBatch = useBuffer ? commitBatchBuffer : commitBatchUint8Array;

	return { sendString, sendBinary, createRemote, recvString, recvBinary, writerBufferSize, commitBatch };
}

// code generation

function generateLocalHandlerCode(methods: MethodDef[], remoteNames: string[], { debug, printGeneratedCode, useBinaryByDefault, useBinaryResultByDefault }: HandlerOptions, onRecv: OnRecv): LocalHandler {
	let code = ``;
	code += `${Object.keys(readerMethods).map(key => `  var ${key} = methods.${key};`).join('\n')}\n\n`;
	code += `  return function (reader, actions, special, callsList, messageId, strings, handleResult) {\n`;
	code += `    var packetId = readUint8(reader);\n`;
	code += `    switch (packetId) {\n`;

	let packetId = 0;

	for (const method of methods) {
		const name = typeof method === 'string' ? method : method[0];
		const options = typeof method === 'string' ? {} : method[1];
		const binaryResult = options.binaryResult || useBinaryResultByDefault;
		const args = [];

		code += `      case ${packetId}: {\n`;

		if (options.binary || useBinaryByDefault) {
			code += `        try {\n`;

			if (options.rateLimit || options.serverRateLimit) {
				const { limit, frame } = options.serverRateLimit ? parseRateLimit(options.serverRateLimit, false) : parseRateLimit(options.rateLimit!, true);

				code += `        if (!checkRateLimit(${packetId}, callsList, ${limit}, ${frame})) `;

				if (options.promise) {
					code += `handleResult(${packetId}, ${binaryResult ? 'true' : 'false'}, Promise.reject(new Error('Rate limit exceeded')), messageId);\n`;
				} else {
					code += `throw new Error('Rate limit exceeded (${name})');\n`;
				}
			}

			if (options.binary) {
				code += createReadFunction(options.binary, '          ');

				for (let i = 0, j = 0; i < options.binary.length; i++, j++) {
					if (options.binary[i] === Bin.U8ArrayOffsetLength || options.binary[i] === Bin.DataViewOffsetLength) {
						args.push(j++, j++);
					}
					args.push(j);
				}
			} else {
				code += createReadFunction([Bin.Obj], '          ');
				args.push(0);
			}

			// skip to end if we failed to decode so we don't try to decode more packets
			code += `        } catch (e) {\n`;
			code += `          reader.offset = reader.view.byteLength;\n`;
			code += `          throw e;\n`;
			code += `        }\n`;

			const argList = args.map(i => `a${i}`).join(', ');

			if (debug) {
				code += `        console.log('RECV [' + reader.view.byteLength + '] (bin)', '${name}', [${argList}]);\n`;
			}

			code += `        onRecv(${packetId}, reader.view.byteLength, true, reader.view, actions);\n`;

			const call = options.binary ? `actions.${name}(${argList})` : `actions.${name}.apply(actions, ${argList})`;

			if (options.promise) {
				code += `        var result = ${call};\n`;
				code += `        handleResult(${packetId}, ${binaryResult ? 'true' : 'false'}, result, messageId);\n`;
			} else {
				code += `        ${call};\n`;
			}

			code += `        break;\n`;
		} else {
			code += `        throw new Error('Missing binary decoder for: ${name} (${packetId})');\n`;
		}

		code += `      }\n`;

		packetId++;
	}

	code += `      case ${MessageType.Version}:\n`;
	code += `      case ${MessageType.Error}:\n`;
	code += `      case ${MessageType.Resolved}:\n`;
	code += `      case ${MessageType.Rejected}: {\n`;
	code += `        const funcId = readUint8(reader);\n`;
	code += `        const messageId = readUint32(reader);\n`;
	code += `        const result = readAny(reader, strings);\n`;
	code += `        if (packetId === ${MessageType.Version}) {\n`;
	code += `          special['*version'](result);\n`;
	code += `        } else if (packetId === ${MessageType.Error}) {\n`;
	code += `          special['*error'](result);\n`;
	code += `        } else if (packetId === ${MessageType.Resolved}) {\n`;
	code += `          special['*resolve:' + remoteNames[funcId]](messageId, result);\n`;
	code += `        } else if (packetId === ${MessageType.Rejected}) {\n`;
	code += `          special['*reject:' + remoteNames[funcId]](messageId, result);\n`;
	code += `        } else {\n`;
	code += `          throw new Error('Missing handling for packet ID: ' + packetId);\n`;
	code += `        }\n`;
	code += `        break;\n`;
	code += `      }\n`;

	code += `      default:\n`;
	code += `        throw new Error('Invalid packet ID: ' + packetId);\n`;
	code += `    };\n`;
	code += `  };\n`;

	if (printGeneratedCode) {
		console.log(`\n\nfunction createRecvHandler(methods, checkRateLimit, onRecv) {\n${code}}\n`);
	}

	return new Function('methods', 'remoteNames', 'checkRateLimit', 'onRecv', code)(readerMethods, remoteNames, checkRateLimit3, onRecv) as any;
}

function generateRemoteHandlerCode(methods: MethodDef[], handlerOptions: HandlerOptions): CreateRemoteHandler {
	let code = ``;
	code += `${Object.keys(writerMethods).map(key => `  var ${key} = methods.${key};`).join('\n')}\n`;
	code += `  var log = remoteOptions.log || function () {};\n`;
	code += `  var onSend = remoteOptions.onSend || function () {};\n\n`;

	let packetId = 0;
	const bufferCtor = handlerOptions.useBuffer ? 'Buffer.from' : 'new Uint8Array';
	const bufferLength = handlerOptions.useBuffer ? 'length' : 'byteLength';

	for (const method of methods) {
		const name = typeof method === 'string' ? method : method[0];
		const options = typeof method === 'string' ? {} : method[1];
		let args = [];

		if (options.binary) {
			for (let i = 0, j = 0; i < options.binary.length; i++) {
				if (options.binary[i] === Bin.U8ArrayOffsetLength || options.binary[i] === Bin.DataViewOffsetLength) {
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

		if (options.binary || handlerOptions.useBinaryByDefault) {
			code += `${indent}if (remoteState.supportsBinary) {\n`;
			code += `${indent}  try {\n`;
			code += `${indent}    var stringsSize = strings.size();`;
			code += `${indent}    var writerOffset = writer.offset;`;
			code += `${indent}    while (true) {\n`;
			code += `${indent}      try {\n`;
			code += `${indent}        strings.trimTo(stringsSize);\n`; // reset to previous string list if we failed to write packet
			code += `${indent}        writer.offset = writerOffset;\n`; // reset to start in case we failed to write packet

			if (!options.binary) {
				code += `${indent}        var a0 = [];\n`;
				code += `${indent}        for (var i = 0; i < arguments.length; i++) a0.push(arguments[i]);\n`;
			}

			code += createWriteFunction(packetId, options.binary ?? [Bin.Obj], `${indent}      `);

			code += `${indent}        break;\n`;
			code += `${indent}      } catch (e) {\n`;
			code += `${indent}        if (isSizeError(e)) {\n`;
			code += `${indent}          resizeWriter(writer, writerOffset);\n`;
			code += `${indent}        } else {\n`;

			if (catchError) {
				code += `${indent}          return false;\n`;
			} else {
				code += `${indent}          throw e;\n`;
			}

			code += `${indent}        }\n`;
			code += `${indent}      }\n`;
			code += `${indent}    }\n`;
			code += `${indent}    if (!remoteState.batch) {\n`;
			code += `${indent}      var buffer = ${bufferCtor}(writer.view.buffer, writer.view.byteOffset, writer.offset);\n`;
			code += `${indent}      send(buffer);\n`;
			code += `${indent}      remoteState.sentSize += buffer.${bufferLength};\n`; // TODO: move from here, just count in send function
			code += `${indent}      onSend(${packetId}, '${name}', buffer.${bufferLength}, true);\n`;

			if (handlerOptions.debug && !options.ignore) {
				code += `${indent}      log('SEND [' + buffer.${bufferLength} + '] (bin) "${name}"', arguments);\n`;
			}

			code += `${indent}    }\n`;
			code += `${indent}  } finally {\n`;
			code += `${indent}    if (!remoteState.batch) {\n`;
			code += `${indent}      strings.clear();\n`;
			code += `${indent}      writer.offset = 0;\n`;
			code += `${indent}    }\n`;
			code += `${indent}  }\n`;
			code += `${indent}} else {\n`;
		}

		if (handlerOptions.useBinaryByDefault || handlerOptions.forceBinary || isBinaryOnlyPacket(method)) {
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

		if (options.binary || handlerOptions.useBinaryByDefault) {
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

	if (handlerOptions.printGeneratedCode) {
		console.log(`\n\nfunction createSendHandler(remote, send, removeState, remoteOptions, methods, writer, strings) {\n${code}}\n`);
	}

	return new Function('remote', 'send', 'remoteState', 'remoteOptions', 'methods', 'writer', 'strings', code) as any;
}

let id = 0;

function writeField(f: BinaryDefItem, n: string, indent: string) {
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
	} else if (typeof f === 'object') {
		const thisId = ++id;
		const object = `object${thisId}`;
		let code = '';

		code += `${indent}var ${object} = ${n};\n`;

		for (const key of Object.keys(f).sort()) {
			code += writeField(f[key], `${object}.${key}`, indent);
		}

		return code;
	} else {
		return `${indent}write${binaryNames[f]}(writer, ${n}${f === Bin.Obj ? ', strings' : ''});\n`;
	}
}

function createWriteFunction(id: number, fields: any[], indent: string) {
	let code = `${indent}writeUint8(writer, ${id});\n`;

	for (let i = 0, j = 0; i < fields.length; i++, j++) {
		if (fields[i] === Bin.U8ArrayOffsetLength) {
			code += `${indent}writeBytesRange(writer, a${j}, a${j + 1}, a${j + 2});\n`;
			j += 2;
		} else if (fields[i] === Bin.DataViewOffsetLength) {
			code += `${indent}writeBytesRangeView(writer, a${j}, a${j + 1}, a${j + 2});\n`;
			j += 2;
		} else {
			code += writeField(fields[i], `a${j}`, indent);
		}
	}

	return code;
}

function readField(f: BinaryDefItem, indent: string) {
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
	} else if (typeof f === 'object') {
		let code = `{\n`;
		for (const key of Object.keys(f).sort()) {
			code += `${indent}  ${key}: ${readField(f[key], indent + '  ')},\n`;
		}
		return `${code}${indent}}`;
	} else {
		return `read${binaryNames[f]}(reader${f === Bin.Obj ? ', strings, false' : ''})`;
	}
}

function createReadFunction(fields: any[], indent: string) {
	let code = '';

	for (let i = 0, j = 0; i < fields.length; i++, j++) {
		if (fields[i] === Bin.U8ArrayOffsetLength) {
			code += `${indent}var a${j} = readUint8Array(reader);\n`;
			code += `${indent}var a${j + 1} = 0;\n`;
			code += `${indent}var a${j + 2} = a${j}.byteLength;\n`;
			j += 2;
		} else if (fields[i] === Bin.DataViewOffsetLength) {
			code += `${indent}var a${j} = null, a${j + 1} = 0, a${j + 2} = 0;\n`;
			code += `${indent}var a${j}_len = readLength(reader);\n`;
			code += `${indent}if (a${j}_len !== -1) {\n`;
			code += `${indent}  a${j} = reader.view;\n`;
			code += `${indent}  a${j + 1} = reader.offset;\n`;
			code += `${indent}  a${j + 2} = a${j}_len;\n`;
			code += `${indent}  reader.offset += a${j}_len;\n`;
			code += `${indent}};\n`;
			j += 2;
		} else {
			code += `${indent}var a${j} = ${readField(fields[i], indent)};\n`;
		}
	}

	return code;
}
