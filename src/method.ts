import { MethodMetadata, MethodOptions, ServerOptions } from './interfaces';
import { get, set } from './map';

const methodMetadata: [Function, MethodMetadata[]][] = [];
const socketServerMetadata: [Function, ServerOptions][] = [];

export function Method(options: MethodOptions = {}) {
	return function (target: Object, name: string) {
		const meta = get(methodMetadata, target.constructor) || [];
		meta.push({ name, options });
		set(methodMetadata, target.constructor, meta);
	};
}

export function Socket(options: ServerOptions) {
	return function (target: Function) {
		set(socketServerMetadata, target, options);
	};
}

export function getSocketMetadata(ctor: Function): ServerOptions {
	return get(socketServerMetadata, ctor);
}

export function getMethodMetadata(ctor: Function): MethodMetadata[] {
	return get(methodMetadata, ctor);
}

function generateMethodMetadata(prototype: any) {
	return Object.keys(prototype)
		.filter(k => k !== 'connected' && k !== 'disconnected' && k !== 'invalidVersion' && typeof prototype[k] === 'function')
		.map(name => ({ name, options: {} }));
}

export function getMethods(ctor: Function): MethodMetadata[] {
	return getMethodMetadata(ctor) || generateMethodMetadata(ctor.prototype);
}
