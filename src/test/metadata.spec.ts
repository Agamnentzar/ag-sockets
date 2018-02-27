import './common';
import { expect } from 'chai';
import { MethodMetadata, ServerOptions, Bin } from '../interfaces';
import { Socket, Method, getSocketMetadata, getMethodMetadata } from '../method';

@Socket({ path: '/api', ssl: true, connectionTimeout: 500 })
class ExampleServer {
	@Method()
	foo() { }
	@Method({ binary: [Bin.U8], ignore: true })
	bar() { }
}

class EmptyServer {
	foo() { }
	bar() { }
}

describe('metadata', () => {
	describe('getSocketServerMetadata()', () => {
		it('should return methods metadata for class with decorators', () => {
			expect(getMethodMetadata(ExampleServer)).eql([
				<MethodMetadata>{
					name: 'foo',
					options: {}
				},
				<MethodMetadata>{
					name: 'bar',
					options: {
						binary: [Bin.U8],
						ignore: true,
					}
				}
			]);
		});

		it('should return undefined for class without decorators', () => {
			expect(getMethodMetadata(EmptyServer)).undefined;
		});
	});

	describe('getMethodMetadata()', () => {
		it('should return metadata for class with decorator', () => {
			expect(getSocketMetadata(ExampleServer)).eql(<ServerOptions>{
				path: '/api',
				ssl: true,
				connectionTimeout: 500
			});
		});

		it('should return undefined metadata for class without decorator', () => {
			expect(getSocketMetadata(EmptyServer)).undefined;
		});
	});
});
