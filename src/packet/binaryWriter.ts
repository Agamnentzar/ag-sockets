import { encodeStringTo, stringLengthInBytes } from '../utf8';
import { Type, Special, NumberType } from './packetCommon';

export interface BinaryWriter {
	bytes: Uint8Array;
	view: DataView;
	offset: number;
}

export function createBinaryWriter(bufferOrSize: Uint8Array | number = 32): BinaryWriter {
	const bytes = typeof bufferOrSize === 'number' ? new Uint8Array(bufferOrSize) : bufferOrSize;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const offset = 0;
	return { bytes, view, offset };
}

export function writeBoolean(writer: BinaryWriter, value: boolean) {
	writeUint8(writer, value ? 1 : 0);
}

export function writeString(writer: BinaryWriter, value: string | null) {
	if (value == null) {
		writeNullLength(writer);
	} else {
		writeLength(writer, stringLengthInBytes(value));
		writeStringValue(writer, value);
	}
}

export function writeObject(writer: BinaryWriter, value: any) {
	writeAny(writer, value, new Map<string, number>());
}

export function writeUint8Array(writer: BinaryWriter, value: Uint8Array | null) {
	if (value == null) {
		writeNullLength(writer);
	} else if (value instanceof Uint8Array) {
		writeLength(writer, value.byteLength);
		writeBytes(writer, value);
	} else {
		throw new Error('Value is not Uint8Array');
	}
}

export function writeArrayBuffer(writer: BinaryWriter, value: ArrayBuffer | null) {
	if (value == null) {
		writeNullLength(writer);
	} else if (value instanceof ArrayBuffer) {
		writeLength(writer, value.byteLength);
		writeBytes(writer, new Uint8Array(value));
	} else {
		throw new Error('Value is not ArrayBuffer');
	}
}

export function writeArrayHeader<T>(writer: BinaryWriter, value: T[] | null): value is T[] {
	if (value == null) {
		writeNullLength(writer);
		return false;
	} else {
		writeLength(writer, value.length);
		return true;
	}
}

export function writeArray<T>(writer: BinaryWriter, value: T[] | null, writeOne: (writer: BinaryWriter, item: T) => void) {
	if (writeArrayHeader(writer, value)) {
		for (let i = 0; i < value.length; i++) {
			writeOne(writer, value[i]);
		}
	}
}

function writeNullLength(writer: BinaryWriter) {
	writeUint8(writer, 0);
}

export function writeLength(writer: BinaryWriter, value: number) {
	if (value < -1 || value > 0x7ffffffe) throw new Error('Invalid length value');

	value++;

	if (value === 0) {
		writeNullLength(writer);
	} else if ((value & 0xffffff80) === 0) {
		writeUint8(writer, value);
	} else if ((value & 0xffffc000) === 0) {
		const a = (value & 0x7f) | 0x80;
		const b = value >> 7;
		writeUint16(writer, (b << 8) | a);
	} else if ((value & 0xffe00000) === 0) {
		const a = (value & 0x7f) | 0x80;
		const b = ((value >> 7) & 0x7f) | 0x80;
		const c = value >> 14;
		writeUint8(writer, a);
		writeUint16(writer, (c << 8) | b);
	} else if ((value & 0xf0000000) === 0) {
		const a = (value & 0x7f) | 0x80;
		const b = ((value >> 7) & 0x7f) | 0x80;
		const c = ((value >> 14) & 0x7f) | 0x80;
		const d = value >> 21;
		writeUint32(writer, (d << 24) | (c << 16) | (b << 8) | a);
	} else {
		const a = (value & 0x7f) | 0x80;
		const b = ((value >> 7) & 0x7f) | 0x80;
		const c = ((value >> 14) & 0x7f) | 0x80;
		const d = ((value >> 21) & 0x7f) | 0x80;
		const e = value >> 28;
		writeUint8(writer, a);
		writeUint32(writer, (e << 24) | (d << 16) | (c << 8) | b);
	}
}

export function getWriterBuffer({ bytes, offset }: BinaryWriter) {
	return new Uint8Array(bytes.buffer, bytes.byteOffset, offset);
}

export function resetWriter(writer: BinaryWriter) {
	writer.offset = 0;
}

export function resizeWriter(writer: BinaryWriter) {
	writer.offset = 0;
	writer.bytes = new Uint8Array(writer.bytes.byteLength * 2);
	writer.view = new DataView(writer.bytes.buffer);
}

export function writeInt8(writer: BinaryWriter, value: number) {
	writer.view.setInt8(writer.offset, value | 0);
	writer.offset += 1;
}

export function writeUint8(writer: BinaryWriter, value: number) {
	writer.view.setUint8(writer.offset, value | 0);
	writer.offset += 1;
}

export function writeInt16(writer: BinaryWriter, value: number) {
	writer.view.setInt16(writer.offset, value | 0, true);
	writer.offset += 2;
}

export function writeUint16(writer: BinaryWriter, value: number) {
	writer.view.setUint16(writer.offset, value | 0, true);
	writer.offset += 2;
}

export function writeInt32(writer: BinaryWriter, value: number) {
	writer.view.setInt32(writer.offset, value | 0, true);
	writer.offset += 4;
}

export function writeUint32(writer: BinaryWriter, value: number) {
	writer.view.setUint32(writer.offset, value | 0, true);
	writer.offset += 4;
}

export function writeFloat32(writer: BinaryWriter, value: number) {
	writer.view.setFloat32(writer.offset, +value, true);
	writer.offset += 4;
}

