import './common';
import { expect } from 'chai';
import { randomString, parseRateLimit, checkRateLimit } from '../utils';

describe('randomString()', function () {
	it('should return random string of given length', function () {
		const result = randomString(10);

		expect(result).a('string');
		expect(result).length(10);
	});
});

describe('parseRateLimit()', function () {
	it('should throw on null', function () {
		expect(() => parseRateLimit(null as any)).throw();
	});

	it('should throw on empty', function () {
		expect(() => parseRateLimit('')).throw();
	});

	it('should throw on invalid', function () {
		expect(() => parseRateLimit('sgdf')).throw();
	});

	it('should return correct value for 1/s', function () {
		expect(parseRateLimit('1/s')).eql({ limit: 1, frame: 1000 });
	});

	it('should return correct value for 5/s', function () {
		expect(parseRateLimit('5/s')).eql({ limit: 5, frame: 1000 });
	});

	it('should return correct value for 5/10s', function () {
		expect(parseRateLimit('5/10s')).eql({ limit: 5, frame: 10000 });
	});

	it('should return correct value for 5/m', function () {
		expect(parseRateLimit('5/m')).eql({ limit: 5, frame: 60 * 1000 });
	});

	it('should return correct value for 1/h', function () {
		expect(parseRateLimit('1/h')).eql({ limit: 1, frame: 3600 * 1000 });
	});
});

describe('checkRateLimit()', function () {
	it('should return true for no rate limit entry', function () {
		expect(checkRateLimit(1, [])).true;
	});

	it('should return true for passing rate limit', function () {
		expect(checkRateLimit(0, [{ limit: 2, frame: 1000, calls: [Date.now() - 500] }])).true;
	});

	it('should return false for not passing rate limit', function () {
		expect(checkRateLimit(0, [{ limit: 2, frame: 1000, calls: [Date.now() - 500, Date.now() - 200] }])).false;
	});

	it('should update rate limit if passing', function () {
		const now = Date.now();
		const rateLimit = { limit: 5, frame: 1000, calls: [now - 500] };

		checkRateLimit(0, [rateLimit]);

		expect(rateLimit.calls.length).equals(2);
	});
});
