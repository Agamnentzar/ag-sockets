import { decodeString } from '../utf8';
import { Special, Type, NumberType } from './packetCommon';

export interface BinaryReader {
	view: DataView;
	offset: number;
}

export function createBinaryReader(buffer: Uint8Array): BinaryReader {
	const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
	const offset = 0;
	return { view, offset };
}

export function createBinaryReaderFromBuffer(buffer: ArrayBuffer, byteOffset: number, byteLength: number): BinaryReader {
	const view = new DataView(buffer, byteOffset, byteLength);
	const offset = 0;
	return { view, offset };
}

export function getBinaryReaderBuffer(reader: BinaryReader) {
	return new Uint8Array(reader.view.buffer, reader.view.byteOffset, reader.view.byteLength);
}

export function readInt8(reader: BinaryReader) {
	const offset = reader.offset;
	reader.offset += 1;
	return reader.view.getInt8(offset);
}

export function readUint8(reader: BinaryReader) {
	const offset = reader.offset;
	reader.offset += 1;
	return reader.view.getUint8(offset);
}

export function readInt16(reader: BinaryReader) {
	const offset = reader.offset;
	reader.offset += 2;
	return reader.view.getInt16(offset, true);
}

export function readUint16(reader: BinaryReader) {
	const offset = reader.offset;
	reader.offset += 2;
	return reader.view.getUint16(offset, true);
}

export function readInt32(reader: BinaryReader) {
	const offset = reader.offset;
	reader.offset += 4;
	return reader.view.getInt32(offset, true);
}

export function readUint32(reader: BinaryReader) {
	const offset = reader.offset;
	reader.offset += 4;
	return reader.view.getUint32(offset, true);
}

export function readFloat32(reader: BinaryReader) {
	const offset = reader.offset;
	reader.offset += 4;
	return reader.view.getFloat32(offset, true);
}

export function readFloat64(reader: BinaryReader) {
	const offset = reader.offset;
	reader.offset += 8;
	return reader.view.getFloat64(offset, true);
}

export function readBytes(reader: BinaryReader, length: number) {
	const offset = reader.offset;
	reader.offset += length;
	return new Uint8Array(reader.view.buffer, reader.view.byteOffset + offset, length);
}

export function readArrayBuffer(reader: BinaryReader) {
	const length = readLength(reader);
	if (length === -1) return null;

	const offset = reader.offset;
	reader.offset += length;
	return reader.view.buffer.slice(reader.view.byteOffset + offset, offset + length);
}

export function readBoolean(reader: BinaryReader) {
	return readUint8(reader) === 1;
}

export function readArray<T>(reader: BinaryReader, readOne: (reader: BinaryReader) => T): T[] | null {
	const length = readLength(reader);

	if (length === -1) return null;

	const result: T[] = [];

	for (let i = 0; i < length; i++) {
		result.push(readOne(reader));
	}

	return result;
}

export function readString(reader: BinaryReader) {
	const length = readLength(reader);
	if (length === -1) return null;
	const result = decodeString(reader.view, reader.offset, length);
	reader.offset += length;
	return result;
}

export function readObject(reader: BinaryReader, cloneTypedArrays = false) {
	return readAny(reader, [], cloneTypedArrays);
}

export function readLength(reader: BinaryReader) {
	let length = 0;
	let shift = 0;
	let b = 0;

	do {
		b = readUint8(reader);
		length = length | ((b & 0x7f) << shift);
		shift += 7;
	} while (b & 0x80);

	return length - 1;
}

export function readUint8Array(reader: BinaryReader) {
	const length = readLength(reader);
	if (length === -1) return null;
	return readBytes(reader, length);
}

function readShortLength(reader: BinaryReader, length: number) {
	return length === 0x1f ? readLength(reader) : length;
}

export function readAny(reader: BinaryReader, strings: string[], cloneTypedArrays: boolean): any {
	const byte = readUint8(reader);
	const type = byte & 0xe0;
	const value = byte & 0x1f;

	switch (type) {
		case Type.Special:
			switch (value) {
				case Special.Undefined: return undefined;
				case Special.Null: return null;
				case Special.True: return true;
				case Special.False: return false;
				case Special.Uint8Array: {
					const value = readUint8Array(reader);
					if (value && cloneTypedArrays) return value.slice();
					return value;
				}
				default: throw new Error(`Incorrect value (${value}, ${byte})`);
			}
		case Type.Number:
			switch (value) {
				case NumberType.Int8: return readInt8(reader);
				case NumberType.Uint8: return readUint8(reader);
				case NumberType.Int16: return readInt16(reader);
				case NumberType.Uint16: return readUint16(reader);
				case NumberType.Int32: return readInt32(reader);
				case NumberType.Uint32: return readUint32(reader);
				case NumberType.Float32: return readFloat32(reader);
				case NumberType.Float64: return readFloat64(reader);
				default: throw new Error(`Incorrect value (${value}, ${byte})`);
			}
		case Type.TinyPositiveNumber:
			return value;
		case Type.TinyNegativeNumber:
			return -(value + 1);
		case Type.String: {
			const length = readShortLength(reader, value);
			const result = decodeString(reader.view, reader.offset, length)!;
			reader.offset += length;
			strings.push(result);
			return result;
		}
		case Type.StringRef: {
			const index = readShortLength(reader, value);
			return strings[index];
		}
		case Type.Array: {
			const length = readShortLength(reader, value);
			const array = [];

			for (let i = 0; i < length; i++) {
				array.push(readAny(reader, strings, cloneTypedArrays));
			}

			return array;
		}
		case Type.Object: {
			const length = readShortLength(reader, value);
			const obj: any = {};

			for (let i = 0; i < length; i++) {
				const length = readLength(reader);
				let key;

				if (length) {
					key = decodeString(reader.view, reader.offset, length)!;
					reader.offset += length;
					strings.push(key);
				} else {
					const index = readLength(reader);
					key = strings[index];
				}

				obj[key] = readAny(reader, strings, cloneTypedArrays);
			}

			return obj;
		}
		default: throw new Error(`Incorrect type (${type}, ${byte})`);
	}
}
