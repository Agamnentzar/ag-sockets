import { stringLengthInBytes } from '../utf8';

export const enum Type {
	Const = 0 << 5,
	Number = 1 << 5,
	String = 2 << 5,
	Array = 3 << 5,
	Object = 4 << 5,
	TinyPositiveNumber = 5 << 5,
	TinyNegativeNumber = 6 << 5,
}

export const enum Consts {
	Undefined = 0,
	Null = 1,
	True = 2,
	False = 3,
}

export const enum NumberType {
	Int8 = 0,
	Uint8 = 1,
	Int16 = 2,
	Uint16 = 3,
	Int32 = 4,
	Uint32 = 5,
	Float32 = 6,
	Float64 = 7,
}

export interface PacketReading {
	readInt8(): number;
	readUint8(): number;
	readInt16(): number;
	readUint16(): number;
	readInt32(): number;
	readUint32(): number;
	readFloat32(): number;
	readFloat64(): number;
	readBytes(length: number): Uint8Array;
	readString(): string | null;
	readLength(): number;
}

export interface PacketReader<TBuffer> extends PacketReading {
	setBuffer(buffer: TBuffer): void;
	readBoolean(): boolean;
	readArray<T>(readOne: () => T): T[] | null;
	readObject(): any;
	readArrayBuffer(): ArrayBuffer | null;
}

export interface PacketWriting {
	writeInt8(value: number): void;
	writeUint8(value: number): void;
	writeInt16(value: number): void;
	writeUint16(value: number): void;
	writeInt32(value: number): void;
	writeUint32(value: number): void;
	writeFloat32(value: number): void;
	writeFloat64(value: number): void;
	writeString(value: string | null): void;
	writeLength(value: number): void;
	writeStringValue(value: string): void;
}

export interface PacketWriter<TBuffer> extends PacketWriting {
	getBuffer(): TBuffer;
	getOffset(): number;
	reset(): void;
	init(size: number): void;
	writeBoolean(value: boolean): void;
	writeBytes(value: Uint8Array): void;
	writeObject(value: any): void;
	writeArray<T>(value: T[] | null, writeOne: (item: T) => void): void;
	writeArrayBuffer(value: ArrayBuffer | null): void;
	measureString(value: string | null): number;
	measureObject(value: any): number;
	measureArrayBuffer(value: ArrayBuffer | null): number;
	measureArray<T>(value: T[] | null, measureOne: (item: T) => number): number;
	measureSimpleArray<T>(value: T[] | null, itemSize: number): number;
	measureLength(value: number): number;
}

export function measureString(value: string | null) {
	if (value == null) {
		return measureLength(-1);
	} else {
		const length = stringLengthInBytes(value);
		return measureLength(length) + length;
	}
}

export function measureArrayBuffer(value: ArrayBuffer | null) {
	if (value == null) {
		return measureLength(-1);
	} else {
		return measureLength(value.byteLength) + value.byteLength;
	}
}

export function measureLength(value: number) {
	return value === -1 ? 2 : (value < 0x7f ? 1 : (value < 0x3fff ? 2 : (value < 0x1fffff ? 3 : 4)));
}