export function writeFloat64(writer: BinaryWriter, value: number) {
	writer.view.setFloat64(writer.offset, +value, true);
	writer.offset += 8;
}

export function writeBytesRange(writer: BinaryWriter, value: Uint8Array, offset: number, length: number) {
	writeLength(writer, length);
	const bytes = writer.bytes;

	if ((writer.offset + length) > bytes.byteLength) {
		throw new Error('Exceeded DataView size');
	}

	if (length <= 64) {
		let dst = writer.offset;
		let src = offset;

		for (const dstEnd = dst + length; dst < dstEnd; dst++, src++) {
			bytes[dst] = value[src];
		}
	} else {
		bytes.set(value.subarray(offset, offset + length), writer.offset);
	}

	writer.offset += length;
}

export function writeBytes(writer: BinaryWriter, value: Uint8Array) {
	if ((writer.offset + value.byteLength) > writer.bytes.byteLength) {
		throw new Error('Exceeded DataView size');
	}

	writer.bytes.set(value, writer.offset);
	writer.offset += value.byteLength;
}

export function writeStringValue(writer: BinaryWriter, value: string) {
	writer.offset = encodeStringTo(writer.bytes, writer.offset, value);

	if (writer.offset > writer.bytes.byteLength) {
		throw new Error('Exceeded DataView size');
	}
}

const floats = new Float32Array(1);

function writeShortLength(writer: BinaryWriter, type: Type, length: number) {
	if (length < 31) {
		writeUint8(writer, type | length);
		return true;
	} else {
		writeUint8(writer, type | 0x1f);
		writeLength(writer, length);
		return false;
	}
}

export function writeAny(writer: BinaryWriter, value: any, strings: Map<string, number>) {
	if (value === undefined) {
		writeUint8(writer, Type.Special | Special.Undefined);
	} else if (value === null) {
		writeUint8(writer, Type.Special | Special.Null);
	} else if (value === true) {
		writeUint8(writer, Type.Special | Special.True);
	} else if (value === false) {
		writeUint8(writer, Type.Special | Special.False);
	} else if (typeof value === 'number') {
		if ((value >>> 0) === value) {
			value = value >>> 0;

			if (value & 0xffff0000) {
				writeUint8(writer, Type.Number | NumberType.Uint32);
				writeUint32(writer, value);
			} else if (value & 0xff00) {
				writeUint8(writer, Type.Number | NumberType.Uint16);
				writeUint16(writer, value);
			} else if (value & 0xe0) {
				writeUint8(writer, Type.Number | NumberType.Uint8);
				writeUint8(writer, value);
			} else {
				writeUint8(writer, Type.TinyPositiveNumber | value);
			}
		} else if ((value | 0) === value) {
			value = value | 0;

			if (value > -32 && value <= -1) {
				writeUint8(writer, Type.TinyNegativeNumber | (-value - 1));
			} else if (value >= -128 && value <= 127) {
				writeUint8(writer, Type.Number | NumberType.Int8);
				writeInt8(writer, value);
			} else if (value >= -32768 && value <= 32767) {
				writeUint8(writer, Type.Number | NumberType.Int16);
				writeInt16(writer, value);
			} else {
				writeUint8(writer, Type.Number | NumberType.Int32);
				writeInt32(writer, value);
			}
		} else {
			floats[0] = value;

			if (floats[0] === value) {
				writeUint8(writer, Type.Number | NumberType.Float32);
				writeFloat32(writer, value);
			} else {
				writeUint8(writer, Type.Number | NumberType.Float64);
				writeFloat64(writer, value);
			}
		}
	} else if (typeof value === 'string') {
		const index = strings.get(value);

		if (index !== undefined) {
			writeShortLength(writer, Type.StringRef, index);
		} else {
			const length = stringLengthInBytes(value);
			writeShortLength(writer, Type.String, length);
			writeStringValue(writer, value);

			if (value) {
				strings.set(value, strings.size);
			}
		}
	} else if (Array.isArray(value)) {
		const length = value.length;
		writeShortLength(writer, Type.Array, length);

		for (let i = 0; i < length; i++) {
			writeAny(writer, value[i], strings);
		}
	} else if (typeof value === 'object') {
		if (value instanceof Uint8Array) {
			writeUint8(writer, Type.Special | Special.Uint8Array);
			writeUint8Array(writer, value);
		} else {
			const keys = Object.keys(value);
			writeShortLength(writer, Type.Object, keys.length);

			for (let i = 0; i < keys.length; i++) {
				const key = keys[i];
				const index = strings.get(key);

				if (index === undefined) {
					writeLength(writer, stringLengthInBytes(key));
					writeStringValue(writer, key);

					if (key) {
						strings.set(key, strings.size);
					}
				} else {
					writeLength(writer, 0);
					writeLength(writer, index);
				}

				writeAny(writer, value[key], strings);
			}
		}
	} else {
		throw new Error(`Invalid type: ${value}`);
	}
}

declare const IndexSizeError: any;

export function isSizeError(e: Error) {
	if (typeof RangeError !== 'undefined' && e instanceof RangeError) return true;
	if (typeof TypeError !== 'undefined' && e instanceof TypeError) return true;
	if (typeof IndexSizeError !== 'undefined' && e instanceof IndexSizeError) return true;
	if (/DataView/.test(e.message)) return true;
	return false;
}

export function writeWithResize(writer: BinaryWriter, write: () => void) {
	while (true) {
		try {
			write();
			break;
		} catch (e) {
			if (isSizeError(e)) {
				resizeWriter(writer);
			} else {
				throw e;
			}
		}
	}
}
