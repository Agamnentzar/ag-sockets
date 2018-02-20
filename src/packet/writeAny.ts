import { PacketWriting, Type, Consts, NumberType } from './packetCommon';
import { stringLengthInBytes } from '../utf8';
import { ReadWriteAnyState } from '../interfaces';

const floats = new Float32Array(1);

function writeShortLength(writer: PacketWriting, type: Type, length: number) {
	if (length < 31) {
		writer.writeUint8(type | length);
		return true;
	} else {
		writer.writeUint8(type | 0x1f);
		writer.writeLength(length);
		return false;
	}
}

export function writeAny(writer: PacketWriting, value: any, state: ReadWriteAnyState) {
	if (value === undefined) {
		writer.writeUint8(Type.Const | Consts.Undefined);
	} else if (value === null) {
		writer.writeUint8(Type.Const | Consts.Null);
	} else if (value === true) {
		writer.writeUint8(Type.Const | Consts.True);
	} else if (value === false) {
		writer.writeUint8(Type.Const | Consts.False);
	} else if (typeof value === 'number') {
		if ((value >>> 0) === value) {
			value = value >>> 0;

			if (value & 0xffff0000) {
				writer.writeUint8(Type.Number | NumberType.Uint32);
				writer.writeUint32(value);
			} else if (value & 0xff00) {
				writer.writeUint8(Type.Number | NumberType.Uint16);
				writer.writeUint16(value);
			} else if (value & 0xe0) {
				writer.writeUint8(Type.Number | NumberType.Uint8);
				writer.writeUint8(value);
			} else {
				writer.writeUint8(Type.TinyPositiveNumber | value);
			}
		} else if ((value | 0) === value) {
			value = value | 0;

			if (value > -32 && value <= -1) {
				writer.writeUint8(Type.TinyNegativeNumber | (-value - 1));
			} else if (value >= -128 && value <= 127) {
				writer.writeUint8(Type.Number | NumberType.Int8);
				writer.writeInt8(value);
			} else if (value >= -32768 && value <= 32767) {
				writer.writeUint8(Type.Number | NumberType.Int16);
				writer.writeInt16(value);
			} else {
				writer.writeUint8(Type.Number | NumberType.Int32);
				writer.writeInt32(value);
			}
		} else {
			floats[0] = value;

			if (floats[0] === value) {
				writer.writeUint8(Type.Number | NumberType.Float32);
				writer.writeFloat32(value);
			} else {
				writer.writeUint8(Type.Number | NumberType.Float64);
				writer.writeFloat64(value);
			}
		}
	} else if (typeof value === 'string') {
		const index = state.strings.indexOf(value);

		if (index !== -1) {
			writeShortLength(writer, Type.StringRef, index);
		} else {
			const length = stringLengthInBytes(value);
			writeShortLength(writer, Type.String, length);
			writer.writeStringValue(value);

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
				writer.writeLength(stringLengthInBytes(key));
				writer.writeStringValue(key);

				if (key) {
					state.strings.push(key);
				}
			} else {
				writer.writeLength(0);
				writer.writeLength(index);
			}

			writeAny(writer, value[key], state);
		}
	} else {
		throw new Error(`Invalid type: ${value}`);
	}
}
