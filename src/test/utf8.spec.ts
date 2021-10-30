import './common';
import { expect } from 'chai';
import { encodeStringTo, decodeString, stringLengthInBytes } from '../utf8';

describe('utf8', () => {
	describe('encodeString()', () => {
		it('should return null for null input', () => {
			expect(encodeStringToUint8Array(null)).null;
		});

		it('should remove lone surrogate at the end', () => {
			const buffer = encodeStringToUint8Array('abc\ud83c')!;

			expect(buffer[0]).equal('a'.charCodeAt(0));
			expect(buffer[1]).equal('b'.charCodeAt(0));
			expect(buffer[2]).equal('c'.charCodeAt(0));
		});

		it('should remove lone surrogate in the middle', () => {
			const buffer = encodeStringToUint8Array('abc\ud83cd')!;

			expect(buffer[0]).equal('a'.charCodeAt(0));
			expect(buffer[1]).equal('b'.charCodeAt(0));
			expect(buffer[2]).equal('c'.charCodeAt(0));
			expect(buffer[3]).equal('d'.charCodeAt(0));
		});
	});

	describe('encodeStringTo()', () => {
		it('should write string to Uint8Array at specified offset', () => {
			const buffer = new DataView(new ArrayBuffer(10));
			encodeStringTo(buffer, 5, 'abc');

			expect(buffer.getUint8(5)).equal('a'.charCodeAt(0));
			expect(buffer.getUint8(6)).equal('b'.charCodeAt(0));
			expect(buffer.getUint8(7)).equal('c'.charCodeAt(0));
		});
	});

	describe('decodeString()', () => {
		it('should return null for null input', () => {
			expect(decodeStringFromUint8Array(null)).null;
		});

		it('should throw on ivalid continuation byte (missing byte)', () => {
			expect(() => decodeStringFromUint8Array(new Uint8Array([0xc0]))).throw('Invalid byte index');
		});

		it('should throw on ivalid continuation byte (0x00)', () => {
			expect(() => decodeStringFromUint8Array(new Uint8Array([0xc0, 0x00]))).throw('Invalid continuation byte');
		});

		it('should throw on ivalid continuation byte (2-byte)', () => {
			expect(() => decodeStringFromUint8Array(new Uint8Array([0xc0, 0x80]))).throw('Invalid continuation byte');
		});

		it('should throw on ivalid continuation byte (3-byte)', () => {
			expect(() => decodeStringFromUint8Array(new Uint8Array([0xe0, 0x80, 0x80]))).throw('Invalid continuation byte');
		});

		it('should throw on ivalid continuation byte (4-byte)', () => {
			expect(() => decodeStringFromUint8Array(new Uint8Array([0xf0, 0x80, 0x80, 0x80]))).throw('Invalid continuation byte');
		});

		it('should throw on invalid UTF-8', () => {
			expect(() => decodeStringFromUint8Array(new Uint8Array([0xff]))).throw('Invalid UTF-8 detected');
		});

		it('should throw on lone surrogate', () => {
			expect(() => decodeStringFromUint8Array(new Uint8Array([0xed, 0xa3, 0xbf]))).throw('Lone surrogate U+D8FF is not a scalar value');
		});
	});

	describe('encodeString() + decodeString()', () => {
		const tests: (string | null)[] = [
			null,
			'',
			'foo',
			'część',
			'猫',
			'🐎',
		];

		tests.forEach(t => {
			it(`should work for: ${t}`, () => {
				expect(decodeStringFromUint8Array(encodeStringToUint8Array(t))).equal(t);
			});
		});
	});
});

// only for testing
function encodeStringToUint8Array(value: string | null): Uint8Array | null {
	if (value == null) return null;

	const buffer = new Uint8Array(stringLengthInBytes(value));
	const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
	encodeStringTo(view, 0, value);
	return buffer;
}

function decodeStringFromUint8Array(value: Uint8Array | null) {
	const view = value ? new DataView(value.buffer, value.byteOffset, value.byteLength) : null;
	return decodeString(view, 0, view ? view.byteLength : 0);
}
