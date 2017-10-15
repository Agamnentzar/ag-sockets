import { PacketWriting, measureString, measureLength } from './packetCommon';
import { stringLengthInBytes } from '../utf8';

export class MeasuringWriter implements PacketWriting {
	private size = 0;
	reset() {
		this.size = 0;
	}
	getSize() {
		return this.size;
	}
	writeInt8() {
		this.size += 1;
	}
	writeUint8() {
		this.size += 1;
	}
	writeInt16() {
		this.size += 2;
	}
	writeUint16() {
		this.size += 2;
	}
	writeInt32() {
		this.size += 4;
	}
	writeUint32() {
		this.size += 4;
	}
	writeFloat32() {
		this.size += 4;
	}
	writeFloat64() {
		this.size += 8;
	}
	writeString(value: string | null) {
		this.size += measureString(value);
	}
	writeLength(value: number) {
		this.size += measureLength(value);
	}
	writeStringValue(value: string) {
		this.size += stringLengthInBytes(value);
	}
}
