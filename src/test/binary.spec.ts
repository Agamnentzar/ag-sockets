import './common';
// import { expect } from 'chai';
// import { Bin } from '../interfaces';
// import { IBinaryHandlers } from '../packet/packetHandler';
// import { createBinaryWriter, getWriterBuffer, BinaryWriter } from '../packet/binaryWriter';
// import { createBinaryReader, BinaryReader, readUint8 } from '../packet/binaryReader';

describe('binaryHandler', () => {
	// const client: Packets = {
	// 	foo: [Bin.U8, Bin.F64],
	// 	boo: [Bin.Obj, [Bin.I32], [Bin.I32, Bin.I32, [Bin.I32]], [Bin.Obj]],
	// 	far: [[Bin.I32, [Bin.I32, Bin.I32]]],
	// 	fab: [[Bin.I32, [Bin.I32]]],
	// 	obj: [[Bin.Obj]],
	// 	all: [Bin.I8, Bin.U8, Bin.I16, Bin.U16, Bin.I32, Bin.U32, Bin.F32, Bin.F64, Bin.Bool, Bin.Str, Bin.Obj],
	// 	buf: [Bin.Buffer],
	// 	u8a: [Bin.U8Array],
	// 	u8aa: [[Bin.U8Array]],
	// 	obj1: [Bin.Obj],
	// 	raw: [Bin.Raw],
	// };

	// const server: Packets = {
	// 	bar: [Bin.U8, Bin.Str],
	// 	boo: [Bin.Obj, [Bin.I32], [Bin.I32, Bin.I32, [Bin.I32]], [Bin.Obj]],
	// };

	// describe('createHandlers(server)', () => {
	// 	it('should create writers for client', () => {
	// 		const handlers: IBinaryHandlers = createHandlers(client, server);

	// 		expect(handlers.write['foo']).exist;
	// 	});

	// 	it('should create readers for server', () => {
	// 		const handlers: IBinaryHandlers = createHandlers(client, server);

	// 		expect(handlers.read['bar']).exist;
	// 	});

	// 	it('should create proper write method', () => {
	// 		const handlers: IBinaryHandlers = createHandlers(client, server);
	// 		const writer = createBinaryWriter();

	// 		handlers.write['foo'](writer, [1, 8, 1.5]);

	// 		expect(Array.from(getWriterBuffer(writer))).eql([0x01, 0x08, 0x03f, 0xf8, 0, 0, 0, 0, 0, 0]);
	// 	});
	// });

	// describe('createHandlers(client)', () => {
	// 	it('should create writers for server', () => {
	// 		const handlers: IBinaryHandlers = createHandlers(server, client);

	// 		expect(handlers.write['bar']).exist;
	// 	});

	// 	it('should create readers for client', () => {
	// 		const handlers: IBinaryHandlers = createHandlers(server, client);

	// 		expect(handlers.read['foo']).exist;
	// 	});

	// 	it('should create proper read method', () => {
	// 		const handlers: IBinaryHandlers = createHandlers(server, client);
	// 		const reader = createBinaryReader(new Uint8Array([0x01, 0x08, 0x03f, 0xf8, 0, 0, 0, 0, 0, 0]));
	// 		const result = [readUint8(reader)];

	// 		handlers.read['foo'](reader, result);

	// 		expect(result).eql([1, 8, 1.5]);
	// 	});
	// });

	// describe('readWriteTests', () => {
	// 	let serverSide: IBinaryHandlers;
	// 	let clientSide: IBinaryHandlers;
	// 	let reader: BinaryReader;
	// 	let writer: BinaryWriter;

	// 	beforeEach(() => {
	// 		serverSide = createHandlers(client, server);
	// 		clientSide = createHandlers(server, client);
	// 		writer = createBinaryWriter(10000);
	// 	});

	// 	it('shoud read write simple method', () => {
	// 		serverSide.write['foo'](writer, [1, 8, 1.5]);
	// 		reader = createBinaryReader(getWriterBuffer(writer));
	// 		const result = [readUint8(reader)];
	// 		clientSide.read['foo'](reader, result);

	// 		expect(result).eql([1, 8, 1.5]);
	// 	});

	// 	it('shoud read write complex arrays method', () => {
	// 		serverSide.write['far'](writer, [3, [[10, [[1, 2]]]]]);
	// 		reader = createBinaryReader(getWriterBuffer(writer));
	// 		const result = [readUint8(reader)];
	// 		clientSide.read['far'](reader, result);

	// 		expect(result).eql([3, [[10, [[1, 2]]]]]);
	// 	});

	// 	it('shoud read write simple arrays method', () => {
	// 		serverSide.write['fab'](writer, [4, [[10, [3, 3, 4]]]]);
	// 		reader = createBinaryReader(getWriterBuffer(writer));
	// 		const result = [readUint8(reader)];
	// 		clientSide.read['fab'](reader, result);

	// 		expect(result).eql([4, [[10, [3, 3, 4]]]]);
	// 	});

	// 	it('shoud read write arrays of objects method', () => {
	// 		serverSide.write['obj'](writer, [4, [{ a: 1 }, { b: 2 }]]);
	// 		reader = createBinaryReader(getWriterBuffer(writer));
	// 		const result = [readUint8(reader)];
	// 		clientSide.read['obj'](reader, result);

	// 		expect(result).eql([4, [{ a: 1 }, { b: 2 }]]);
	// 	});

	// 	it('shoud read write complex method', () => {
	// 		serverSide.write['boo'](writer, [2, { foo: 'bar' }, [1, 2, 3], [[10, 20, [3, 3, 4]], [3, 4, null]], [{ a: 1 }, { b: 2 }]]);
	// 		reader = createBinaryReader(getWriterBuffer(writer));
	// 		const result = [readUint8(reader)];
	// 		clientSide.read['boo'](reader, result);

	// 		expect(result).eql([2, { foo: 'bar' }, [1, 2, 3], [[10, 20, [3, 3, 4]], [3, 4, null]], [{ a: 1 }, { b: 2 }]]);
	// 	});

	// 	it('should read write all types', () => {
	// 		serverSide.write['all'](writer, [5, -123, 200, -500, 40000, -40000, 100000, 1.5, -2.5, true, 'foo', { x: 2 }]);
	// 		reader = createBinaryReader(getWriterBuffer(writer));
	// 		const result = [readUint8(reader)];
	// 		clientSide.read['all'](reader, result);

	// 		expect(result).eql([5, -123, 200, -500, 40000, -40000, 100000, 1.5, -2.5, true, 'foo', { x: 2 }]);
	// 	});

	// 	it('shoud read write method with ArrayBuffer', () => {
	// 		serverSide.write['buf'](writer, [1, new Uint8Array([1, 2, 3]).buffer]);
	// 		reader = createBinaryReader(getWriterBuffer(writer));
	// 		const result = [readUint8(reader)];
	// 		clientSide.read['buf'](reader, result);

	// 		expect(new Uint8Array(result[1])).eql(new Uint8Array([1, 2, 3]));
	// 	});

	// 	it('shoud read write method with Uint8Array', () => {
	// 		serverSide.write['u8a'](writer, [1, new Uint8Array([1, 2, 3])]);
	// 		reader = createBinaryReader(getWriterBuffer(writer));
	// 		const result = [readUint8(reader)];
	// 		clientSide.read['u8a'](reader, result);

	// 		expect(result[1]).eql(new Uint8Array([1, 2, 3]));
	// 	});

	// 	it('reads and writes array of Uint8Arrays', () => {
	// 		serverSide.write['u8aa'](writer, [1, [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])]]);
	// 		reader = createBinaryReader(getWriterBuffer(writer));
	// 		const result = [readUint8(reader)];
	// 		clientSide.read['u8aa'](reader, result);

	// 		expect(result[1]).eql([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])]);
	// 	});

	// 	it('reads and writes raw buffer', () => {
	// 		serverSide.write['raw'](writer, [1, new Uint8Array([1, 2, 3, 4, 5])]);
	// 		reader = createBinaryReader(getWriterBuffer(writer));
	// 		const result = [readUint8(reader)];
	// 		clientSide.read['raw'](reader, result);

	// 		expect(result[1]).eql(new Uint8Array([1, 2, 3, 4, 5]));
	// 	});
	// });
});
