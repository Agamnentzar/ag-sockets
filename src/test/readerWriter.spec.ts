import './common';
import { expect } from 'chai';
import {
	createBinaryWriter, writeInt8, writeUint8, writeInt16, writeUint16, writeInt32, writeUint32,
	writeFloat32, writeFloat64, writeBoolean, writeBytes, writeLength, writeString, writeObject,
	writeArray, writeArrayBuffer, writeUint8Array, getWriterBuffer, resetWriter, writeStringValue, BinaryWriter, writeBytesRange, writeBytesRangeView
} from '../packet/binaryWriter';
import {
	createBinaryReader, readInt8, readUint8, readInt16, readUint16, readInt32, readUint32,
	readFloat32, readFloat64, readBoolean, readBytes, readLength, readString, readObject,
	readArray, readArrayBuffer, readUint8Array, BinaryReader
} from '../packet/binaryReader';

type Foo = [any, number[]];

function writerToReader(writer: BinaryWriter) {
	return createBinaryReader(new Uint8Array(writer.view.buffer, writer.view.byteOffset, writer.view.byteLength));
}

describe('PacketReader + PacketWriter', () => {
	it('read write length (random)', () => {
		const writer = createBinaryWriter(34);
		const reader = writerToReader(writer);

		for (let i = 0; i < 1000; i++) {
			const length = (Math.random() * 0x7fffffff) >>> 0;
			writer.offset = 0;
			reader.offset = 0;
			writeLength(writer, length);
			const actual = readLength(reader);

			if (actual !== length) {
				console.error('Different values', actual, length, getWriterBuffer(writer));
			}
		}
	});

	[
		0, 1, 2, 16, 0x7f, 0x80, 0x3fff, 0xc000, 0x70000000,
	].forEach(length => it(`read write length (${length})`, () => {
		const writer = createBinaryWriter(34);
		const reader = writerToReader(writer);
		writer.offset = 0;
		reader.offset = 0;
		writeLength(writer, length);
		const actual = readLength(reader);
		expect(actual).equal(length);
	}));

	it('reads and writes value correctly', () => {
		const writer = createBinaryWriter(10000);
		writeInt8(writer, -123);
		writeUint8(writer, 123);
		writeInt16(writer, -234);
		writeUint16(writer, 234);
		writeInt32(writer, -345);
		writeUint32(writer, 345);
		writeFloat32(writer, -1.5);
		writeFloat64(writer, 2.5);
		writeBoolean(writer, true);
		writeBoolean(writer, false);
		writeBytes(writer, new Uint8Array([1, 2, 3, 4, 5]));
		writeBytesRange(writer, new Uint8Array([1, 2, 3, 4, 5]), 1, 3);
		const buf = new Uint8Array([1, 2, 3, 4, 5]);
		writeBytesRangeView(writer, new DataView(buf.buffer, buf.byteOffset, buf.byteLength), 1, 3);
		writeLength(writer, 5);
		writeLength(writer, 200);
		writeLength(writer, 60000);
		writeLength(writer, 10000000);
		writeString(writer, null);
		writeString(writer, '');
		writeString(writer, 'foo');
		writeString(writer, 'foo lkfdas jldfih dglfkhj fdglh irj idljg ldkfgj ');
		writeString(writer, 'część');
		writeObject(writer, null);
		writeObject(writer, { foo: 'bar' });
		writeArray(writer, ['foo', 'bar', 'boo'], writeString);
		writeArray<string>(writer, [], writeString);
		writeArray<string>(writer, null, writeString);
		writeArray(writer, [{ foo: 'bar' }, { foo: 'boo' }], writeObject);
		writeArray<Foo>(writer, [[{ foo: 'bar' }, [1, 2, 3]], [{ foo: 'boo' }, [4, 5, 6]]], (writer, i) => {
			writeObject(writer, i[0]);
			writeArray(writer, i[1], writeUint8);
		});
		writeArrayBuffer(writer, null);
		writeArrayBuffer(writer, new Uint8Array([1, 2, 3]).buffer);
		writeUint8Array(writer, null);
		writeUint8Array(writer, new Uint8Array([1, 2, 3]));

		function readBytesRange(reader: BinaryReader) {
			const length = readLength(reader);
			return readBytes(reader, length);
		}

		const reader = createBinaryReader(getWriterBuffer(writer));
		expect(readInt8(reader)).equal(-123, 'readInt8');
		expect(readUint8(reader)).equal(123, 'readUint8');
		expect(readInt16(reader)).equal(-234, 'readInt16');
		expect(readUint16(reader)).equal(234, 'readUint16');
		expect(readInt32(reader)).equal(-345, 'readInt32');
		expect(readUint32(reader)).equal(345, 'readUint32');
		expect(readFloat32(reader)).equal(-1.5, 'readFloat32');
		expect(readFloat64(reader)).equal(2.5, 'readFloat64');
		expect(readBoolean(reader)).equal(true, 'readBoolean');
		expect(readBoolean(reader)).equal(false, 'readBoolean');
		expect(readBytes(reader, 5)).eql(new Uint8Array([1, 2, 3, 4, 5]), 'readBytes');
		expect(readBytesRange(reader)).eql(new Uint8Array([2, 3, 4]), 'readBytesRange');
		expect(readBytesRange(reader)).eql(new Uint8Array([2, 3, 4]), 'readBytesRange (view)');
		expect(readLength(reader)).equal(5, 'readLength 1');
		expect(readLength(reader)).equal(200, 'readLength 2');
		expect(readLength(reader)).equal(60000, 'readLength 3');
		expect(readLength(reader)).equal(10000000, 'readLength 4');
		expect(readString(reader)).equal(null, 'readString null');
		expect(readString(reader)).equal('', 'readString empty');
		expect(readString(reader)).equal('foo', 'readString "foo"');
		expect(readString(reader))
			.equal('foo lkfdas jldfih dglfkhj fdglh irj idljg ldkfgj ', 'readString "foo lkfdas jldfih dglfkhj fdglh irj idljg ldkfgj "');
		expect(readString(reader)).equal('część', 'readString część');
		expect(readObject(reader)).equal(null, 'readObject null');
		expect(readObject(reader)).eql({ foo: 'bar' }, 'readObject empty');
		expect(readArray(reader, readString)).eql(['foo', 'bar', 'boo'], 'readArray ["foo", "bar", "boo"]');
		expect(readArray(reader, readString)).eql([], 'readArray empty');
		expect(readArray(reader, readString)).equal(null, 'readArray null');
		expect(readArray(reader, readObject)).eql([{ foo: 'bar' }, { foo: 'boo' }], 'readArray obj[]');
		expect(readArray(reader, reader => [
			readObject(reader),
			readArray(reader, readUint8),
		])).eql([[{ foo: 'bar' }, [1, 2, 3]], [{ foo: 'boo' }, [4, 5, 6]]], 'readArray Foo[]');
		expect(readArrayBuffer(reader)).equal(null, 'readArrayBuffer null');
		expect(new Uint8Array(readArrayBuffer(reader)!)).eql(new Uint8Array([1, 2, 3]), 'readArrayBuffer [1, 2, 3]');
		expect(readUint8Array(reader)).equal(null, 'readUint8Array null');
		expect(readUint8Array(reader)).eql(new Uint8Array([1, 2, 3]), 'readUint8Array [1, 2, 3]');

		expect(() => readUint8(reader), 'readUint8(reader)').throw();
	});

	it('handles offset properly (Reader)', () => {
		const buffer = new Uint8Array([1, 2, 3, 4, 5, 6, 7]).buffer;
		const reader = createBinaryReader(new Uint8Array(buffer, 2, 3));
		expect(readUint8(reader)).equal(3);
		expect(Array.from(readBytes(reader, 2))).eql([4, 5]);
	});

	it('handles offset properly (Writer)', () => {
		const buffer = new Uint8Array([1, 2, 3, 4, 5, 6, 7]).buffer;
		const writer = createBinaryWriter(new Uint8Array(buffer, 2, 4));
		writeUint32(writer, 0x11223344);
		expect(new Uint8Array(buffer)).eql(new Uint8Array([1, 2, 68, 51, 34, 17, 7]));
	});

	it('returns offset (Writer)', () => {
		const writer = createBinaryWriter(16);
		expect(writer.offset).equal(0);
		writeUint8(writer, 1);
		expect(writer.offset).equal(1);
	});

	it('can reset offset (Writer)', () => {
		const writer = createBinaryWriter(16);
		writeUint8(writer, 1);
		expect(writer.offset).equal(1);
		resetWriter(writer);
		expect(writer.offset).equal(0);
	});

	it('throws when writing string too large for the buffer', () => {
		const writer = createBinaryWriter(16);
		expect(() => writeStringValue(writer, 'some long string that is larger than the buffer'))
			.throw('Offset is outside the bounds of the DataView');
	});

	describe('binary object encoding', () => {
		function writeRead(obj: any) {
			const writer = createBinaryWriter(10000);
			writeObject(writer, obj);
			// const jsonLength = JSON.stringify(obj) && JSON.stringify(obj).length || 0;
			// console.log(`size: ${writer.offset} / ${jsonLength + writer.measureLength(jsonLength)}`);
			const reader = createBinaryReader(getWriterBuffer(writer));
			return readObject(reader);
		}

		function readWriteObjectTest(obj: any, message?: string) {
			expect(writeRead(obj)).eql(obj, message);
		}

		it('reads and writes undefined', () => readWriteObjectTest(undefined));
		it('reads and writes null', () => readWriteObjectTest(null));
		it('reads and writes true', () => readWriteObjectTest(true));
		it('reads and writes false', () => readWriteObjectTest(false));
		it('reads and writes numbers', () => readWriteObjectTest(123));
		it('reads and writes strings', () => readWriteObjectTest('abc'));
		it('reads and writes arrays', () => readWriteObjectTest([1, 2, 3]));

		it('reads and writes numbers', () => {
			readWriteObjectTest(0);
			readWriteObjectTest(1);
			readWriteObjectTest(-1);
			readWriteObjectTest(15);
			readWriteObjectTest(16);
			readWriteObjectTest(-15);
			readWriteObjectTest(-16);
			readWriteObjectTest(Number.MAX_VALUE);
			readWriteObjectTest(Number.MAX_SAFE_INTEGER);
			readWriteObjectTest(Number.MIN_VALUE);
			readWriteObjectTest(Number.MIN_SAFE_INTEGER);
			readWriteObjectTest(Number.NaN, 'NaN');
			readWriteObjectTest(Number.POSITIVE_INFINITY, 'POSITIVE_INFINITY');
			readWriteObjectTest(Number.NEGATIVE_INFINITY, 'NEGATIVE_INFINITY');
			readWriteObjectTest(0xff, '0xff');
			readWriteObjectTest(0xffff, '0xffff');
			readWriteObjectTest(0xffffff, '0xffffff');
			readWriteObjectTest(0xffffffff, '0xffffffff');
			readWriteObjectTest(-0xff, '-0xff');
			readWriteObjectTest(-0xffff, '-0xffff');
			readWriteObjectTest(-0xffffff, '-0xffffff');
			readWriteObjectTest(-0xffffffff, '-0xffffffff');
		});

		it('reads and writes objects correctly', () => {
			readWriteObjectTest({
				foo: 'bar',
				x: 123,
				y: 12.5,
				values: [1, 2, 3, 4, 5, -6, 7],
				prop: {
					a: 'b',
					b: true,
					c: null,
					d: 8765242,
					e: 'lorem ipsum',
				},
			});
		});

		it('reads and writes arrays', () => {
			readWriteObjectTest([0, 1, 0xff, 0xffff, 0xffffff, 1.5, Math.PI]);
		});

		it('reads and writes long arrays', () => {
			readWriteObjectTest([
				0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
				0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
				0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
				0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
			]);
		});

		it('reads and writes arrays of negative numbers', () => {
			readWriteObjectTest([0, -1, -0x3f, -0x1fff, -0x1fffff, -1.5, -Math.PI]);
		});

		it('reads and writes objects with repeated strings', () => {
			readWriteObjectTest({
				bar: 'bar',
				x: 'foo',
				y: 'bar',
				values: [1, 'bar', 'bar'],
			});
		});

		it('reads and writes objects with empty strings', () => {
			readWriteObjectTest({
				x: '',
			});
		});

		it('reads and writes objects with repeated keys', () => {
			readWriteObjectTest([
				{ value: 'bar' },
				{ value: 'boo' },
				{ value: 'abc' },
				{ value: 'def' },
				{ value: 'omg' },
			]);
		});

		it.skip('reads and writes objects with empty string keys', () => {
			readWriteObjectTest([
				{ '': 'bar' },
			]);
		});

		it('throws for invalid type (function)', () => {
			expect(() => readWriteObjectTest({
				foo() { },
			})).throw('Invalid type: ');
		});

		it('handles typed array', () => {
			const result = writeRead({ data: new Uint8Array([1, 2, 3, 4]) });
			expect(result.data).instanceof(Uint8Array);
			expect(Array.from(result.data)).eql([1, 2, 3, 4]);
		});

		it.skip('test', () => {
			const data = [0];
			const reader = createBinaryReader(new Uint8Array(data));

			const result = {} as any;
			result.id = readUint8(reader);
			result.localId = readUint8(reader);
			result.state = readObject(reader);

			const length = readLength(reader);
			result.length = length;
			result.items = [];

			// console.log(new Uint8Array(reader.view.buffer, reader.view.byteOffset + reader.offset).slice(0, 50));

			for (let i = 0; i < 3; i++) {
				const item: any[] = [];
				item.push(readUint8(reader));
				item.push(readUint16(reader));
				item.push(readFloat64(reader));
				item.push(readFloat64(reader));
				item.push(readFloat64(reader));
				item.push(readFloat64(reader));
				item.push(readBoolean(reader));
				item.push(readObject(reader));
				item.push(readArray(reader, () => readInt16(reader)));
				// console.log(new Uint8Array(reader.view.buffer, reader.view.byteOffset + reader.offset).slice(0, 50));
				item.push(readUint8Array(reader));
				result.items.push(item);
			}

			console.log(new Uint8Array(reader.view.buffer, reader.view.byteOffset + reader.offset).slice(0, 50));

			// console.log(result);
			console.log(require('util').inspect(result, false, 99, true));
		});
	});
});
