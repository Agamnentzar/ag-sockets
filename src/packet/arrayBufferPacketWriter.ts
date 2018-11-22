import { encodeStringTo, stringLengthInBytes } from '../utf8';
import { PacketWriter, measureString, measureUint8Array, measureArrayBuffer, measureLength } from './packetCommon';
import { MeasuringWriter } from './measuringWriter';
import { writeAny } from './writeAny';

export class ArrayBufferPacketWriter implements PacketWriter {
	private offset = 0;
	private view?: DataView;
	private bytes?: Uint8Array;
	private measuring = new MeasuringWriter();
	private measureAny(value: any) {
		this.measuring.reset();
		writeAny(this.measuring, value, { strings: [] });
		return this.measuring.getSize();
	}
	measureString(value: string) {
		return measureString(value);
	}
	measureObject(value: any) {
		return this.measureAny(value);
	}
	measureUint8Array(value: Uint8Array | null) {
		return measureUint8Array(value);
	}
	measureArrayBuffer(value: ArrayBuffer | null) {
		return measureArrayBuffer(value);
	}
	measureArray<T>(value: T[] | null, measureOne: (item: T) => number) {
		if (value == null) {
			return this.measureLength(-1);
		} else {
			return this.measureLength(value.length) + value.reduce((sum, x) => sum + measureOne(x), 0);
		}
	}
	measureSimpleArray<T>(value: T[] | null, itemSize: number) {
		if (value == null) {
			return this.measureLength(-1);
		} else {
			return this.measureLength(value.length) + value.length * itemSize;
		}
	}
	measureLength(value: number) {
		return measureLength(value);
	}
	writeBoolean(value: boolean) {
		this.writeUint8(value ? 1 : 0);
	}
	writeString(value: string | null) {
		if (value == null) {
			this.writeLength(-1);
		} else {
			this.writeLength(stringLengthInBytes(value));
			this.writeStringValue(value);
		}
	}
	writeObject(value: any) {
		writeAny(this, value, { strings: [] });
	}
	writeUint8Array(value: Uint8Array | null) {
		if (value == null) {
			this.writeLength(-1);
		} else {
			this.writeLength(value.byteLength);
			this.writeBytes(value);
		}
	}
	writeArrayBuffer(value: ArrayBuffer | null) {
		if (value == null) {
			this.writeLength(-1);
		} else {
			this.writeLength(value.byteLength);
			this.writeBytes(new Uint8Array(value));
		}
	}
	writeArray<T>(value: T[] | null, writeOne: (item: T) => void) {
		if (value == null) {
			this.writeLength(-1);
		} else {
			this.writeLength(value.length);
			value.forEach(writeOne);
		}
	}
	writeLength(value: number) {
		if (value === -1) {
			this.writeUint8(0x80);
			this.writeUint8(0x00);
		} else {
			do {
				this.writeUint8((value & 0x7f) | ((value >> 7) ? 0x80 : 0x00));
				value = value >> 7;
			} while (value);
		}
	}
	getBuffer() {
		return this.view!.buffer;
	}
	getOffset() {
		return this.offset;
	}
	reset() {
		this.offset = 0;
	}
	init(size: number) {
		this.offset = 0;
		this.view = new DataView(new ArrayBuffer(size));
		this.bytes = new Uint8Array(this.view.buffer);
	}
	writeInt8(value: number) {
		this.view!.setInt8(this.offset, value);
		this.offset += 1;
	}
	writeUint8(value: number) {
		this.view!.setUint8(this.offset, value);
		this.offset += 1;
	}
	writeInt16(value: number) {
		this.view!.setInt16(this.offset, value);
		this.offset += 2;
	}
	writeUint16(value: number) {
		this.view!.setUint16(this.offset, value);
		this.offset += 2;
	}
	writeInt32(value: number) {
		this.view!.setInt32(this.offset, value);
		this.offset += 4;
	}
	writeUint32(value: number) {
		this.view!.setUint32(this.offset, value);
		this.offset += 4;
	}
	writeFloat32(value: number) {
		this.view!.setFloat32(this.offset, value);
		this.offset += 4;
	}
	writeFloat64(value: number) {
		this.view!.setFloat64(this.offset, value);
		this.offset += 8;
	}
	writeBytes(value: Uint8Array) {
		this.bytes!.set(value, this.offset);
		this.offset += value.length;
	}
	writeStringValue(value: string) {
		this.offset = encodeStringTo(this.bytes!, this.offset, value);
	}
}
