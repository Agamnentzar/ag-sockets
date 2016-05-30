import { BasePacketReader, PacketReader } from './packetReader';

function toUint8Array(buffer: Buffer) {
	const view = new Uint8Array(buffer.length);

	for (let i = 0; i < buffer.length; ++i)
		view[i] = buffer[i];

	return view;
}

export default class BufferPacketReader extends BasePacketReader implements PacketReader<Buffer> {
	private offset = 0;
	private buffer: Buffer = null;
	setBuffer(buffer: Buffer) {
		this.offset = 0;
		this.buffer = buffer;
	}
	readInt8() {
		this.offset += 1;
		return this.buffer.readInt8(this.offset - 1);
	}
	readUint8() {
		this.offset += 1;
		return this.buffer.readUInt8(this.offset - 1);
	}
	readInt16() {
		this.offset += 2;
		return this.buffer.readInt16BE(this.offset - 2);
	}
	readUint16() {
		this.offset += 2;
		return this.buffer.readUInt16BE(this.offset - 2);
	}
	readInt32() {
		this.offset += 4;
		return this.buffer.readInt32BE(this.offset - 4);
	}
	readUint32() {
		this.offset += 4;
		return this.buffer.readUInt32BE(this.offset - 4);
	}
	readFloat32() {
		this.offset += 4;
		return this.buffer.readFloatBE(this.offset - 4);
	}
	readFloat64() {
		this.offset += 8;
		return this.buffer.readDoubleBE(this.offset - 8);
	}
	readString() {
		const length = this.readLength();

		if (length === -1)
			return null;

		this.offset += length;
		return this.buffer.toString('utf8', this.offset - length, this.offset);
	}
	readBytes(length: number) {
		this.offset += length;
		return toUint8Array(this.buffer.slice(this.offset - length, this.offset));
	}
}
