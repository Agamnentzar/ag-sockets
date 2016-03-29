import './common';
import { expect } from 'chai';
import { PacketWriter } from '../packet/packetWriter';
import { PacketReader } from '../packet/packetReader';
import BufferPacketWriter from '../packet/bufferPacketWriter';
import BufferPacketReader from '../packet/bufferPacketReader';
import ArrayBufferPacketWriter from '../packet/arrayBufferPacketWriter';
import ArrayBufferPacketReader from '../packet/arrayBufferPacketReader';

type Foo = [any, number[]];

describe('PacketReader + PacketWriter', function () {
	function readWriteTest<T>(writer: PacketWriter<T>, reader: PacketReader<T>) {
		writer.init(10000);
		writer.writeInt8(-123);
		writer.writeUint8(123);
		writer.writeInt16(-234);
		writer.writeUint16(234);
		writer.writeInt32(-345);
		writer.writeUint32(345);
		writer.writeFloat32(-1.5);
		writer.writeFloat64(2.5);
		writer.writeBoolean(true);
		writer.writeBoolean(false);
		writer.writeBytes(new Uint8Array([1, 2, 3, 4, 5]));
		writer.writeLength(5);
		writer.writeLength(200);
		writer.writeLength(60000);
		writer.writeLength(10000000);
		writer.writeString(null);
		writer.writeString('');
		writer.writeString('foo');
		writer.writeString('foo lkfdas jldfih dglfkhj fdglh irj idljg ldkfgj ');
		writer.writeObject(null);
		writer.writeObject({ foo: 'bar' });
		writer.writeArray(['foo', 'bar', 'boo'], i => writer.writeString(i));
		writer.writeArray<string>([], i => writer.writeString(i));
		writer.writeArray<string>(null, i => writer.writeString(i));
		writer.writeArray([{ foo: 'bar' }, { foo: 'boo' }], i => writer.writeObject(i));
		writer.writeArray<Foo>([[{ foo: 'bar' }, [1, 2, 3]], [{ foo: 'boo' }, [4, 5, 6]]], i => {
			writer.writeObject(i[0]);
			writer.writeArray(i[1], j => writer.writeUint8(j));
		});

		reader.setBuffer(writer.getBuffer());
		expect(reader.readInt8()).equal(-123, 'readInt8');
		expect(reader.readUint8()).equal(123, 'readUint8');
		expect(reader.readInt16()).equal(-234, 'readInt16');
		expect(reader.readUint16()).equal(234, 'readUint16');
		expect(reader.readInt32()).equal(-345, 'readInt32');
		expect(reader.readUint32()).equal(345, 'readUint32');
		expect(reader.readFloat32()).equal(-1.5, 'readFloat32');
		expect(reader.readFloat64()).equal(2.5, 'readFloat64');
		expect(reader.readBoolean()).equal(true, 'readBoolean');
		expect(reader.readBoolean()).equal(false, 'readBoolean');
		expect(reader.readBytes(5)).eql(new Uint8Array([1, 2, 3, 4, 5]), 'readBytes');
		expect(reader.readLength()).equal(5, 'readLength 1');
		expect(reader.readLength()).equal(200, 'readLength 2');
		expect(reader.readLength()).equal(60000, 'readLength 3');
		expect(reader.readLength()).equal(10000000, 'readLength 4');
		expect(reader.readString()).equal(null, 'readString null');
		expect(reader.readString()).equal('', 'readString empty');
		expect(reader.readString()).equal('foo', 'readString "foo"');
		expect(reader.readString()).equal('foo lkfdas jldfih dglfkhj fdglh irj idljg ldkfgj ', 'readString "foo lkfdas jldfih dglfkhj fdglh irj idljg ldkfgj "');
		expect(reader.readObject()).equal(null, 'readObject null');
		expect(reader.readObject()).eql({ foo: 'bar' }, 'readObject empty');
		expect(reader.readArray(() => reader.readString())).eql(['foo', 'bar', 'boo'], 'readArray ["foo", "bar", "boo"]');
		expect(reader.readArray(() => reader.readString())).eql([], 'readArray empty');
		expect(reader.readArray(() => reader.readString())).equal(null, 'readArray null');
		expect(reader.readArray(() => reader.readObject())).eql([{ foo: 'bar' }, { foo: 'boo' }], 'readArray obj[]');
		expect(reader.readArray(() => [
			reader.readObject(),
			reader.readArray(() => reader.readUint8()),
		])).eql([[{ foo: 'bar' }, [1, 2, 3]], [{ foo: 'boo' }, [4, 5, 6]]], 'readArray Foo[]');
	}

	function measureTest<T>(writer: PacketWriter<T>) {
		expect(writer.measureLength(0)).equal(1, 'measureLength 1');
		expect(writer.measureLength(123)).equal(1, 'measureLength 2');
		expect(writer.measureLength(200)).equal(2, 'measureLength 3');
		expect(writer.measureLength(60000)).equal(3, 'measureLength 4');
		expect(writer.measureLength(10000000)).equal(4, 'measureLength 5');
		expect(writer.measureSimpleArray([1, 2, 3], 2)).equal(6 + 1, 'measureSimpleArray');
		expect(writer.measureArray([1, 2, 5], i => i)).equal(8 + 1, 'measureArray');
		expect(writer.measureObject({ 'foo': 'bar' })).equal(13 + 1, 'measureObject');
		expect(writer.measureString('foobar')).equal(6 + 1, 'measureString');
		expect(writer.measureString(null)).equal(2, 'measureString (null)');
		expect(writer.measureArray<number>(null, x => x)).equal(2, 'measureArray (null)');
		expect(writer.measureSimpleArray<number>(null, 1)).equal(2, 'measureSimpleArray (null)');
		expect(writer.measureObject(null)).equal(2, 'measureObject (null)');
	}

	it('should read and write value correctly (BufferPacketWriter)', function () {
		readWriteTest(new BufferPacketWriter(), new BufferPacketReader());
	});

	it('should read and write value correctly (ArrayBufferPacketWriter)', function () {
		readWriteTest(new ArrayBufferPacketWriter(), new ArrayBufferPacketReader());
	});

	it('should measure lengths correctly (BufferPacketWriter)', function () {
		measureTest(new BufferPacketWriter());
	});

	it('should measure lengths correctly (ArrayBufferPacketWriter)', function () {
		measureTest(new ArrayBufferPacketWriter());
	});
});
