import { decodeString } from '../utf8';
import { readAny } from './readAny';
import { PacketReading } from './packetCommon';

export abstract class BasePacketReader implements PacketReading {
	abstract readInt8(): number;
	abstract readUint8(): number;
	abstract readInt16(): number;
	abstract readUint16(): number;
	abstract readInt32(): number;
	abstract readUint32(): number;
	abstract readFloat32(): number;
	abstract readFloat64(): number;
	abstract readFloat64(): number;
	abstract readBytes(length: number): Uint8Array;
	readBoolean() {
		return this.readUint8() === 1;
	}
	readArray<T>(readOne: () => T): T[] | null {
		const length = this.readLength();

		if (length === -1)
			return null;

		const result = new Array<T>(length);

		for (let i = 0; i < length; i++)
			result[i] = readOne();

		return result;
	}
	readString() {
		const length = this.readLength();
		return length === -1 ? null : decodeString(this.readBytes(length));
	}
	readObject() {
		return readAny(this, { strings: [] });
	}
	readLength() {
		let length = 0;
		let shift = 0;
		let bytes = 0;

		do {
			var a = this.readUint8();
			length = length | ((a & 0x7f) << shift);
			shift += 7;
			bytes++;
		} while (a & 0x80);

		return bytes === 2 && length === 0 ? -1 : length;
	}
	readUint8Array() {
		const length = this.readLength();

		if (length === -1) {
			return null;
		} else {
			return this.readBytes(length);
		}
	}
}
