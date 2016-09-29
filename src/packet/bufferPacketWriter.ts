import { BasePacketWriter, PacketWriter } from './packetWriter';

export default class BufferPacketWriter extends BasePacketWriter implements PacketWriter<Buffer> {
	private offset = 0;
	private buffer: Buffer;
	getBuffer() {
		return this.buffer;
	}
	init(size: number) {
		this.buffer = new Buffer(size);
		this.offset = 0;
	}
	writeInt8(value: number) {
		this.buffer.writeInt8(value, this.offset);
		this.offset += 1;
	}
	writeUint8(value: number) {
		this.buffer.writeUInt8(value, this.offset);
		this.offset += 1;
	}
	writeInt16(value: number) {
		this.buffer.writeInt16BE(value, this.offset);
		this.offset += 2;
	}
	writeUint16(value: number) {
		this.buffer.writeUInt16BE(value, this.offset);
		this.offset += 2;
	}
	writeInt32(value: number) {
		this.buffer.writeInt32BE(value, this.offset);
		this.offset += 4;
	}
	writeUint32(value: number) {
		this.buffer.writeUInt32BE(value, this.offset);
		this.offset += 4;
	}
	writeFloat32(value: number) {
		this.buffer.writeFloatBE(value, this.offset);
		this.offset += 4;
	}
	writeFloat64(value: number) {
		this.buffer.writeDoubleBE(value, this.offset);
		this.offset += 8;
	}
	writeBytes(value: Uint8Array) {
		const offset = this.offset;
		this.offset += value.length;

		for (let i = 0; i < value.length; i++)
			this.buffer[i + offset] = value[i];
	}
}
