import { encodeStringTo, stringLengthInBytes } from '../utf8';
import { Type, Consts, NumberType } from './packetCommon';
import { ReadWriteAnyState } from '../interfaces';

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
		writeLength(writer, -1);
	} else {
		writeLength(writer, stringLengthInBytes(value));
		writeStringValue(writer, value);
	}
}

export function writeObject(writer: BinaryWriter, value: any) {
	writeAny(writer, value, { strings: [] });
}

export function writeUint8Array(writer: BinaryWriter, value: Uint8Array | null) {
	if (value == null) {
		writeLength(writer, -1);
	} else {
		writeLength(writer, value.byteLength);
		writeBytes(writer, value);
	}
}

export function writeArrayBuffer(writer: BinaryWriter, value: ArrayBuffer | null) {
	if (value == null) {
		writeLength(writer, -1);
	} else {
		writeLength(writer, value.byteLength);
		writeBytes(writer, new Uint8Array(value));
	}
}

export function writeArray<T>(writer: BinaryWriter, value: T[] | null, writeOne: (item: T) => void) {
	if (value == null) {
		writeLength(writer, -1);
	} else {
		writeLength(writer, value.length);
		value.forEach(writeOne);
	}
}

export function writeLength(writer: BinaryWriter, value: number) {
	if (value === -1) {
		writeUint8(writer, 0x80);
		writeUint8(writer, 0x00);
	} else {
		do {
			writeUint8(writer, (value & 0x7f) | ((value >> 7) ? 0x80 : 0x00));
			value = value >> 7;
		} while (value);
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
	writer.view!.setInt8(writer.offset, value);
	writer.offset += 1;
}

export function writeUint8(writer: BinaryWriter, value: number) {
	writer.view!.setUint8(writer.offset, value);
	writer.offset += 1;
}

export function writeInt16(writer: BinaryWriter, value: number) {
	writer.view!.setInt16(writer.offset, value);
	writer.offset += 2;
}

export function writeUint16(writer: BinaryWriter, value: number) {
	writer.view!.setUint16(writer.offset, value);
	writer.offset += 2;
}

export function writeInt32(writer: BinaryWriter, value: number) {
	writer.view!.setInt32(writer.offset, value);
	writer.offset += 4;
}

export function writeUint32(writer: BinaryWriter, value: number) {
	writer.view!.setUint32(writer.offset, value);
	writer.offset += 4;
}

export function writeFloat32(writer: BinaryWriter, value: number) {
	writer.view!.setFloat32(writer.offset, value);
	writer.offset += 4;
}

export function writeFloat64(writer: BinaryWriter, value: number) {
	writer.view!.setFloat64(writer.offset, value);
	writer.offset += 8;
}

export function writeBytes(writer: BinaryWriter, value: Uint8Array) {
	writer.bytes!.set(value, writer.offset);
	writer.offset += value.length;
}

export function writeStringValue(writer: BinaryWriter, value: string) {
	writer.offset = encodeStringTo(writer.bytes!, writer.offset, value);
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

export function writeAny(writer: BinaryWriter, value: any, state: ReadWriteAnyState) {
	if (value === undefined) {
		writeUint8(writer, Type.Const | Consts.Undefined);
	} else if (value === null) {
		writeUint8(writer, Type.Const | Consts.Null);
	} else if (value === true) {
		writeUint8(writer, Type.Const | Consts.True);
	} else if (value === false) {
		writeUint8(writer, Type.Const | Consts.False);
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
		const index = state.strings.indexOf(value);

		if (index !== -1) {
			writeShortLength(writer, Type.StringRef, index);
		} else {
			const length = stringLengthInBytes(value);
			writeShortLength(writer, Type.String, length);
			writeStringValue(writer, value);

			if (value) {
				state.strings.push(value);
			}
		}
	} else if (Array.isArray(value)) {
		const length = value.length;
		writeShortLength(writer, Type.Array, length);

		for (let i = 0; i < length; i++) {
			writeAny(writer, value[i], state);
		}
	} else if (typeof value === 'object') {
		const keys = Object.keys(value);
		writeShortLength(writer, Type.Object, keys.length);

		for (let i = 0; i < keys.length; i++) {
			const key = keys[i];
			const index = state.strings.indexOf(key);

			if (index === -1) {
				writeLength(writer, stringLengthInBytes(key));
				writeStringValue(writer, key);

				if (key) {
					state.strings.push(key);
				}
			} else {
				writeLength(writer, 0);
				writeLength(writer, index);
			}

			writeAny(writer, value[key], state);
		}
	} else {
		throw new Error(`Invalid type: ${value}`);
	}
}
