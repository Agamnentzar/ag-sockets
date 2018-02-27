import './common';
import { expect } from 'chai';
import { assert, spy, stub } from 'sinon';
import { Bin } from '../interfaces';
import { MessageType, PacketHandler } from '../packet/packetHandler';
import { BufferPacketWriter } from '../packet/bufferPacketWriter';
import { BufferPacketReader } from '../packet/bufferPacketReader';
import { ArrayBufferPacketWriter } from '../packet/arrayBufferPacketWriter';
import { ArrayBufferPacketReader } from '../packet/arrayBufferPacketReader';
import { createHandlers } from '../packet/binaryHandler';

describe('PacketHandler', () => {
	let handler: PacketHandler<Buffer>;
	let funcs: any;
	let special: any;
	let binary: any;
	let writer: BufferPacketWriter;
	let reader: BufferPacketReader;

	beforeEach(() => {
		writer = new BufferPacketWriter();
		reader = new BufferPacketReader();
		binary = createHandlers({ foo: [Bin.U8] }, { foo: [Bin.U8] });
		handler = new PacketHandler<Buffer>(['', 'foo', 'abc'], ['', 'bar'], writer, reader, binary, {});
	});

	describe('send()', () => {
		it('should send message to websocket', () => {
			const send = spy();

			handler.send(send, 'foo', 1, ['a', 'b', 5], false);

			assert.calledWith(send, '[1,"a","b",5]');
		});

		it('should return message length', () => {
			expect(handler.send(spy(), 'foo', 1, ['a', 'b', 5], false)).equal('[1,"a","b",5]'.length);
		});

		it('should return 0 on error', () => {
			const send = stub().throws(new Error(''));

			expect(handler.send(send, 'foo', 1, ['a', 'b', 5], true)).equal(0);
		});

		it('should send binary message', () => {
			const send = spy();

			handler.send(send, 'foo', 1, [8], true);

			assert.calledWith(send, writer.getBuffer());
		});

		it('should return binary message length', () => {
			expect(handler.send(spy(), 'foo', 1, [8], true)).equal(2);
		});

		it('should return binary message length (ArrayBuffer)', () => {
			const writer = new ArrayBufferPacketWriter();
			const reader = new ArrayBufferPacketReader();
			const handler = new PacketHandler<ArrayBuffer>(['', 'foo', 'abc'], ['', 'bar'], writer, reader, binary, {});

			expect(handler.send(spy(), 'foo', 1, [8], true)).equal(2);
		});
	});

	describe('recv()', () => {
		beforeEach(() => {
			funcs = {
				foo: () => { },
			};

			special = {
				'*version': () => { },
				'*resolve:bar': () => { },
				'*reject:bar': () => { },
			};
		});

		it('should read message from websocket', () => {
			const foo = stub(funcs, 'foo');

			handler.recv('[1,"a","b",5]', funcs, special);

			assert.calledWith(foo, 'a', 'b', 5);
		});

		it('should read VERSION message from websocket', () => {
			const VERSION = stub(special, '*version');

			handler.recv(JSON.stringify([MessageType.Version, 123]), funcs, special);

			assert.calledWith(VERSION, 123);
		});

		it('should read promise resolve message from websocket', () => {
			const barResolved = stub(special, '*resolve:bar');

			handler.recv(JSON.stringify([MessageType.Resolved, 1, 123]), funcs, special);

			assert.calledWith(barResolved, 123);
		});

		it('should read promise reject message from websocket', () => {
			const barRejected = stub(special, '*reject:bar');

			handler.recv(JSON.stringify([MessageType.Rejected, 1, 123]), funcs, special);

			assert.calledWith(barRejected, 123);
		});

		it('should do nothing if function doesnt exist', () => {
			handler.recv(JSON.stringify([100, 123]), funcs, special);
		});

		it('should return message length', () => {
			stub(funcs, 'foo');

			expect(handler.recv('[1,"a","b",5]', funcs, special)).equal('[1,"a","b",5]'.length);
		});

		it('should read binary message from websocket', () => {
			const foo = stub(funcs, 'foo');

			handler.recv(new Buffer([1, 8]), funcs, special);

			assert.calledWith(foo, 8);
		});

		it('should return binary message length', () => {
			expect(handler.recv(new Buffer([1, 8]), funcs, special)).equal(2);
		});

		it('should throw if binary handler is missing', () => {
			expect(() => handler.recv(new Buffer([2, 8]), funcs, special)).throw('Missing packet handler for: abc (2)');
		});

		it('should return binary message length (ArrayBuffer)', () => {
			const writer = new ArrayBufferPacketWriter();
			const reader = new ArrayBufferPacketReader();
			const handler = new PacketHandler<ArrayBuffer>(['', 'foo', 'abc'], ['', 'bar'], writer, reader, binary, {});

			const buffer = new ArrayBuffer(2);
			const bytes = new Uint8Array(buffer);
			bytes[0] = 1;
			bytes[1] = 8;
			expect(handler.recv(buffer, funcs, special)).equal(2);
		});

		it('should call handle function with all parameters', () => {
			const handleResult = spy();
			stub(funcs, 'foo').returns('abc');

			handler.recv('[1,"abc"]', funcs, special, handleResult);

			assert.calledWithMatch(handleResult, 1, 'foo', funcs.foo, funcs, ['abc']);
		});
	});
});
