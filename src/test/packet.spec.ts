import './common';
import { expect } from 'chai';
import { assert, spy, stub, SinonSpy } from 'sinon';
import { MessageType, PacketHandler, createPacketHandler, RemoteState } from '../packet/packetHandler';
import { Bin, MethodDef } from '../interfaces';
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

			handler.sendString(send, 1, 69, 420, 'xyz');

			assert.calledWith(send, '[1,69,420,"xyz"]');
		});

		it('returns message length', () => {
			expect(handler.sendString(spy(), 1, 69, 420, 'xyz')).equal('[1,69,420,"xyz"]'.length);
		});

		it('returns 0 on error', () => {
			const send = stub().throws(new Error(''));

			expect(handler.sendString(send, 1, 69, 420, 'xyz')).equal(0);
		});

		it('sends binary message', () => {
			const send = spy();
			const remote: any = {};
			handler.createRemote(remote, send, { sentSize: 0, supportsBinary: true, batch: false });

			remote.bar(8);

			assert.calledOnce(send);
			assert.calledWithMatch(send, new Uint8Array([1, 8]));
		});

		it('returns sent size (string)', () => {
			const size = handler.sendString(spy(), 1, 69, 420, 'xyz');

			expect(size).equal('[1,69,420,"xyz"]'.length);
		});

		it('increments sent size (binary)', () => {
			const send = spy();
			const remote: any = {};
			const state: RemoteState = { sentSize: 0, supportsBinary: true, batch: false };
			handler.createRemote(remote, send, state);

			remote.bar(8);

			expect(state.sentSize).equal(2);
		});
	});

	describe('sendBinary()', () => {
		const resolved = [
			MessageType.Resolved,
			1, // funcId
			123, 0, 0, 0, // messageId
			Type.Number | NumberType.Uint8, 125 // result (any)
		];

		it('sends message to websocket', () => {
			const send = spy();

			handler.sendBinary(send, MessageType.Resolved, 1, 123, 125);

			assert.calledOnce(send);
			expect(Array.from(send.args[0][0])).eql(resolved);
		});

		it('returns message length', () => {
			expect(handler.sendBinary(spy(), MessageType.Resolved, 1, 123, 125)).equal(resolved.length);
		});

		it('returns 0 on error', () => {
			const send = stub().throws(new Error(''));

			expect(handler.sendBinary(send, MessageType.Resolved, 1, 123, 125)).equal(0);
		});

		it('does not leak sent message into next packet sent to another remote', () => {
			const send = spy();
			const remote: any = {};
			handler.createRemote(remote, send, { sentSize: 0, supportsBinary: true, batch: false });

			handler.sendBinary(spy(), MessageType.Resolved, 1, 123, 125);
			remote.bar(8);

			assert.calledOnce(send);
			expect(Array.from(send.args[0][0])).eql([1, 8]);
		});

		it('does not leak sent message into next batch sent to another remote', () => {
			const send = spy();
			const remote: any = {};
			const state: RemoteState = { sentSize: 0, supportsBinary: true, batch: false };
			handler.createRemote(remote, send, state);

			handler.sendBinary(spy(), MessageType.Resolved, 1, 123, 125);
			state.batch = true;
			remote.bar(8);
			remote.bar(9);
			handler.commitBatch(send, state);

			assert.calledOnce(send);
			expect(Array.from(send.args[0][0])).eql([1, 8, 1, 9]);
		});

		it('does not leak message that failed to send into next packet', () => {
			const send = spy();
			const remote: any = {};
			handler.createRemote(remote, send, { sentSize: 0, supportsBinary: true, batch: false });

			handler.sendBinary(stub().throws(new Error('')), MessageType.Resolved, 1, 123, 125);
			remote.bar(8);

			assert.calledOnce(send);
			expect(Array.from(send.args[0][0])).eql([1, 8]);
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

			handler.recvBinary(reader, funcs, special, [], 0, []);

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

			handler.recvBinary(reader, funcs, special, [], 0, []);

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

			handler.recvBinary(reader, funcs, special, [], 0, []);

			assert.calledWith(barRejected, 123, 125);
		});

		it('does nothing if function doesnt exist', () => {
			handler.recvString(JSON.stringify([100, 123]), funcs, special);
		});

		it('reads binary message from websocket', () => {
			const foo = stub();

			handler.recvBinary(createBinaryReader(new Uint8Array([1, 8])), { foo }, {}, [], 1, []);

			assert.calledWith(foo, 8);
		});

		it('throws if binary handler is missing', () => {
			expect(() => handler.recvBinary(createBinaryReader(new Uint8Array([2, 8])), {}, {}, [], 1, []))
				.throw('Missing binary decoder for: abc (2)');
		});

		it('calls handle function with all parameters', () => {
			const handleResult = spy();
			stub(funcs, 'foo').returns('abc');

			handler.recvString('[1,"abc"]', funcs, special, handleResult);

			assert.calledWithMatch(handleResult, 1, funcs.foo, funcs, ['abc']);
		});
	});

	describe('commitBatch()', () => {
		const methods: MethodDef[] = [
			['bar', { binary: [Bin.U8] }],
			['buf', { binary: [Bin.U8Array] }],
			['obj', { binary: [Bin.Obj] }],
		];
		let batchHandler: PacketHandler;
		let remote: any;
		let state: RemoteState;
		let send: SinonSpy;

		beforeEach(() => {
			batchHandler = createPacketHandler(['x'], methods, {}, () => { });
			send = spy();
			remote = {};
			state = { sentSize: 0, supportsBinary: true, batch: false };
			batchHandler.createRemote(remote, send, state);
			state.batch = true;
		});

		// reads batched packets the same way client socket does, with strings dictionary shared by all of them
		function receiveBatch() {
			const actions = { bar: spy(), buf: spy(), obj: spy() };
			const recvHandler = createPacketHandler(methods, ['y'], {}, () => { });
			const reader = createBinaryReader(send.args[0][0]);
			const strings: string[] = [];

			while (reader.offset < reader.view.byteLength) {
				recvHandler.recvBinary(reader, actions, {}, [], 0, strings);
			}

			return actions;
		}

		it('sends all batched packets in a single message', () => {
			remote.bar(8);
			remote.bar(9);

			batchHandler.commitBatch(send, state);

			assert.calledOnce(send);
			expect(Array.from(send.args[0][0])).eql([0, 8, 0, 9]);
		});

		it('returns false if writing packet failed', () => {
			expect(remote.buf(123)).false;
		});

		it('discards packet that failed to write', () => {
			remote.bar(8);
			remote.buf(123); // not a Uint8Array, fails after packet id is already written
			remote.bar(9);

			batchHandler.commitBatch(send, state);

			expect(Array.from(send.args[0][0])).eql([0, 8, 0, 9]);
		});

		it('does not desynchronize strings dictionary when writing packet failed', () => {
			remote.obj({ aaa: 1 });
			remote.obj({ bbb: 2, ccc: () => { } }); // fails after "bbb" and "ccc" are added to dictionary
			remote.obj({ bbb: 3 });

			batchHandler.commitBatch(send, state);

			const { obj } = receiveBatch();
			expect(obj.args.map(args => args[0])).eql([{ aaa: 1 }, { bbb: 3 }]);
		});
	});

	it.skip('ttt', () => {
		const BinSequenceUser = [Bin.Str, Bin.Str, { test: Bin.Str, x: [Bin.I8, Bin.I8] }, Bin.Str, Bin.Str, Bin.Bool, Bin.U32, Bin.U8];

		handler = createPacketHandler(
			[['foo', { binary: [Bin.Str, { foo: Bin.Str, bar: Bin.F64 }, BinSequenceUser] }]],
			[['bar', { binary: [Bin.Str, { foo: Bin.Str, bar: Bin.F64 }, BinSequenceUser] }]],
			{ printGeneratedCode: true }, () => { });
	});
});
