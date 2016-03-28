/// <reference path="../node_modules/typescript/lib/lib.es6.d.ts" />

import { MethodMetadata, MethodOptions, SocketOptions } from './interfaces';

const methodMetadata = new Map<Function, MethodMetadata[]>();
const socketServerMetadata = new Map<Function, SocketOptions>();

export function Method(options?: MethodOptions) {
	return function (target: Object, name: string) {
		let meta = methodMetadata.get(target.constructor) || [];
		meta.push({ name: name, options: options || {} });
		methodMetadata.set(target.constructor, meta);
	};
}

export function Socket(options: SocketOptions) {
	return function (target: Function) {
		socketServerMetadata.set(target, options);
	};
}

export function getMethodMetadata(ctor: Function): MethodMetadata[] {
	return methodMetadata.get(ctor);
}

export function getSocketMetadata(ctor: Function): SocketOptions {
	return socketServerMetadata.get(ctor);
}

export function getMethods(ctor: Function): MethodMetadata[] {
	return getMethodMetadata(ctor) || Object.keys(ctor.prototype)
		.filter(k => k !== 'connected' && k !== 'disconnected' && k !== 'invalidVersion')
		.filter(k => typeof ctor.prototype[k] === 'function')
		.map(k => ({ name: k, options: {} }));
}
