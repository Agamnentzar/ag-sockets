import './common';
import { expect } from 'chai';
import { assert, spy, stub } from 'sinon';
import { MessageType, PacketHandler, createPacketHandler } from '../packet/packetHandler';

describe('PacketHandler', () => {
	let handler: PacketHandler;
	let funcs: { foo(): any; };
	let special: any;
	// let writer: BinaryWriter;

	beforeEach(() => {
		// writer = createBinaryWriter();
		handler = createPacketHandler(['x', 'foo', 'abc'], ['y', 'bar'], {}, () => { });
	});

	describe('sendString()', () => {
		it('sends message to websocket', () => {
			const send = spy();

			handler.sendString(send, 'foo', 1, ['a', 'b', 5]);

			assert.calledWith(send, '[1,"a","b",5]');
		});

		it('returns message length', () => {
			expect(handler.sendString(spy(), 'foo', 1, ['a', 'b', 5])).equal('[1,"a","b",5]'.length);
		});

		it('returns 0 on error', () => {
			const send = stub().throws(new Error(''));

			expect(handler.sendString(send, 'foo', 1, ['a', 'b', 5])).equal(0);
		});

		// it('sends binary message', () => {
		// 	const send = spy();

		// 	handler.sendString(send, 'foo', 1, [8]);

		// 	assert.calledWith(send, getWriterBuffer(writer));
		// });

		// it('returns binary message length', () => {
		// 	expect(handler.sendString(spy(), 'foo', 1, [8])).equal(2);
		// });

		// it('returns binary message length (ArrayBuffer)', () => {
		// 	const writer = createBinaryWriter();
		// 	const handler = new ReleasePacketHandler(
		// 		() => { }, () => { }, ['', 'foo', 'abc'], ['', 'bar'], writer, binary, {});

		// 	expect(handler.sendString(spy(), 'foo', 1, [8])).equal(2);
		// });
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

			handler.recvString(JSON.stringify([MessageType.Version, 123]), funcs, special);

			assert.calledWith(VERSION, 123);
		});

		it('reads promise resolve message from websocket', () => {
			const barResolved = stub(special, '*resolve:bar');

			handler.recvString(JSON.stringify([MessageType.Resolved, 1, 123]), funcs, special);

			assert.calledWith(barResolved, 123);
		});

		it('reads promise reject message from websocket', () => {
			const barRejected = stub(special, '*reject:bar');

			handler.recvString(JSON.stringify([MessageType.Rejected, 1, 123]), funcs, special);

			assert.calledWith(barRejected, 123);
		});

		it('does nothing if function doesnt exist', () => {
			handler.recvString(JSON.stringify([100, 123]), funcs, special);
		});

		// it('reads binary message from websocket', () => {
		// 	const foo = stub(funcs, 'foo');

		// 	handler.recvString(new Uint8Array([1, 8]), funcs, special);

		// 	assert.calledWith(foo as any, 8);
		// });

		// it('throws if binary handler is missing', () => {
		// 	expect(() => handler.recvString(new Uint8Array([2, 8]), funcs, special))
		// 		.throw('Missing packet handler for: abc (2)');
		// });

		it('calls handle function with all parameters', () => {
			const handleResult = spy();
			stub(funcs, 'foo').returns('abc');

			handler.recvString('[1,"abc"]', funcs, special, handleResult);

			assert.calledWithMatch(handleResult, 1, 'foo', funcs.foo, funcs, ['abc']);
		});
	});
});
