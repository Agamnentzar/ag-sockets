import { MethodMetadata, MethodOptions, SocketOptions } from './interfaces';
import { get, set } from './map';

const methodMetadata: [Function, MethodMetadata[]][] = [];
const socketServerMetadata: [Function, SocketOptions][] = [];

export function Method(options?: MethodOptions) {
	return function (target: Object, name: string) {
		const meta = get(methodMetadata, target.constructor) || [];
		meta.push({ name: name, options: options || {} });
		set(methodMetadata, target.constructor, meta);
	};
}

export function Socket(options: SocketOptions) {
	return function (target: Function) {
		set(socketServerMetadata, target, options);
	};
}

export function getMethodMetadata(ctor: Function): MethodMetadata[] {
	return get(methodMetadata, ctor);
}

export function getSocketMetadata(ctor: Function): SocketOptions {
	return get(socketServerMetadata, ctor);
}

export function getMethods(ctor: Function): MethodMetadata[] {
	return getMethodMetadata(ctor) || Object.keys(ctor.prototype)
		.filter(k => k !== 'connected' && k !== 'disconnected' && k !== 'invalidVersion')
		.filter(k => typeof ctor.prototype[k] === 'function')
		.map(k => ({ name: k, options: {} }));
}
