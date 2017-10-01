import { decodeString } from '../utf8';

export interface PacketReader<TBuffer> {
	setBuffer(buffer: TBuffer): void;
	readInt8(): number;
	readUint8(): number;
	readInt16(): number;
	readUint16(): number;
	readInt32(): number;
	readUint32(): number;
	readFloat32(): number;
	readFloat64(): number;
	readBoolean(): boolean;
	readBytes(length: number): Uint8Array;
	readArray<T>(readOne: () => T): T[] | null;
	readString(): string | null;
	readObject(): any;
	readArrayBuffer(): ArrayBuffer | null;
	readLength(): number;
}

export abstract class BasePacketReader {
	abstract readUint8(): number;
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
		const json = this.readString();
		return json ? JSON.parse(json) : null;
	}
	readArrayBuffer() {
		const length = this.readLength();
		return length === -1 ? null : this.readBytes(length).buffer;
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
}
