/// <reference path="main.d.ts" />

declare namespace Chai {
	interface Assertion {
		rejectedWith(error?: any, message?: any): Promise<any>;
		eventually: Assertion;
	}
}
