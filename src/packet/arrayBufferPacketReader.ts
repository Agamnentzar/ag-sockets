import { PacketReader } from './packetCommon';
import { decodeString } from '../utf8';
import { readAny } from './readAny';

export class ArrayBufferPacketReader implements PacketReader {
	private offset = 0;
	private view: DataView | undefined = undefined;
	setBuffer(buffer: Uint8Array) {
		this.offset = buffer.byteOffset;
		this.view = new DataView(buffer.buffer);
	}
	done() {
		this.view = undefined;
	}
	readInt8() {
		this.offset += 1;
		return this.view!.getInt8(this.offset - 1);
	}
	readUint8() {
		this.offset += 1;
		return this.view!.getUint8(this.offset - 1);
	}
	readInt16() {
		this.offset += 2;
		return this.view!.getInt16(this.offset - 2);
	}
	readUint16() {
		this.offset += 2;
		return this.view!.getUint16(this.offset - 2);
	}
	readInt32() {
		this.offset += 4;
		return this.view!.getInt32(this.offset - 4);
	}
	readUint32() {
		this.offset += 4;
		return this.view!.getUint32(this.offset - 4);
	}
	readFloat32() {
		this.offset += 4;
		return this.view!.getFloat32(this.offset - 4);
	}
	readFloat64() {
		this.offset += 8;
		return this.view!.getFloat64(this.offset - 8);
	}
	readBytes(length: number) {
		this.offset += length;
		return new Uint8Array(this.view!.buffer, this.offset - length, length);
	}
	readArrayBuffer() {
		const length = this.readLength();

		if (length === -1) {
			return null;
		} else {
			this.offset += length;
			return this.view!.buffer.slice(this.offset - length, this.offset);
		}
	}
	readBoolean() {
		return this.readUint8() === 1;
	}
	readArray<T>(readOne: () => T): T[] | null {
		const length = this.readLength();

		if (length === -1)
			return null;

		const result: T[] = [];

		for (let i = 0; i < length; i++) {
			result.push(readOne());
		}

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
