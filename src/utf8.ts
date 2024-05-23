const encoder = (typeof TextEncoder !== 'undefined' && typeof new TextEncoder().encodeInto === 'function') ? new TextEncoder() : undefined;
const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : undefined;

export function maxUtf8Length(value: string): number {
	return value.length * 3;
}

function writeCharacter(buffer: DataView, offset: number, code: number) {
	if ((code & 0xffffff80) === 0) {
		buffer.setUint8(offset, code);
		return 1;
	} else if ((code & 0xfffff800) === 0) {
		buffer.setUint8(offset, ((code >> 6) & 0x1f) | 0xc0);
		buffer.setUint8(offset + 1, (code & 0x3f) | 0x80);
		return 2;
	} else if ((code & 0xffff0000) === 0) {
		buffer.setUint8(offset, ((code >> 12) & 0x0f) | 0xe0);
		buffer.setUint8(offset + 1, ((code >> 6) & 0x3f) | 0x80);
		buffer.setUint8(offset + 2, (code & 0x3f) | 0x80);
		return 3;
	} else {
		buffer.setUint8(offset, ((code >> 18) & 0x07) | 0xf0);
		buffer.setUint8(offset + 1, ((code >> 12) & 0x3f) | 0x80);
		buffer.setUint8(offset + 2, ((code >> 6) & 0x3f) | 0x80);
		buffer.setUint8(offset + 3, (code & 0x3f) | 0x80);
		return 4;
	}
}

export function encodeStringTo(buffer: DataView, offset: number, value: string): number {
	if (encoder && typeof encoder.encodeInto === 'function' && value.length > 100) {
		const target = new Uint8Array(buffer.buffer, buffer.byteOffset + offset);
		const { read = 0, written = 0 } = encoder.encodeInto(value, target);
		if (read !== value.length) throw new RangeError('Buffer is too small to encode string');
		offset += written;
	} else {
		for (let i = 0; i < value.length; i++) {
			const code = value.charCodeAt(i);

			// high surrogate
			if (code >= 0xd800 && code <= 0xdbff) {
				if ((i + 1) < value.length) {
					const extra = value.charCodeAt(i + 1);

					// low surrogate
					if ((extra & 0xfc00) === 0xdc00) {
						i++;
						const fullCode = ((code & 0x3ff) << 10) + (extra & 0x3ff) + 0x10000;
						offset += writeCharacter(buffer, offset, fullCode);
					}
				}
			} else {
				offset += writeCharacter(buffer, offset, code);
			}
		}
	}

	return offset;
}

function continuationByte(buffer: DataView, index: number, end: number): number {
	if (index >= end) throw Error('Invalid byte index');

	const continuationByte = buffer.getUint8(index);

	if ((continuationByte & 0xC0) === 0x80) {
		return continuationByte & 0x3F;
	} else {
		throw Error('Invalid continuation byte');
	}
}

export function decodeString(value: DataView | null, offset: number, length: number): string | null {
	if (value == null) return null;

	if (decoder && length > 100) {
		return decoder.decode(new Uint8Array(value.buffer, value.byteOffset + offset, length));
	}

	let result = '';
	const end = offset + length;

	for (let i = offset; i < end;) {
		const byte1 = value.getUint8(i++);
		let code: number;

		if ((byte1 & 0x80) === 0) {
			code = byte1;
		} else if ((byte1 & 0xe0) === 0xc0) {
			const byte2 = continuationByte(value, i++, end);
			code = ((byte1 & 0x1f) << 6) | byte2;

			if (code < 0x80) {
				throw Error('Invalid continuation byte');
			}
		} else if ((byte1 & 0xf0) === 0xe0) {
			const byte2 = continuationByte(value, i++, end);
			const byte3 = continuationByte(value, i++, end);
			code = ((byte1 & 0x0f) << 12) | (byte2 << 6) | byte3;

			if (code < 0x0800) {
				throw Error('Invalid continuation byte');
			}

			if (code >= 0xd800 && code <= 0xdfff) {
				continue;
				// throw Error(`Lone surrogate U+${code.toString(16).toUpperCase()} is not a scalar value`);
			}
		} else if ((byte1 & 0xf8) === 0xf0) {
			const byte2 = continuationByte(value, i++, end);
			const byte3 = continuationByte(value, i++, end);
			const byte4 = continuationByte(value, i++, end);
			code = ((byte1 & 0x0f) << 0x12) | (byte2 << 0x0c) | (byte3 << 0x06) | byte4;

			if (code < 0x010000 || code > 0x10ffff) {
				throw Error('Invalid continuation byte');
			}
		} else {
			throw Error('Invalid UTF-8 detected');
		}

		if (code > 0xffff) {
			code -= 0x10000;
			result += String.fromCharCode(code >>> 10 & 0x3ff | 0xd800);
			code = 0xdc00 | code & 0x3ff;
		}

		result += String.fromCharCode(code);
	}

	return result;
}
