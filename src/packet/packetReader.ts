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
	readArray<T>(readOne: () => T): T[];
	readString(): string;
	readObject(): any;
	readLength(): number;
}

export abstract class BasePacketReader {
	/* istanbul ignore next */
	readUint8(): number {
		throw new Error('not implemented');
	}
	/* istanbul ignore next */
	readBytes(length: number): Uint8Array {
		throw new Error('not implemented');
	}
	readBoolean() {
		return this.readUint8() === 1;
	}
	readArray<T>(readOne: () => T): T[] {
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
		const t = this.readString();
		return t == null ? null : JSON.parse(t);
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
