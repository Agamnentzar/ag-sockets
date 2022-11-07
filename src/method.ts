import { MethodMetadata, MethodOptions } from './interfaces';

const methodMetadata = new Map<Function, MethodMetadata[]>();

export function Method(options: MethodOptions = {}) {
	return function (target: Object, name: string) {
		const meta = methodMetadata.get(target.constructor) || [];
		meta.push({ name, options });
		methodMetadata.set(target.constructor, meta);
	};
}

export function getMethodMetadata(ctor: Function): MethodMetadata[] | undefined {
	return methodMetadata.get(ctor);
}

function generateMethodMetadata(prototype: any) {
	return Object.keys(prototype)
		.filter(k => k !== 'connected' && k !== 'disconnected' && k !== 'connectionError' && typeof prototype[k] === 'function')
		.map(name => ({ name, options: {} }));
}

export function getMethods(ctor: Function): MethodMetadata[] {
	return getMethodMetadata(ctor) || generateMethodMetadata(ctor.prototype);
}
