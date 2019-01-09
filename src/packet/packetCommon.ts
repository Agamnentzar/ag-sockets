export const enum Type {
	Const = 0 << 5,
	Number = 1 << 5,
	String = 2 << 5,
	Array = 3 << 5,
	Object = 4 << 5,
	TinyPositiveNumber = 5 << 5,
	TinyNegativeNumber = 6 << 5,
	StringRef = 7 << 5,
}

export const enum Consts {
	Undefined = 0,
	Null = 1,
	True = 2,
	False = 3,
}

export const enum NumberType {
	Int8 = 0,
	Uint8 = 1,
	Int16 = 2,
	Uint16 = 3,
	Int32 = 4,
	Uint32 = 5,
	Float32 = 6,
	Float64 = 7,
}
