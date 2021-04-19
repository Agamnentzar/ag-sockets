import './common';
import { expect } from 'chai';
import { parseRateLimit, getLength, queryString, checkRateLimit2 } from '../utils';
import { CallsList, RateLimitDef } from '../interfaces';

describe('getLength()', () => {
	it('returns 0 for null or undefined', () => {
		expect(getLength(null)).equal(0);
		expect(getLength(undefined)).equal(0);
	});

	it('returns length of given string', () => {
		expect(getLength('')).equal(0);
		expect(getLength('12345')).equal(5);
	});

	it('returns length of given Buffer', () => {
		expect(getLength(Buffer.alloc(0))).equal(0);
		expect(getLength(Buffer.alloc(5))).equal(5);
	});

	it('returns length of given ArrayBuffer', () => {
		expect(getLength(new ArrayBuffer(0))).equal(0);
		expect(getLength(new ArrayBuffer(5))).equal(5);
	});

	it('returns integer value', () => {
		expect(getLength({ length: 0.5 })).equal(0);
		expect(getLength({ length: 5.1 })).equal(5);
	});
});

describe('queryString()', () => {
	it('returns empty string for empty object', () => {
		expect(queryString({})).equal('');
	});

	it('returns empty string for null or undefined', () => {
		expect(queryString(null)).equal('');
		expect(queryString(undefined)).equal('');
	});

	it('returns correct query string', () => {
		expect(queryString({ foo: 'aaa', bar: 'test' })).equal('?foo=aaa&bar=test');
	});

	it('encodes parameters', () => {
		expect(queryString({ bar: '&x=5 aaa' })).equal('?bar=%26x%3D5%20aaa');
	});

	it('encodes numbers', () => {
		expect(queryString({ foo: 5, bar: 4.5 })).equal('?foo=5&bar=4.5');
	});

	it('encodes booleans', () => {
		expect(queryString({ foo: true, bar: false })).equal('?foo=true&bar=false');
	});

	it('encodes empty strings', () => {
		expect(queryString({ foo: '', bar: 'aaa' })).equal('?foo=&bar=aaa');
	});

	it('ignores empty parameters', () => {
		expect(queryString({ foo: 'a', boo: null, baa: undefined })).equal('?foo=a');
	});
});

describe('parseRateLimit()', () => {
	it('throws on null', () => {
		expect(() => parseRateLimit(null as any, false)).throw();
	});

	it('throws on empty', () => {
		expect(() => parseRateLimit('', false)).throw();
	});

	it('throws on invalid', () => {
		expect(() => parseRateLimit('sgdf', false)).throw();
	});

	it('returns correct value for 1/s', () => {
		expect(parseRateLimit('1/s', false)).eql({ limit: 1, frame: 1000 });
	});

	it('returns correct value for 5/s', () => {
		expect(parseRateLimit('5/s', false)).eql({ limit: 5, frame: 1000 });
	});

	it('returns correct value for 5/10s', () => {
		expect(parseRateLimit('5/10s', false)).eql({ limit: 5, frame: 10000 });
	});

	it('returns correct value for 5/m', () => {
		expect(parseRateLimit('5/m', false)).eql({ limit: 5, frame: 60 * 1000 });
	});

	it('returns correct value for 1/h', () => {
		expect(parseRateLimit('1/h', false)).eql({ limit: 1, frame: 3600 * 1000 });
	});

	it('extends time', () => {
		expect(parseRateLimit('1/s', true)).eql({ limit: 2, frame: 2 * 1000 });
	});

	it('does not extend long time', () => {
		expect(parseRateLimit('1/h', true)).eql({ limit: 1, frame: 3600 * 1000 });
	});
});

describe('checkRateLimit()', () => {
	it('returns true for no rate limit entry', () => {
		expect(checkRateLimit2(1, [], [])).true;
	});

	it('return true for passing rate limit', () => {
		expect(checkRateLimit2(0, [[Date.now() - 500]], [{ limit: 2, frame: 1000, promise: false }])).true;
	});

	it('returns false for not passing rate limit', () => {
		expect(checkRateLimit2(0, [[Date.now() - 500, Date.now() - 200]], [{ limit: 2, frame: 1000, promise: false }])).false;
	});

	it('updates rate limit if passing', () => {
		const now = Date.now();
		const rateLimits: RateLimitDef[] = [{ limit: 5, frame: 1000, promise: false }];
		const callsList: CallsList = [[now - 500]];

		checkRateLimit2(0, callsList, rateLimits);

		expect(callsList[0]!.length).equals(2);
	});
});
