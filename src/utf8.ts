const fromCharCode = String.fromCharCode;

function foreachCharacter(value: string, callback: (code: number) => void) {
	for (let i = 0; i < value.length; i++) {
		let code = value.charCodeAt(i);

		// high surrogate
		if (code >= 0xd800 && code <= 0xdbff && (i + 1) < value.length) {
			let extra = value.charCodeAt(i + 1);

			// low surrogate
			if ((extra & 0xfc00) === 0xdc00) {
				code = ((code & 0x3ff) << 10) + (extra & 0x3ff) + 0x10000;
				i++;
			}
		}

		callback(code);
	}
}

function charLengthInBytes(code: number): number {
	if ((code & 0xffffff80) === 0) {
		return 1;
	} else if ((code & 0xfffff800) === 0) {
		return 2;
	} else if ((code & 0xffff0000) === 0) {
		return 3;
	} else {
		return 4;
	}
}

export function stringLengthInBytes(value: string): number {
	let result = 0;
	foreachCharacter(value, code => result += charLengthInBytes(code));
	return result;
}

export function encodeString(value: string): Uint8Array {
	if (value == null)
		return null;

	let result = new Uint8Array(stringLengthInBytes(value));
	let offset = 0;

	foreachCharacter(value, code => {
		let length = charLengthInBytes(code);

		if (length === 1) {
			result[offset++] = code;
		} else {
			if (length === 2) {
				result[offset++] = ((code >> 6) & 0x1f) | 0xc0;
			} else if (length === 3) {
				result[offset++] = ((code >> 12) & 0x0f) | 0xe0;
				result[offset++] = ((code >> 6) & 0x3f) | 0x80;
			} else {
				result[offset++] = ((code >> 18) & 0x07) | 0xf0;
				result[offset++] = ((code >> 12) & 0x3f) | 0x80;
				result[offset++] = ((code >> 6) & 0x3f) | 0x80;
			}

			result[offset++] = (code & 0x3f) | 0x80;
		}
	});

	return result;
}

function continuationByte(buffer: Uint8Array, index: number): number {
	if (index >= buffer.length) {
		throw Error('Invalid byte index');
	}

	let continuationByte = buffer[index];

	if ((continuationByte & 0xC0) === 0x80) {
		return continuationByte & 0x3F;
	} else {
		throw Error('Invalid continuation byte');
	}
}

export function decodeString(value: Uint8Array): string {
	if (value == null)
		return null;

	let codes: number[] = [];

	for (let i = 0; i < value.length;) {
		let byte1 = value[i++];
		let code: number;

		if ((byte1 & 0x80) === 0) {
			code = byte1;
		} else if ((byte1 & 0xe0) === 0xc0) {
			let byte2 = continuationByte(value, i++);
			code = ((byte1 & 0x1f) << 6) | byte2;

			if (code < 0x80) {
				throw Error('Invalid continuation byte');
			}
		} else if ((byte1 & 0xf0) === 0xe0) {
			let byte2 = continuationByte(value, i++);
			let byte3 = continuationByte(value, i++);
			code = ((byte1 & 0x0f) << 12) | (byte2 << 6) | byte3;

			if (code < 0x0800) {
				throw Error('Invalid continuation byte');
			}

			if (code >= 0xd800 && code <= 0xdfff) {
				throw Error(`Lone surrogate U+${code.toString(16).toUpperCase()} is not a scalar value`);
			}
		} else if ((byte1 & 0xf8) === 0xf0) {
			let byte2 = continuationByte(value, i++);
			let byte3 = continuationByte(value, i++);
			let byte4 = continuationByte(value, i++);
			code = ((byte1 & 0x0f) << 0x12) | (byte2 << 0x0c) | (byte3 << 0x06) | byte4;

			if (code < 0x010000 || code > 0x10ffff) {
				throw Error('Invalid continuation byte');
			}
		} else {
			throw Error('Invalid UTF-8 detected');
		}

		if (code > 0xffff) {
			code -= 0x10000;
			codes.push(code >>> 10 & 0x3ff | 0xd800);
			code = 0xdc00 | code & 0x3ff;
		}

		codes.push(code);
	}

	return fromCharCode(...codes);
}
