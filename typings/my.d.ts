/// <reference path="./index.d.ts" />

declare namespace Chai {
	interface Assertion {
		rejectedWith(error?: any, message?: any): any;
		eventually: Assertion;
	}
}
