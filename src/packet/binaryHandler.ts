import { Packets, Bin } from '../interfaces';

interface CodeSize {
	code: string;
	size: number;
}

const sizes: number[] = [];
sizes[Bin.U8] = 1;
sizes[Bin.I8] = 1;
sizes[Bin.U16] = 2;
sizes[Bin.I16] = 2;
sizes[Bin.U32] = 4;
sizes[Bin.I32] = 4;
sizes[Bin.F32] = 4;
sizes[Bin.F64] = 8;
sizes[Bin.Bool] = 1;

const names: string[] = [];
names[Bin.U8] = 'Uint8';
names[Bin.I8] = 'Int8';
names[Bin.U16] = 'Uint16';
names[Bin.I16] = 'Int16';
names[Bin.U32] = 'Uint32';
names[Bin.I32] = 'Int32';
names[Bin.F32] = 'Float32';
names[Bin.F64] = 'Float64';
names[Bin.Bool] = 'Boolean';
names[Bin.Str] = 'String';
names[Bin.Obj] = 'Object';
names[Bin.Buffer] = 'ArrayBuffer';

function isBinArray(array: (Bin | any[])[]): array is Bin[] {
	return !array.some(x => x === Bin.Obj || x === Bin.Str || x === Bin.Buffer || Array.isArray(x));
}

function writeFieldSize(f: Bin | Bin[] | any[], n: string, indent: string): any {
	if (f instanceof Array) {
		if (isBinArray(f)) {
			return `writer.measureSimpleArray(${n}, ${f.reduce((sum, x) => sum + sizes[x], 0)})`;
		} else {
			let code = '';
			let size = 0;

			if (f.length === 1) {
				code += `\n${indent}\t+ ${writeFieldSize(f[0], `item`, indent + '\t')}`;
			} else {
				for (let i = 0; i < f.length; i++) {
					const s = writeFieldSize(f[i], `item[${i}]`, indent + '\t');

					if (isNaN(s))
						code += `\n${indent}\t+ ${s}`;
					else
						size += s;
				}
			}

			return `writer.measureArray(${n}, function (item) { return ${size}${code}; })`;
		}
	} else {
		if (f === Bin.Obj || f === Bin.Str || f === Bin.Buffer) {
			return `writer.measure${names[f]}(${n})`;
		} else {
			return sizes[f];
		}
	}
}

function writeField(obj: CodeSize, f: Bin | any[], n: string, indent: string) {
	if (f instanceof Array) {
		if (f.length === 1) {
			obj.code += `${indent}writer.writeArray(${n}, function (item) {\n`;
			writeField(obj, f[0], 'item', indent + '\t');
			obj.code += `${indent}});\n`;
		} else {
			obj.code += `${indent}writer.writeArray(${n}, function (item) {\n`;

			for (let i = 0; i < f.length; i++)
				writeField(obj, f[i], `item[${i}]`, indent + '\t');

			obj.code += `${indent}});\n`;
		}
	} else {
		obj.code += `${indent}writer.write${names[f]}(${n});\n`;
	}
}

function createWriteFunction(fields: any[]) {
	const obj = { code: '', size: 1 };

	for (let i = 0; i < fields.length; i++) {
		const size = writeFieldSize(fields[i], `args[${i + 1}]`, '\t\t');

		if (isNaN(size))
			obj.code += `\t\tsize += ${size};\n`;
		else
			obj.size += size;
	}

	obj.code += '\t\twriter.init(size);\n';
	obj.code += '\t\twriter.writeUint8(args[0]);\n';

	for (let i = 0; i < fields.length; i++)
		writeField(obj, fields[i], `args[${i + 1}]`, '\t\t');

	return `function (writer, args) {\n\t\tvar size = ${obj.size};\n${obj.code}\t}`;
}

function readField(f: Bin | any[], indent: string) {
	if (f instanceof Array) {
		let code = '';

		if (f.length === 1) {
			code += `\n${indent}\t${readField(f[0], indent + '\t')}\n${indent}`;
		} else {
			code += '[\n';

			for (let i = 0; i < f.length; i++)
				code += `${indent}\t${readField(f[i], indent + '\t')},\n`;

			code += `${indent}]`;
		}

		return `reader.readArray(function () { return ${code.trim()}; })`;
	} else {
		return `reader.read${names[f]}()`;
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

	const code = 'var write = {\n\t' + writeLines.join(',\n\t') + '\n};\n\n'
		+ 'var read = {\n\t' + readLines.join(',\n\t') + '\n};\n\n'
		+ 'return { write: write, read: read };';

	return (new Function(code))();
}
