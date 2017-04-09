import './common';
import { expect } from 'chai';
import { randomString, parseRateLimit, checkRateLimit, getLength, queryString } from '../utils';

describe('randomString()', function () {
	it('returns random string of given length', function () {
		const result = randomString(10);

		expect(result).a('string');
		expect(result).length(10);
	});
});

describe('getLength()', function () {
	it('returns 0 for null or undefined', function () {
		expect(getLength(null)).equal(0);
		expect(getLength(void 0)).equal(0);
	});

	it('returns length of given string', function () {
		expect(getLength('')).equal(0);
		expect(getLength('12345')).equal(5);
	});

	it('returns length of given Buffer', function () {
		expect(getLength(new Buffer(0))).equal(0);
		expect(getLength(new Buffer(5))).equal(5);
	});

	it('returns length of given ArrayBuffer', function () {
		expect(getLength(new ArrayBuffer(0))).equal(0);
		expect(getLength(new ArrayBuffer(5))).equal(5);
	});

	it('returns integer value', function () {
		expect(getLength({ length: 0.5 })).equal(0);
		expect(getLength({ length: 5.1 })).equal(5);
	});
});

describe('queryString()', function () {
	it('returns empty string for empty object', function () {
		expect(queryString({})).equal('');
	});

	it('returns empty string for null or undefined', function () {
		expect(queryString(null)).equal('');
		expect(queryString(void 0)).equal('');
	});

	it('returns correct query string', function () {
		expect(queryString({ foo: 'aaa', bar: 'test' })).equal('?foo=aaa&bar=test');
	});

	it('encodes parameters', function () {
		expect(queryString({ bar: '&x=5 aaa' })).equal('?bar=%26x%3D5%20aaa');
	});

	it('encodes numbers', function () {
		expect(queryString({ foo: 5, bar: 4.5 })).equal('?foo=5&bar=4.5');
	});

	it('encodes booleans', function () {
		expect(queryString({ foo: true, bar: false })).equal('?foo=true&bar=false');
	});

	it('encodes empty strings', function () {
		expect(queryString({ foo: '', bar: 'aaa' })).equal('?foo=&bar=aaa');
	});

	it('ignores empty parameters', function () {
		expect(queryString({ foo: 'a', boo: null, baa: void 0 })).equal('?foo=a');
	});
});

describe('parseRateLimit()', function () {
	it('throws on null', function () {
		expect(() => parseRateLimit(null as any, false)).throw();
	});

	it('throws on empty', function () {
		expect(() => parseRateLimit('', false)).throw();
	});

	it('throws on invalid', function () {
		expect(() => parseRateLimit('sgdf', false)).throw();
	});

	it('returns correct value for 1/s', function () {
		expect(parseRateLimit('1/s', false)).eql({ limit: 1, frame: 1000 });
	});

	it('returns correct value for 5/s', function () {
		expect(parseRateLimit('5/s', false)).eql({ limit: 5, frame: 1000 });
	});

	it('returns correct value for 5/10s', function () {
		expect(parseRateLimit('5/10s', false)).eql({ limit: 5, frame: 10000 });
	});

	it('returns correct value for 5/m', function () {
		expect(parseRateLimit('5/m', false)).eql({ limit: 5, frame: 60 * 1000 });
	});

	it('returns correct value for 1/h', function () {
		expect(parseRateLimit('1/h', false)).eql({ limit: 1, frame: 3600 * 1000 });
	});

	it('extends time', function () {
		expect(parseRateLimit('1/s', true)).eql({ limit: 2, frame: 2 * 1000 });
	});

	it('does not extend long time', function () {
		expect(parseRateLimit('1/h', true)).eql({ limit: 1, frame: 3600 * 1000 });
	});
});

describe('checkRateLimit()', function () {
	it('returns true for no rate limit entry', function () {
		expect(checkRateLimit(1, [])).true;
	});

	it('return true for passing rate limit', function () {
		expect(checkRateLimit(0, [{ limit: 2, frame: 1000, calls: [Date.now() - 500] }])).true;
	});

	it('returns false for not passing rate limit', function () {
		expect(checkRateLimit(0, [{ limit: 2, frame: 1000, calls: [Date.now() - 500, Date.now() - 200] }])).false;
	});

	it('updates rate limit if passing', function () {
		const now = Date.now();
		const rateLimit = { limit: 5, frame: 1000, calls: [now - 500] };

		checkRateLimit(0, [rateLimit]);

		expect(rateLimit.calls.length).equals(2);
	});
});
