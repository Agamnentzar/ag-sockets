import './common';
import { expect } from 'chai';
import { Bin } from '../interfaces';
import { isValid } from '../validate';

type Case = [any, boolean];

describe('validate', function () {
	describe('isValid()', function () {
		const nans: Case[] = [
			['5', false],
			[true, false],
			[null, false],
			[{}, false],
		];
		const notInts: Case[] = [
			[-0.5, false],
			[1.1, false],
			[NaN, false],
			[Infinity, false],
			...nans,
		];
		const floats: Case[] = [
			[0, true],
			[255, true],
			[-1, true],
			[1.1, true],
			[-0.5, true],
			[NaN, true],
			[Infinity, true],
			...nans,
		];
		const tests: [any, string, Case[]][] = [
			[Bin.U8, 'Bin.U8', [
				[0, true],
				[128, true],
				[255, true],
				[-1, false],
				[256, false],
				[999, false],
				...notInts,
			]],
			[Bin.I8, 'Bin.I8', [
				[0, true],
				[-128, true],
				[127, true],
				[-129, false],
				[128, false],
				[999, false],
				...notInts,
			]],
			[Bin.U16, 'Bin.U16', [
				[0, true],
				[255, true],
				[65535, true],
				[-1, false],
				[65536, false],
				[99999, false],
				...notInts,
			]],
			[Bin.I16, 'Bin.I16', [
				[0, true],
				[-32768, true],
				[32767, true],
				[-32769, false],
				[32768, false],
				[99999, false],
				...notInts,
			]],
			[Bin.U32, 'Bin.U32', [
				[0, true],
				[255, true],
				[4294967295, true],
				[-1, false],
				[4294967296, false],
				[9999999999, false],
				...notInts,
			]],
			[Bin.I32, 'Bin.I32', [
				[0, true],
				[-2147483648, true],
				[2147483647, true],
				[-2147483649, false],
				[2147483648, false],
				[9999999999, false],
				...notInts,
			]],
			[Bin.F32, 'Bin.F32', floats],
			[Bin.F64, 'Bin.F64', floats],
			[Bin.Bool, 'Bin.Bool', [
				[true, true],
				[false, true],
				['true', false],
				[1, false],
				[{}, false],
				[null, false],
			]],
			[Bin.Str, 'Bin.Str', [
				['test', true],
				['', true],
				[null, true],
				[1, false],
				[{}, false],
			]],
			[Bin.Obj, 'Bin.Obj', [
				[{}, true],
				[{ foo: 5 }, true],
				[null, true],
				[1, false],
				['test', false],
				[true, false],
			]],
			[[Bin.U8], '[Bin.U8]', [
				[[], true],
				[[1], true],
				[[1, 2, 3], true],
				[[1, 2, 999], false],
				[1, false],
				[{}, false],
				['1, 2, 3', false],
				[null, false],
			]],
			[[Bin.U8, Bin.Str], '[Bin.U8, Bin.Str]', [
				[[], true],
				[[[1, '1']], true],
				[[[1, '1'], [2, '2']], true],
				[[[1, null]], true],
				[[[999, '1']], false],
				[[[1, '1'], '12'], false],
				[[[1, '1'], 2], false],
				[[[1, '1'], null], false],
				[[[1, 2]], false],
				[[[1]], false],
				[[1], false],
				[['1', 2], false],
				[1, false],
				[{}, false],
				['1, 2, 3', false],
				[null, false],
			]],
		];

		tests.forEach(([type, name, cases]) => {
			cases.forEach(([value, result]) => {
				it(`should return '${result}' for value '${JSON.stringify(value)}' and type '${name}'`, function () {
					expect(isValid(value, type)).equal(result);
				});
			});
		});
	});
});
