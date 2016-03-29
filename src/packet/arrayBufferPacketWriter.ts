import { BasePacketWriter, PacketWriter } from './packetWriter';

export default class ArrayBufferPacketWriter extends BasePacketWriter implements PacketWriter<ArrayBuffer> {
	private offset = 0;
	private view: DataView;
	private bytes: Uint8Array;
	private buffer: ArrayBuffer;
	getBuffer() {
		return this.buffer;
	}
	init(size: number) {
		this.offset = 0;
		this.buffer = new ArrayBuffer(size);
		this.view = new DataView(this.buffer);
		this.bytes = new Uint8Array(this.buffer);
	}
	writeInt8(value: number) {
		this.view.setInt8(this.offset, value);
		this.offset += 1;
	}
	writeUint8(value: number) {
		this.view.setUint8(this.offset, value);
		this.offset += 1;
	}
	writeInt16(value: number) {
		this.view.setInt16(this.offset, value);
		this.offset += 2;
	}
	writeUint16(value: number) {
		this.view.setUint16(this.offset, value);
		this.offset += 2;
	}
	writeInt32(value: number) {
		this.view.setInt32(this.offset, value);
		this.offset += 4;
	}
	writeUint32(value: number) {
		this.view.setUint32(this.offset, value);
		this.offset += 4;
	}
	writeFloat32(value: number) {
		this.view.setFloat32(this.offset, value);
		this.offset += 4;
	}
	writeFloat64(value: number) {
		this.view.setFloat64(this.offset, value);
		this.offset += 8;
	}
	writeBytes(value: Uint8Array) {
		this.bytes.set(value, this.offset);
		this.offset += value.length;
	}
}
