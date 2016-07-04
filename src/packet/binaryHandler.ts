import { Packets } from '../interfaces';

interface CodeSize {
	code: string;
	size: number;
}

const sizes: { [key: string]: number } = {
	Int8: 1,
	Uint8: 1,
	Int16: 2,
	Uint16: 2,
	Int32: 4,
	Uint32: 4,
	Float32: 4,
	Float64: 8,
	Boolean: 1,
};

function writeFieldSize(f: string | any[], n: string, indent: string): any {
	if (f instanceof Array) {
		if (f.some(x => x === 'Object' || x === 'String' || Array.isArray(x))) {
			let code = '';
			let size = 0;

			if (f.length === 1) {
				const s = writeFieldSize(f[0], `item`, indent + '\t');

				if (isNaN(s))
					code += `\n${indent}\t+ ${s}`;
				else
					size += s;
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
		} else {
			return `writer.measureSimpleArray(${n}, ${f.reduce((sum, x) => sum + sizes[x], 0)})`;
		}
	} else {
		if (f === 'Object' || f === 'String') {
			return `writer.measure${f}(${n})`;
		} else {
			return sizes[f];
		}
	}
}

function writeField(obj: CodeSize, f: string | any[], n: string, indent: string) {
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
		obj.code += `${indent}writer.write${f}(${n});\n`;
	}
}

function createWriteFunction(fields: any[]) {
	const obj = { code: '', size: 1 };

	for (let i = 0; i < fields.length; i++) {
		const size = writeFieldSize(fields[i], `args[${i}]`, '\t\t');

		if (isNaN(size))
			obj.code += `\t\tsize += ${size};\n`;
		else
			obj.size += size;
	}

	obj.code += '\t\twriter.init(size);\n';
	obj.code += '\t\twriter.writeUint8(id);\n';

	for (let i = 0; i < fields.length; i++)
		writeField(obj, fields[i], `args[${i}]`, '\t\t');

	return `function (writer, id, args) {\n\t\tvar size = ${obj.size};\n${obj.code}\t}`;
}

function readField(f: string | any[], indent: string) {
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
		return `reader.read${f}()`;
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
