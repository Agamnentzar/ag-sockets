import './common';
import { expect } from 'chai';
import { encodeString, decodeString } from '../utf8';

describe('utf8', function () {
	describe('encodeString()', function () {
		it('should return null for null input', function () {
			expect(encodeString(null)).null;
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
	});

	describe('encodeString() + decodeString()', function () {
		const tests: string[] = [
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
