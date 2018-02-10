import { NumberType, Consts, PacketReading, Type } from './packetCommon';
import { decodeString } from '../utf8';
import { ReadWriteAnyState } from '../interfaces';

function readShortLength(reader: PacketReading, length: number) {
	return length === 0x1f ? reader.readLength() : length;
}

export function readAny(reader: PacketReading, state: ReadWriteAnyState): any {
	const byte = reader.readUint8();
	const type = byte & 0xe0;
	const value = byte & 0x1f;

	switch (type) {
		case Type.Const:
			switch (value) {
				case Consts.Undefined: return undefined;
				case Consts.Null: return null;
				case Consts.True: return true;
				case Consts.False: return false;
				default:
					throw new Error(`Incorrect value: ${value} (${byte})`);
			}
		case Type.Number:
			switch (value) {
				case NumberType.Int8: return reader.readInt8();
				case NumberType.Uint8: return reader.readUint8();
				case NumberType.Int16: return reader.readInt16();
				case NumberType.Uint16: return reader.readUint16();
				case NumberType.Int32: return reader.readInt32();
				case NumberType.Uint32: return reader.readUint32();
				case NumberType.Float32: return reader.readFloat32();
				case NumberType.Float64: return reader.readFloat64();
				default:
					throw new Error(`Incorrect value: ${value} (${byte})`);
			}
		case Type.TinyPositiveNumber:
			return value;
		case Type.TinyNegativeNumber:
			return -(value + 1);
		case Type.String:
			const length = readShortLength(reader, value);
			const result = decodeString(reader.readBytes(length));

			if (result) {
				state.strings.push(result);
			}

			return result;
		case Type.StringRef:
			const index = readShortLength(reader, value);
			return state.strings[index];
		case Type.Array: {
			const length = readShortLength(reader, value);
			const array = [];

			for (let i = 0; i < length; i++) {
				array.push(readAny(reader, state));
			}

			return array;
		}
		case Type.Object: {
			const length = readShortLength(reader, value);
			const obj: any = {};

			for (let i = 0; i < length; i++) {
				const key = reader.readString()!;
				obj[key] = readAny(reader, state);
			}

			return obj;
		}
		default:
			throw new Error(`Incorrect type: ${type} (${byte})`);
	}
}
