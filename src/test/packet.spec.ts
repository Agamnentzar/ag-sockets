import './common';
import { expect } from 'chai';
import { assert, spy, stub } from 'sinon';
import { MessageType, PacketHandler, createPacketHandler } from '../packet/packetHandler';
import { Bin } from '../interfaces';
import { createBinaryReader } from '../packet/binaryReader';
import { NumberType, Type } from '../packet/packetCommon';

describe('PacketHandler', () => {
	let handler: PacketHandler;
	let funcs: { foo(): any; };
	let special: any;

	beforeEach(() => {
		handler = createPacketHandler(
			['x', ['foo', { binary: [Bin.U8] }], 'abc'],
			['y', ['bar', { binary: [Bin.U8] }]], {}, () => { });
	});

	describe('sendString()', () => {
		it('sends message to websocket', () => {
			const send = spy();

			handler.sendString(send, 'foo', 1, 69, 420, 'xyz');

			assert.calledWith(send, '[1,69,420,"xyz"]');
		});

		it('returns message length', () => {
			expect(handler.sendString(spy(), 'foo', 1, 69, 420, 'xyz')).equal('[1,69,420,"xyz"]'.length);
		});

		it('returns 0 on error', () => {
			const send = stub().throws(new Error(''));

			expect(handler.sendString(send, 'foo', 1, 69, 420, 'xyz')).equal(0);
		});

		it('sends binary message', () => {
			const send = spy();
			const remote: any = {};
			handler.createRemote(remote, send, { sentSize: 0, supportsBinary: true });

			remote.bar(8);

			assert.calledOnce(send);
			assert.calledWithMatch(send, new Uint8Array([1, 8]));
		});

		it('returns sent size (string)', () => {
			const size = handler.sendString(spy(), 'bar', 1, 69, 420, 'xyz');

			expect(size).equal('[1,69,420,"xyz"]'.length);
		});

		it('increments sent size (binary)', () => {
			const send = spy();
			const remote: any = {};
			const state = { sentSize: 0, supportsBinary: true };
			handler.createRemote(remote, send, state);

			remote.bar(8);

			expect(state.sentSize).equal(2);
		});
	});

	describe('recvString()', () => {
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

		it('reads message from websocket', () => {
			const foo = stub(funcs, 'foo');

			handler.recvString('[1,"a","b",5]', funcs, special);

			assert.calledWith(foo as any, 'a', 'b', 5);
		});

		it('reads VERSION message from websocket', () => {
			const VERSION = stub(special, '*version');

			handler.recvString(JSON.stringify([MessageType.Version, 0, 0, 123]), funcs, special);

			assert.calledWith(VERSION, 123);
		});

		it('reads VERSION message from websocket (binary)', () => {
			const VERSION = stub(special, '*version');
			const buffer = new Uint8Array([
				MessageType.Version,
				0, // funcId
				0, 0, 0, 0, // messageId
				Type.Number | NumberType.Uint8, 123 // result (any)
			]);
			const reader = createBinaryReader(buffer);

			handler.recvBinary(reader, funcs, special, [], 0);

			assert.calledWith(VERSION, 123);
		});

		it('reads promise resolve message from websocket', () => {
			const barResolved = stub(special, '*resolve:bar');

			handler.recvString(JSON.stringify([MessageType.Resolved, 1, 123, 'x']), funcs, special);

			assert.calledWith(barResolved, 123, 'x');
		});

		it('reads promise resolve message from websocket (binary)', () => {
			const barResolved = stub(special, '*resolve:bar');
			const buffer = new Uint8Array([
				MessageType.Resolved,
				1, // funcId
				123, 0, 0, 0, // messageId
				Type.Number | NumberType.Uint8, 125 // result (any)
			]);
			const reader = createBinaryReader(buffer);

			handler.recvBinary(reader, funcs, special, [], 0);

			assert.calledWith(barResolved, 123, 125);
		});

		it('reads promise reject message from websocket', () => {
			const barRejected = stub(special, '*reject:bar');

			handler.recvString(JSON.stringify([MessageType.Rejected, 1, 123, 'x']), funcs, special);

			assert.calledWith(barRejected, 123, 'x');
		});

		it('reads promise reject message from websocket (binary)', () => {
			const barRejected = stub(special, '*reject:bar');
			const buffer = new Uint8Array([
				MessageType.Rejected,
				1, // funcId
				123, 0, 0, 0, // messageId
				Type.Number | NumberType.Uint8, 125 // result (any)
			]);
			const reader = createBinaryReader(buffer);

			handler.recvBinary(reader, funcs, special, [], 0);

			assert.calledWith(barRejected, 123, 125);
		});

		it('does nothing if function doesnt exist', () => {
			handler.recvString(JSON.stringify([100, 123]), funcs, special);
		});

		it('reads binary message from websocket', () => {
			const foo = stub();

			handler.recvBinary(createBinaryReader(new Uint8Array([1, 8])), { foo }, {}, [], 1);

			assert.calledWith(foo, 8);
		});

		it('throws if binary handler is missing', () => {
			expect(() => handler.recvBinary(createBinaryReader(new Uint8Array([2, 8])), {}, {}, [], 1))
				.throw('Missing binary decoder for: abc (2)');
		});

		it('calls handle function with all parameters', () => {
			const handleResult = spy();
			stub(funcs, 'foo').returns('abc');

			handler.recvString('[1,"abc"]', funcs, special, handleResult);

			assert.calledWithMatch(handleResult, 1, 'foo', funcs.foo, funcs, ['abc']);
		});
	});

	it.skip('ttt', () => {
		const BinSequenceUser = [Bin.Str, Bin.Str, Bin.Str, Bin.Str, Bin.Str, Bin.Bool, Bin.U32, Bin.Str, Bin.Str, Bin.U8];

		handler = createPacketHandler(
			[['foo', { binary: [Bin.Str, BinSequenceUser] }]],
			[['bar', { binary: [Bin.Str, BinSequenceUser] }]],
			{ printGeneratedCode: true }, () => { });

		console.log('a');
	});
});
