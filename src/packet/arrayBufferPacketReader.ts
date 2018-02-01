import { BasePacketReader } from './packetReader';
import { PacketReader } from './packetCommon';

export default class ArrayBufferPacketReader extends BasePacketReader implements PacketReader<ArrayBuffer> {
	private offset = 0;
	private view?: DataView;
	private buffer?: ArrayBuffer;
	setBuffer(buffer: ArrayBuffer) {
		this.offset = 0;
		this.buffer = buffer;
		this.view = new DataView(this.buffer);
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
}
