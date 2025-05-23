import './common';
import { expect } from 'chai';
import { spy, assert } from 'sinon';
import { Bin, MethodDef } from '../interfaces';
import { createPacketHandler, PacketHandler, RemoteState, Send } from '../packet/packetHandler';
import { createBinaryReader } from '../packet/binaryReader';

describe('binary encoding', () => {
	const client: MethodDef[] = [
		['foo', { binary: [Bin.U8, Bin.F64] }],
		['boo', { binary: [Bin.Obj, [Bin.I32], [Bin.I32, Bin.I32, [Bin.I32]], [Bin.Obj]] }],
		['far', { binary: [[Bin.I32, [Bin.I32, Bin.I32]]] }],
		['fab', { binary: [[Bin.I32, [Bin.I32]]] }],
		['obj', { binary: [[Bin.Obj]] }],
		['array_of_numbers', { binary: [[Bin.U8]] }],
		['all', { binary: [Bin.I8, Bin.U8, Bin.I16, Bin.U16, Bin.I32, Bin.U32, Bin.F32, Bin.F64, Bin.Bool, Bin.Str, Bin.Obj] }],
		['buf', { binary: [Bin.Buffer] }],
		['u8a', { binary: [Bin.U8Array] }],
		['u8aa', { binary: [[Bin.U8Array]] }],
		['raw', { binary: [Bin.Raw] }],
		['raw2', { binary: [Bin.U16, Bin.Raw] }],
		['mix', { binary: [[Bin.U8, Bin.U16, Bin.F64, Bin.F64, Bin.F64, Bin.F64, Bin.Bool, Bin.Obj, [Bin.I16], Bin.U8Array]] }],
		['u8_off_len', { binary: [Bin.U8ArrayOffsetLength] }],
		['view_off_len', { binary: [Bin.DataViewOffsetLength] }],
		['long_array_of_arrays', { binary: [Bin.Str, [Bin.Str, Bin.Str, Bin.Str, Bin.Str, Bin.Str, Bin.Bool, Bin.U32, Bin.Str, Bin.Str, Bin.U8]] }],
		['object', { binary: [{ foo: Bin.Str, bar: Bin.I32 }] }],
		['foo1', { binary: [Bin.Obj] }],
		['foo2', { binary: [Bin.Obj] }],
	];

	const server: MethodDef[] = [
		['bar', { binary: [Bin.U8, Bin.Str] }],
		['boo', { binary: [Bin.Obj, [Bin.I32], [Bin.I32, Bin.I32, [Bin.I32]], [Bin.Obj]] }],
	];

	let actions: any;
	let remote: any;
	let remoteState: RemoteState;
	let sender: PacketHandler;
	let receiver: PacketHandler;
	let send: Send;

	beforeEach(() => {
		actions = {};
		remote = {};
		sender = createPacketHandler(server, client, { development: true }, console.log);
		receiver = createPacketHandler(client, server, { development: true }, console.log);
		send = (buffer: Uint8Array | string) => {
			if (typeof buffer === 'string') throw new Error('buffer is string');
			// console.log(buffer.byteLength);
			// console.log(buffer);
			const reader = createBinaryReader(buffer);
			const strings: string[] = [];
			while (reader.offset < reader.view.byteLength) {
				receiver.recvBinary(reader, actions, {}, [], 0, strings);
			}
		};
		remoteState = { supportsBinary: true, sentSize: 0, batch: false };
		sender.createRemote(remote, send, remoteState);
	});

	it('numbers', () => {
		actions.foo = spy();

		remote.foo(8, 1.5);

		assert.calledWith(actions.foo, 8, 1.5);
	});

	it('arrays', () => {
		actions.boo = spy();

		remote.boo({ foo: 'bar' }, [1, 2, 3], [[10, 20, [3, 3, 4]], [3, 4, [1, 2, 3]]], [{ a: 1 }, { b: 2 }]);

		assert.calledWithMatch(actions.boo, { foo: 'bar' }, [1, 2, 3], [[10, 20, [3, 3, 4]], [3, 4, [1, 2, 3]]], [{ a: 1 }, { b: 2 }]);
	});

	it('arrays 2', () => {
		actions.far = spy();

		remote.far([[10, [[1, 2]]]]);

		assert.calledWithMatch(actions.far, [[10, [[1, 2]]]]);
	});

	it('arrays 3', () => {
		actions.fab = spy();

		remote.fab([[10, [3, 3, 4]]]);

		assert.calledWithMatch(actions.fab, [[10, [3, 3, 4]]]);
	});

	it('array of objects', () => {
		actions.obj = spy();

		remote.obj([{ a: 1 }, { b: 2 }]);

		assert.calledWithMatch(actions.obj, [{ a: 1 }, { b: 2 }]);
	});

	it('array of numbers', () => {
		actions.array_of_numbers = spy();

		remote.array_of_numbers([1, 2, 3, 4]);

		assert.calledWithMatch(actions.array_of_numbers, [1, 2, 3, 4]);
	});

	it('array of numbers (bad)', () => {
		actions.array_of_numbers = spy();

		remote.array_of_numbers(undefined);

		assert.calledWithMatch(actions.array_of_numbers, []);
	});

	it('array of objects (re-use string map)', () => {
		actions.obj = spy();

		remote.obj([{ test: 1 }, { test: 2 }, { test: 3 }, { test: 4 }]);

		assert.calledWithMatch(actions.obj, [{ test: 1 }, { test: 2 }, { test: 3 }, { test: 4 }]);
	});

	it('all types', () => {
		actions.all = spy();

		remote.all(-123, 200, -500, 40000, -40000, 100000, 1.5, -2.5, true, 'foo', { x: 2 });

		assert.calledWithMatch(actions.all, -123, 200, -500, 40000, -40000, 100000, 1.5, -2.5, true, 'foo', { x: 2 });
	});

	it('ArrayBuffer', () => {
		actions.buf = spy();

		remote.buf(new Uint8Array([1, 2, 3]).buffer);

		expect(new Uint8Array(actions.buf.args[0][0])).eql(new Uint8Array([1, 2, 3]));
	});

	it('Uint8Array', () => {
		actions.u8a = spy();

		remote.u8a(new Uint8Array([1, 2, 3]));

		assert.calledWithMatch(actions.u8a, new Uint8Array([1, 2, 3]));
	});

	it('Uint8Array (empty)', () => {
		actions.u8a = spy();

		remote.u8a(new Uint8Array(0));

		assert.calledWithMatch(actions.u8a, new Uint8Array(0));
	});

	it('Uint8Array (null)', () => {
		actions.u8a = spy();

		remote.u8a(null);

		assert.calledWith(actions.u8a, null);
	});

	it('array of Uint8Array', () => {
		actions.u8aa = spy();

		remote.u8aa([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])]);

		assert.calledWithMatch(actions.u8aa, [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])]);
	});

	it('raw', () => {
		actions.raw = spy();

		remote.raw(new Uint8Array([1, 2, 3, 4, 5]));

		assert.calledWithMatch(actions.raw, new Uint8Array([1, 2, 3, 4, 5]));
	});

	it('raw with data', () => {
		actions.raw2 = spy();

		remote.raw2(123, new Uint8Array([1, 2, 3, 4, 5]));

		assert.calledWithMatch(actions.raw2, 123, new Uint8Array([1, 2, 3, 4, 5]));
	});

	[
		0, 1, 2, 16, 0x7f, 0x80, 0xff, 0x3fff, 0xc000, //0x70000,
	].forEach(length => it(`mixed complex data, length: ${length}`, () => {
		actions.mix = spy();
		const data = [
			[
				2, 5, 0, 0, 0, 0, false,
				{ id: 20, color: 4294967295, opacity: 1, rect: { x: 0, y: 0, w: 1920, h: 1080 }, fill: true, t: 0 },
				[1, 2, 3], new Uint8Array(length)
			],
			[
				2, 5, 0, 0, 0, 0, false,
				{ id: 20, color: 4294967295, opacity: 1, rect: { x: 0, y: 0, w: 1920, h: 1080 }, fill: true, t: 0 },
				[1, 2, 3], new Uint8Array(10)
			],
		];

		remote.mix(data);

		assert.calledWithMatch(actions.mix, data);
	}));

	it('uint8array + offset + length', () => {
		actions.u8_off_len = (buffer: Uint8Array, offset: number, length: number) => {
			expect(buffer).instanceOf(Uint8Array);
			expect(offset).equal(0);
			expect(length).equal(3);
			expect(buffer[offset]).equal(2);
			expect(buffer[offset + 1]).equal(3);
			expect(buffer[offset + 2]).equal(4);
		};

		const buffer = new ArrayBuffer(5);
		const data = new Uint8Array(buffer);
		data.set([1, 2, 3, 4, 5]);
		remote.u8_off_len(data, 1, 3);
	});

	it('data view + offset + length', () => {
		actions.view_off_len = (view: DataView, offset: number, length: number) => {
			expect(view).instanceOf(DataView);
			expect(offset).equal(2);
			expect(length).equal(3);
			expect(view.getUint8(offset)).equal(2);
			expect(view.getUint8(offset + 1)).equal(3);
			expect(view.getUint8(offset + 2)).equal(4);
		};

		const buffer = new ArrayBuffer(5);
		const data = new Uint8Array(buffer);
		data.set([1, 2, 3, 4, 5]);
		const view = new DataView(buffer);
		remote.view_off_len(view, 1, 3);
	});

	it('long array of arrays', () => {
		const dataName = "Yellow Bear";
		const dataArray: any[] = [
			['61b2a512ac73edb533d3e209', '_QTs3OgZ', 'Yellow Bear', '#46baff', 'VlZD4sJbK2GypTRcmOOUlA.png', true, 0, 'aaa', 'bbb', 5],
		];

		actions.long_array_of_arrays = (name: string, array: any[]) => {
			expect(name).equal(dataName);
			expect(array).eql(dataArray);
		};

		remote.long_array_of_arrays(dataName, dataArray);
	});

	it('objects', () => {
		const dataObject: any = {
			foo: 'test',
			bar: 123,
		};

		actions.object = (obj: any) => {
			expect(obj).eql(dataObject);
		};

		remote.object(dataObject);
	});

	it('batch', () => {
		actions.foo1 = spy();
		actions.foo2 = spy();

		remoteState.batch = true;
		remote.foo1({ foo: 'test string' });
		remote.foo2({ foo: 'test string' });
		sender.commitBatch(send, remoteState);
		remoteState.batch = false;

		assert.calledWithMatch(actions.foo1, { foo: 'test string' });
		assert.calledWithMatch(actions.foo2, { foo: 'test string' });
	});
});
