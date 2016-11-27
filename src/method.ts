import { MethodMetadata, MethodOptions, ServerOptions } from './interfaces';

const methodMetadata = new Map<Function, MethodMetadata[]>();
const socketServerMetadata = new Map<Function, ServerOptions>();

export function Method(options: MethodOptions = {}) {
	return function (target: Object, name: string) {
		const meta = methodMetadata.get(target.constructor) || [];
		meta.push({ name, options });
		methodMetadata.set(target.constructor, meta);
	};
}

export function Socket(options: ServerOptions = {}) {
	return function (target: Function) {
		socketServerMetadata.set(target, options);
	};
}

export function getSocketMetadata(ctor: Function): ServerOptions | undefined {
	return socketServerMetadata.get(ctor);
}

export function getMethodMetadata(ctor: Function): MethodMetadata[] | undefined {
	return methodMetadata.get(ctor);
}

function generateMethodMetadata(prototype: any) {
	return Object.keys(prototype)
		.filter(k => k !== 'connected' && k !== 'disconnected' && k !== 'invalidVersion' && typeof prototype[k] === 'function')
		.map(name => ({ name, options: {} }));
}

export function getMethods(ctor: Function): MethodMetadata[] {
	return getMethodMetadata(ctor) || generateMethodMetadata(ctor.prototype);
}
