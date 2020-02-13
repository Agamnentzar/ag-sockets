import './common';
import { assert, spy, stub, SinonSpy } from 'sinon';
import { Bin } from '../interfaces';
import { MessageType, DebugPacketHandler } from '../packet/packetHandler';
import { createHandlers } from '../packet/binaryHandler';
import { BinaryWriter, createBinaryWriter } from '../packet/binaryWriter';

describe('DebugPacketHandler', () => {
	let handler: DebugPacketHandler;
	let funcs: any;
	let special: any;
	let binary: any;
	let writer: BinaryWriter;
	let log: SinonSpy;

	beforeEach(() => {
		writer = createBinaryWriter();
		binary = createHandlers({ foo: [Bin.U8] }, { foo: [Bin.U8] });
		log = spy();
		handler = new DebugPacketHandler(
			() => { }, () => { }, ['', 'foo', 'abc'], ['', 'bar', 'abc'], writer, binary, {}, ['abc'], log);
	});

	describe('send()', () => {
		it('should log sent message', () => {
			handler.send(spy(), 'foo', 1, ['a', 'b', 5], false);

			assert.calledWithMatch(log, 'SEND [13] (str)', 'foo', [1, 'a', 'b', 5]);
		});

		it('should log sent binary message', () => {
			handler.send(spy(), 'foo', 1, [8], true);

			assert.calledWithMatch(log, 'SEND [2] (bin)', 'foo', [1, 8]);
		});

		it('should not log ignored message', () => {
			handler.send(spy(), 'abc', 2, ['a', 'b', 5], true);

			assert.notCalled(log);
		});
	});

	describe('recv()', () => {
		beforeEach(() => {
			funcs = {
				foo() { },
				abc() { },
			};

			special = {
				'*version'() { },
				'*resolve:bar'() { },
				'*reject:bar'() { },
			};
		});

		it('should log received message', () => {
			handler.recv('[1,"a","b",5]', funcs, special);

			assert.calledWithMatch(log, 'RECV [13] (str)', 'foo', ['a', 'b', 5]);
		});

		it('should log received binary message', () => {
			handler.recv(new Uint8Array([1, 8]), funcs, special);

			assert.calledWithMatch(log, 'RECV [2] (bin)', 'foo', [8]);
		});

		it('should log invalid message & received message', () => {
			handler.recv('[3,6]', funcs, special);

			assert.calledWithMatch(log, 'RECV [5] (str)', undefined, [6]);
			assert.calledWithMatch(log, 'invalid message: undefined', [6]);
		});

		it('should not log ignored message', () => {
			handler.recv('[2,"a","b",5]', funcs, special);

			assert.notCalled(log);
		});

		it('should read VERSION message from websocket', () => {
			const version = stub(special, '*version');

			handler.recv(JSON.stringify([MessageType.Version, 123]), funcs, special);

			assert.calledWith(version, 123);
		});
	});
});
