import './common';
import { expect } from 'chai';
import { MethodMetadata, SocketOptions } from '../interfaces';
import { Socket, Method, getSocketMetadata, getMethodMetadata } from '../method';

@Socket({ path: '/api', ssl: true, connectionTimeout: 500 })
class ExampleServer {
	@Method()
	foo() { }
	@Method({ binary: ['Uint8'], ignore: true })
	bar() { }
}

class EmptyServer {
	foo() { }
	bar() { }
}

describe('metadata', function () {
	describe('getSocketServerMetadata()', function () {
		it('should return methods metadata for class with decorators', function () {
			expect(getMethodMetadata(ExampleServer)).eql([
				<MethodMetadata>{
					name: 'foo',
					options: {}
				},
				<MethodMetadata>{
					name: 'bar',
					options: {
						binary: ['Uint8'],
						ignore: true,
					}
				}
			]);
		});

		it('should return undefined for class without decorators', function () {
			expect(getMethodMetadata(EmptyServer)).undefined;
		});
	});

	describe('getMethodMetadata()', function () {
		it('should return metadata for class with decorator', function () {
			expect(getSocketMetadata(ExampleServer)).eql(<SocketOptions>{
				path: '/api',
				ssl: true,
				connectionTimeout: 500
			});
		});

		it('should return undefined metadata for class without decorator', function () {
			expect(getSocketMetadata(EmptyServer)).undefined;
		});
	});
});
