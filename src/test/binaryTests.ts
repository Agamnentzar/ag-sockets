import './common';
import { expect } from 'chai';
import { Packets, Bin } from '../interfaces';
import { createHandlers } from '../packet/binaryHandler';
import { IBinaryHandlers } from '../packet/packetHandler';
import BufferPacketWriter from '../packet/bufferPacketWriter';
import BufferPacketReader from '../packet/bufferPacketReader';

describe('binaryHandler', function () {
	const client: Packets = {
		foo: [Bin.U8, Bin.F64],
		boo: [Bin.Obj, [Bin.I32], [Bin.I32, Bin.I32, [Bin.I32]], [Bin.Obj]],
		far: [[Bin.I32, [Bin.I32, Bin.I32]]],
		fab: [[Bin.I32, [Bin.I32]]],
		obj: [[Bin.Obj]],
		all: [Bin.I8, Bin.U8, Bin.I16, Bin.U16, Bin.I32, Bin.U32, Bin.F32, Bin.F64, Bin.Bool, Bin.Str, Bin.Obj],
	};

	const server: Packets = {
		bar: [Bin.U8, Bin.Str],
	};

	describe('createHandlers(server)', function () {
		it('should create writers for client', function () {
			const handlers: IBinaryHandlers<Buffer> = createHandlers(client, server);

			expect(handlers.write['foo']).exist;
		});

		it('should create readers for server', function () {
			const handlers: IBinaryHandlers<Buffer> = createHandlers(client, server);

			expect(handlers.read['bar']).exist;
		});

		it('should create proper write method', function () {
			const handlers: IBinaryHandlers<Buffer> = createHandlers(client, server);
			const writer = new BufferPacketWriter();

			handlers.write['foo'](writer, 1, [8, 1.5]);

			expect(writer.getBuffer().equals(new Buffer([0x01, 0x08, 0x03f, 0xf8, 0, 0, 0, 0, 0, 0]))).true;
		});
	});

	describe('createHandlers(client)', function () {
		it('should create writers for server', function () {
			const handlers: IBinaryHandlers<Buffer> = createHandlers(server, client);

			expect(handlers.write['bar']).exist;
		});

		it('should create readers for client', function () {
			const handlers: IBinaryHandlers<Buffer> = createHandlers(server, client);

			expect(handlers.read['foo']).exist;
		});

		it('should create proper read method', function () {
			const handlers: IBinaryHandlers<Buffer> = createHandlers(server, client);
			const reader = new BufferPacketReader();
			reader.setBuffer(new Buffer([0x01, 0x08, 0x03f, 0xf8, 0, 0, 0, 0, 0, 0]));
			const result = [reader.readUint8()];

			handlers.read['foo'](reader, result);

			expect(result).eql([1, 8, 1.5]);
		});
	});

	describe('readWriteTests', function () {
		let serverSide: IBinaryHandlers<Buffer>;
		let clientSide: IBinaryHandlers<Buffer>;
		let reader: BufferPacketReader;
		let writer: BufferPacketWriter;

		beforeEach(function () {
			serverSide = createHandlers(client, server);
			clientSide = createHandlers(server, client);
			reader = new BufferPacketReader();
			writer = new BufferPacketWriter();
		});

		it('shoud read write simple method', function () {
			serverSide.write['foo'](writer, 1, [8, 1.5]);
			reader.setBuffer(writer.getBuffer());
			const result = [reader.readUint8()];
			clientSide.read['foo'](reader, result);

			expect(result).eql([1, 8, 1.5]);
		});

		it('shoud read write complex arrays method', function () {
			serverSide.write['far'](writer, 3, [[[10, [[1, 2]]]]]);
			reader.setBuffer(writer.getBuffer());
			const result = [reader.readUint8()];
			clientSide.read['far'](reader, result);

			expect(result).eql([3, [[10, [[1, 2]]]]]);
		});

		it('shoud read write simple arrays method', function () {
			serverSide.write['fab'](writer, 4, [[[10, [3, 3, 4]]]]);
			reader.setBuffer(writer.getBuffer());
			const result = [reader.readUint8()];
			clientSide.read['fab'](reader, result);

			expect(result).eql([4, [[10, [3, 3, 4]]]]);
		});

		it('shoud read write arrays of objects method', function () {
			serverSide.write['obj'](writer, 4, [[{ a: 1 }, { b: 2 }]]);
			reader.setBuffer(writer.getBuffer());
			const result = [reader.readUint8()];
			clientSide.read['obj'](reader, result);

			expect(result).eql([4, [{ a: 1 }, { b: 2 }]]);
		});

		it('shoud read write complex method', function () {
			serverSide.write['boo'](writer, 2, [{ foo: 'bar' }, [1, 2, 3], [[10, 20, [3, 3, 4]], [3, 4, null]], [{ a: 1 }, { b: 2 }]]);
			reader.setBuffer(writer.getBuffer());
			const result = [reader.readUint8()];
			clientSide.read['boo'](reader, result);

			expect(result).eql([2, { foo: 'bar' }, [1, 2, 3], [[10, 20, [3, 3, 4]], [3, 4, null]], [{ a: 1 }, { b: 2 }]]);
		});

		it('should read write all types', function () {
			serverSide.write['all'](writer, 5, [-123, 200, -500, 40000, -40000, 100000, 1.5, -2.5, true, 'foo', { x: 2 }]);
			reader.setBuffer(writer.getBuffer());
			const result = [reader.readUint8()];
			clientSide.read['all'](reader, result);

			expect(result).eql([5, -123, 200, -500, 40000, -40000, 100000, 1.5, -2.5, true, 'foo', { x: 2 }]);
		});
	});
});
