import './common';
import { expect } from 'chai';
import { randomString, checkRateLimit } from '../utils';

describe('randomString', function () {
	it('should return random string of given length', function () {
		const result = randomString(10);

		expect(result).a('string');
		expect(result).length(10);
	});
});

describe('checkRateLimit', function () {
	it('should return true for no rate limit entry', function () {
		expect(checkRateLimit(1, [])).true;
	});

	it('should return true for passing rate limit', function () {
		expect(checkRateLimit(0, [{ limit: 1000, last: Date.now() - 2000 }])).true;
	});

	it('should return false for not passing rate limit', function () {
		expect(checkRateLimit(0, [{ limit: 1000, last: Date.now() - 500 }])).false;
	});

	it('should update rate limit if passing', function () {
		const now = Date.now();
		const rateLimit = { limit: 1000, last: now - 2000 };

		checkRateLimit(0, [rateLimit]);

		expect(rateLimit.last).at.least(now);
	});
});
