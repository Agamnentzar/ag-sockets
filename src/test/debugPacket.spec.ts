// import './common';
// import { assert, spy, stub, SinonSpy } from 'sinon';
// import { MessageType, DebugPacketHandler } from '../packet/packetHandler';
// import { BinaryWriter, createBinaryWriter } from '../packet/binaryWriter';

// describe('DebugPacketHandler', () => {
// 	let handler: DebugPacketHandler;
// 	let funcs: any;
// 	let special: any;
// 	let writer: BinaryWriter;
// 	let log: SinonSpy;

// 	beforeEach(() => {
// 		writer = createBinaryWriter();
// 		log = spy();
// 		handler = new DebugPacketHandler(
// 			() => { }, () => { }, ['', 'foo', 'abc'], ['', 'bar', 'abc'], writer, ['abc'], log);
// 	});

// 	describe('sendString()', () => {
// 		it('should log sent message', () => {
// 			handler.sendString(spy(), 'foo', 1, ['a', 'b', 5]);

// 			assert.calledWithMatch(log, 'SEND [13] (str)', 'foo', [1, 'a', 'b', 5]);
// 		});

// 		// it('should log sent binary message', () => {
// 		// 	handler.send(spy(), 'foo', 1, [8], true);

// 		// 	assert.calledWithMatch(log, 'SEND [2] (bin)', 'foo', [1, 8]);
// 		// });

// 		it('should not log ignored message', () => {
// 			handler.sendString(spy(), 'abc', 2, ['a', 'b', 5]);

// 			assert.notCalled(log);
// 		});
// 	});

// 	describe('recv()', () => {
// 		beforeEach(() => {
// 			funcs = {
// 				foo() { },
// 				abc() { },
// 			};

// 			special = {
// 				'*version'() { },
// 				'*resolve:bar'() { },
// 				'*reject:bar'() { },
// 			};
// 		});

// 		it('should log received message', () => {
// 			handler.recvString('[1,"a","b",5]', funcs, special);

// 			assert.calledWithMatch(log, 'RECV [13] (str)', 'foo', ['a', 'b', 5]);
// 		});

// 		// it('should log received binary message', () => {
// 		// 	handler.recvString(new Uint8Array([1, 8]), funcs, special);

// 		// 	assert.calledWithMatch(log, 'RECV [2] (bin)', 'foo', [8]);
// 		// });

// 		it('should log invalid message & received message', () => {
// 			handler.recvString('[3,6]', funcs, special);

// 			assert.calledWithMatch(log, 'RECV [5] (str)', undefined, [6]);
// 			assert.calledWithMatch(log, 'invalid message: undefined', [6]);
// 		});

// 		it('should not log ignored message', () => {
// 			handler.recvString('[2,"a","b",5]', funcs, special);

// 			assert.notCalled(log);
// 		});

// 		it('should read VERSION message from websocket', () => {
// 			const version = stub(special, '*version');

// 			handler.recvString(JSON.stringify([MessageType.Version, 123]), funcs, special);

// 			assert.calledWith(version, 123);
// 		});
// 	});
// });
