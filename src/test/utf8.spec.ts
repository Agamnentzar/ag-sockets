import './common';
import { expect } from 'chai';
import { encodeString, encodeStringTo, decodeString } from '../utf8';

describe('utf8', function () {
	describe('encodeString()', function () {
		it('should return null for null input', function () {
			expect(encodeString(null)).null;
		});
	});

	describe('encodeStringTo()', function () {
		it('should write string to Uint8Array at specified offset', function () {
			const buffer = new Uint8Array(10);
			encodeStringTo(buffer, 5, 'abc');

			expect(buffer[5]).equal('a'.charCodeAt(0));
			expect(buffer[6]).equal('b'.charCodeAt(0));
			expect(buffer[7]).equal('c'.charCodeAt(0));
		});

		it('should write string to Buffer at specified offset', function () {
			const buffer = new Buffer(10);
			encodeStringTo(buffer, 5, 'abc');

			expect(buffer[5]).equal('a'.charCodeAt(0));
			expect(buffer[6]).equal('b'.charCodeAt(0));
			expect(buffer[7]).equal('c'.charCodeAt(0));
		});
	});

	describe('decodeString()', function () {
		it('should return null for null input', function () {
			expect(decodeString(null)).null;
		});

		it('should throw on ivalid continuation byte (missing byte)', function () {
			expect(() => decodeString(new Uint8Array([0xc0]))).throw('Invalid byte index');
		});

		it('should throw on ivalid continuation byte (0x00)', function () {
			expect(() => decodeString(new Uint8Array([0xc0, 0x00]))).throw('Invalid continuation byte');
		});

		it('should throw on ivalid continuation byte (2-byte)', function () {
			expect(() => decodeString(new Uint8Array([0xc0, 0x80]))).throw('Invalid continuation byte');
		});

		it('should throw on ivalid continuation byte (3-byte)', function () {
			expect(() => decodeString(new Uint8Array([0xe0, 0x80, 0x80]))).throw('Invalid continuation byte');
		});

		it('should throw on ivalid continuation byte (4-byte)', function () {
			expect(() => decodeString(new Uint8Array([0xf0, 0x80, 0x80, 0x80]))).throw('Invalid continuation byte');
		});

		it('should throw on invalid UTF-8', function () {
			expect(() => decodeString(new Uint8Array([0xff]))).throw('Invalid UTF-8 detected');
		});

		it('should throw on lone surrogate', function () {
			expect(() => decodeString(new Uint8Array([0xed, 0xa3, 0xbf]))).throw('Lone surrogate U+D8FF is not a scalar value');
		});
	});

	describe('encodeString() + decodeString()', function () {
		const tests: (string | null)[] = [
			null,
			'',
			'foo',
			'część',
			'猫',
			'🐎',
		];

		tests.forEach(t => {
			it(`should work for: ${t}`, function () {
				expect(decodeString(encodeString(t))).equal(t);
			});
		});
	});
});
