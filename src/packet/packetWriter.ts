import { stringLengthInBytes } from '../utf8';
import { PacketWriting, measureArrayBuffer, measureLength, measureString } from './packetCommon';
import { MeasuringWriter } from './measuringWriter';
import { writeAny } from './writeAny';

export abstract class BasePacketWriter implements PacketWriting {
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
	abstract writeInt8(value: number): void;
	abstract writeUint8(value: number): void;
	abstract writeInt16(value: number): void;
	abstract writeUint16(value: number): void;
	abstract writeInt32(value: number): void;
	abstract writeUint32(value: number): void;
	abstract writeFloat32(value: number): void;
	abstract writeFloat64(value: number): void;
	abstract writeBytes(value: Uint8Array): void;
	abstract writeStringValue(value: string): void;
}
