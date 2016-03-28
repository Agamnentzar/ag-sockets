/// <reference path="main.d.ts" />

declare namespace Chai {
	interface Assertion {
		rejectedWith(error?: any, message?: any): any;
		eventually: Assertion;
	}
}
