import { Packets, Bin } from '../interfaces';
import {
	writeUint8, writeInt16, writeUint16, writeUint32, writeInt32, writeFloat64, writeFloat32, writeBoolean,
	writeString, writeObject, writeArrayBuffer, writeUint8Array, writeInt8, writeArray, writeArrayHeader,
	writeBytes, resizeWriter,
} from './binaryWriter';
import {
	readInt8, readUint8, readUint16, readInt16, readUint32, readInt32, readFloat32, readFloat64, readBoolean,
	readString, readObject, readArrayBuffer, readUint8Array, readArray, readBytes, BinaryReader
} from './binaryReader';

interface Result {
	code: string;
}

export const binaryNames: string[] = [];
binaryNames[Bin.U8] = 'Uint8';
binaryNames[Bin.I8] = 'Int8';
binaryNames[Bin.U16] = 'Uint16';
binaryNames[Bin.I16] = 'Int16';
binaryNames[Bin.U32] = 'Uint32';
binaryNames[Bin.I32] = 'Int32';
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

export const readerMethods = {
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

export const writerMethods = {
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
};

export const readerWriterMethods = {
	...readerMethods,
	...writerMethods,
};

let id = 0;

function writeField(obj: Result, f: Bin | any[], n: string, indent: string) {
	if (f instanceof Array) {
		const thisId = ++id;
		const it = `i${thisId}`;
		const array = `array${thisId}`;
		const item = `item${thisId}`;

		obj.code += `${indent}var ${array} = ${n}\n`;
		obj.code += `${indent}if (writeArrayHeader(writer, ${array})) {\n`;
		obj.code += `${indent}\tfor(var ${it} = 0; ${it} < ${array}.length; ${it}++) {\n`;
		obj.code += `${indent}\t\tvar ${item} = ${array}[${it}];\n`;

		if (f.length === 1) {
			writeField(obj, f[0], item, indent + '\t\t');
		} else {
			for (let i = 0; i < f.length; i++) {
				writeField(obj, f[i], `${item}[${i}]`, indent + '\t\t');
			}
		}

		obj.code += `${indent}\t}\n`;
		obj.code += `${indent}}\n`;
	} else {
		obj.code += `${indent}write${binaryNames[f]}(writer, ${n});\n`;
	}
}

function createWriteFunction(fields: any[]) {
	const obj = { code: '', size: 1 };

	obj.code += '\t\twriteUint8(writer, args[0]);\n';

	for (let i = 0; i < fields.length; i++) {
		writeField(obj, fields[i], `args[${i + 1}]`, '\t\t');
	}

	return `function (writer, args) {\n${obj.code}\t}`;
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

function createReadFunction(fields: any[]) {
	let code = '';

	for (let i = 0; i < fields.length; i++)
		code += `\t\tresult.push(${readField(fields[i], '\t\t')});\n`;

	return `function (reader, result) {\n${code}\t}`;
}

export function createHandlers(writeFields: Packets, readFields: Packets): any {
	const writeLines = Object.keys(writeFields)
		.map(key => key + ': ' + createWriteFunction(writeFields[key]));

	const readLines = Object.keys(readFields)
		.map(key => key + ': ' + createReadFunction(readFields[key]));

	const code =
		`${Object.keys(readerWriterMethods).map(key => `var ${key} = methods.${key};`).join('\n')}\n\n`
		+ `var write = {\n\t${writeLines.join(',\n\t')}\n};\n\n`
		+ `var read = {\n\t${readLines.join(',\n\t')}\n};\n\n`
		+ `return { write: write, read: read };`;

	return (new Function('methods', code))(readerWriterMethods);
}
