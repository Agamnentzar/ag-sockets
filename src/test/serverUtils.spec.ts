import './common';
import { expect } from 'chai';
import { randomString } from '../serverUtils';

describe('serverUtils', () => {
	describe('randomString()', () => {
		it('returns random string of given length', () => {
			const result = randomString(10);

			expect(result).a('string');
			expect(result).length(10);
		});
	});
});
