import './common';
import { expect } from 'chai';
import { Packets } from '../interfaces';
import { createHandlers } from '../packet/binaryHandler';
import { IBinaryHandlers } from '../packet/packetHandler';
import BufferPacketWriter from '../packet/bufferPacketWriter';
import BufferPacketReader from '../packet/bufferPacketReader';

describe('binaryHandler', function () {
	const client: Packets = {
		foo: ['Uint8', 'Float64'],
		boo: ['Object', ['Int32'], ['Int32', 'Int32', ['Int32']], ['Object']],
	};

	const server: Packets = {
		bar: ['Uint8', 'String'],
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
});
