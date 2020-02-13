import './common';
import { expect } from 'chai';
import { encodeString, encodeStringTo, decodeString } from '../utf8';

describe('utf8', () => {
	describe('encodeString()', () => {
		it('should return null for null input', () => {
			expect(encodeString(null)).null;
		});

		it('should remove lone surrogate at the end', () => {
			const buffer = encodeString('abc\ud83c')!;

			expect(buffer[0]).equal('a'.charCodeAt(0));
			expect(buffer[1]).equal('b'.charCodeAt(0));
			expect(buffer[2]).equal('c'.charCodeAt(0));
		});

		it('should remove lone surrogate in the middle', () => {
			const buffer = encodeString('abc\ud83cd')!;

			expect(buffer[0]).equal('a'.charCodeAt(0));
			expect(buffer[1]).equal('b'.charCodeAt(0));
			expect(buffer[2]).equal('c'.charCodeAt(0));
			expect(buffer[3]).equal('d'.charCodeAt(0));
		});
	});

	describe('encodeStringTo()', () => {
		it('should write string to Uint8Array at specified offset', () => {
			const buffer = new Uint8Array(10);
			encodeStringTo(buffer, 5, 'abc');

			expect(buffer[5]).equal('a'.charCodeAt(0));
			expect(buffer[6]).equal('b'.charCodeAt(0));
			expect(buffer[7]).equal('c'.charCodeAt(0));
		});

		it('should write string to Buffer at specified offset', () => {
			const buffer = Buffer.alloc(10);
			encodeStringTo(buffer, 5, 'abc');

			expect(buffer[5]).equal('a'.charCodeAt(0));
			expect(buffer[6]).equal('b'.charCodeAt(0));
			expect(buffer[7]).equal('c'.charCodeAt(0));
		});
	});

	describe('decodeString()', () => {
		it('should return null for null input', () => {
			expect(decodeString(null)).null;
		});

		it('should throw on ivalid continuation byte (missing byte)', () => {
			expect(() => decodeString(new Uint8Array([0xc0]))).throw('Invalid byte index');
		});

		it('should throw on ivalid continuation byte (0x00)', () => {
			expect(() => decodeString(new Uint8Array([0xc0, 0x00]))).throw('Invalid continuation byte');
		});

		it('should throw on ivalid continuation byte (2-byte)', () => {
			expect(() => decodeString(new Uint8Array([0xc0, 0x80]))).throw('Invalid continuation byte');
		});

		it('should throw on ivalid continuation byte (3-byte)', () => {
			expect(() => decodeString(new Uint8Array([0xe0, 0x80, 0x80]))).throw('Invalid continuation byte');
		});

		it('should throw on ivalid continuation byte (4-byte)', () => {
			expect(() => decodeString(new Uint8Array([0xf0, 0x80, 0x80, 0x80]))).throw('Invalid continuation byte');
		});

		it('should throw on invalid UTF-8', () => {
			expect(() => decodeString(new Uint8Array([0xff]))).throw('Invalid UTF-8 detected');
		});

		it('should throw on lone surrogate', () => {
			expect(() => decodeString(new Uint8Array([0xed, 0xa3, 0xbf]))).throw('Lone surrogate U+D8FF is not a scalar value');
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
				expect(decodeString(encodeString(t))).equal(t);
			});
		});
	});
});
