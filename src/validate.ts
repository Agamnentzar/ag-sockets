import { Bin } from './interfaces';

type Validator = (value: any) => boolean;

function isNumber(value: any): value is number {
	return typeof value === 'number';
}

function isInt(min: number, max: number) {
	return (value: any) => isNumber(value) && ((value | 0) === value) && value >= min && value <= max;
}

function isUint(max: number) {
	return (value: any) => isNumber(value) && ((value >>> 0) === value) && value >= 0 && value <= max;
}

const validators: Validator[] = [];
validators[Bin.U8] = isUint(0xff);
validators[Bin.I8] = isInt(-128, 127);
validators[Bin.U16] = isUint(0xffff);
validators[Bin.I16] = isInt(-32768, 32767);
validators[Bin.U32] = isUint(0xffffffff);
validators[Bin.I32] = isInt(-2147483648, 2147483647);
validators[Bin.F32] = value => isNumber(value);
validators[Bin.F64] = value => isNumber(value);
validators[Bin.Bool] = value => value === true || value === false;
validators[Bin.Str] = value => value === null || typeof value === 'string';
validators[Bin.Obj] = value => value === null || typeof value === 'object';

export function isValid(value: any, def: any): boolean {
	if (Array.isArray(def)) {
		if (!Array.isArray(value))
			return false;

		if (def.length === 1) {
			return value.every(v => isValid(v, def[0]));
		} else {
			return value.every(v => {
				if (!v || v.length !== def.length)
					return false;

				for (let i = 0; i < def.length; i++) {
					if (!isValid(v[i], def[i]))
						return false;
				}

				return true;
			});
		}
	} else {
		return validators[def](value);
	}
}
