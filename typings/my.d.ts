declare namespace Chai {
	interface Assertion {
		rejectedWith(error?: any, message?: any): Promise<any>;
		eventually: Assertion;
	}
}
