type TypedArraySource = number | buffer | TypedArray | Array<number>;

const bufferBySize: { [index: number]: Array<[Callback, Callback]> } = {
	1: [
		[buffer.readu8, buffer.writeu8],
		[buffer.readi8, buffer.writei8],
	],
	2: [
		[buffer.readu16, buffer.writeu16],
		[buffer.readi16, buffer.writei16],
	],
	4: [
		[buffer.readu32, buffer.writeu32],
		[buffer.readi32, buffer.writei32],
	],
};

function getn(t: unknown) {
	throw "implement getn";
	return 0;
}

// ---- TypedArray base class ----
class TypedArray {
	public buffer: buffer;
	public byteOffset: number;
	public byteLength: number;
	public BYTES_PER_ELEMENT: number;
	protected signed: boolean;
	[index: number]: number;

	constructor(
		elementSize: number,
		signed: boolean,
		source: TypedArraySource,
		byteOffset = 0,
		length?: number,
	) {
		this.BYTES_PER_ELEMENT = elementSize;
		this.signed = signed;
		this.byteOffset = byteOffset;
		const [bufferRead, bufferWrite] =
			bufferBySize[this.BYTES_PER_ELEMENT][this.signed ? 1 : 0];

		// number -> allocate
		if (typeIs(source, "number")) {
			length = source;
			this.byteLength = length * this.BYTES_PER_ELEMENT;
			this.buffer = buffer.create(this.byteLength);
		}

		// existing buffer
		else if (typeIs(source, "buffer")) {
			const totalLen = buffer.len(source);

			this.buffer = source;

			// user provides explicit element length
			if (length !== undefined) {
				// convert to bytes
				this.byteLength = length * this.BYTES_PER_ELEMENT;
			} else {
				// default: use remainder of buffer from byteOffset
				this.byteLength = totalLen - byteOffset;
				length = this.byteLength / this.BYTES_PER_ELEMENT;
			}

			// validate bounds
			if (byteOffset < 0 || byteOffset > totalLen) {
				throw `byteOffset out of bounds`;
			}
			if (byteOffset + this.byteLength > totalLen) {
				throw `byteLength out of bounds`;
			}

			// store final byteOffset and computed length
			this.byteOffset = byteOffset;
		} else if (typeIs(source, "table")) {
			// other typed array
			if ("buffer" in source && "byteLength" in source) {
				// source instanceof TypedArray
				this.byteLength = source.byteLength; // math.floor(buffer.len(source.buffer) - off);
				length = math.floor(
					this.byteLength / this.BYTES_PER_ELEMENT,
				);
				this.buffer = source.buffer;
			}

			// iterable
			else {
				length = source.size();
				// for (const v of source) arr.push(v);
				this.byteLength = length * this.BYTES_PER_ELEMENT;
				this.buffer = buffer.create(this.byteLength);

				for (const i of $range(0, length - 1)) {
					bufferWrite(
						this.buffer,
						i * this.BYTES_PER_ELEMENT,
						source[i],
					);
				}
			}
		}

		// default
		else {
			this.buffer = buffer.create(0);
			this.byteOffset = 0;
			this.byteLength = 0;
			length = 0;
		}

		setmetatable(this, {
			__index: (t: typeof this, i: unknown) => {
				const index = tonumber(i);
				if (index === undefined)
					// typeIs(index, "nil")
					return rawget(t, i) ?? rawget(TypedArray, i);
				// const off = t.byteOffset ?? 0 + idx * elementSize;
				const [_, result] = xpcall(() => bufferRead(
					t.buffer,
					t.byteOffset + index * t.BYTES_PER_ELEMENT,
				), () => 0);

				return result;
			},
			__newindex: (t: typeof this, i: unknown, v: unknown) => {
				const index = tonumber(i);
				if (index === undefined) return rawset(t, i, v);
				const value = tonumber(v) ?? 0;
				// const off = t.byteOffset ?? 0 + idx * elementSize;
				bufferWrite(
					t.buffer,
					t.byteOffset + index * t.BYTES_PER_ELEMENT,
					value,
				);
			},
			__len: () => length,
		});
	}

	subarray(startPos = 0, endPos = getn(this)): this {
		const length = getn(this);
		if (startPos < 0) startPos = math.max(length + startPos, 0);
		if (endPos < 0) endPos = math.max(length + endPos, 0);

		startPos = math.min(startPos, length);
		endPos = math.min(endPos, length);

		const newOffset =
			this.byteOffset + startPos * this.BYTES_PER_ELEMENT;
		const newLength = endPos - startPos;

		// create a new TypedArray view on the same buffer
		return new TypedArray(
			this.BYTES_PER_ELEMENT,
			this.signed,
			this.buffer,
			newOffset,
			newLength,
		) as this;
	}

	set(source: TypedArray | Array<number>, offset = 0): void {
		const bufferWrite =
			bufferBySize[this.BYTES_PER_ELEMENT][this.signed ? 1 : 0][1];
		const thisLength = getn(this);
		const sourceLength = getn(source);
		if (offset < 0 || offset > thisLength)
			throw "offset out of bounds";

		if (offset + sourceLength > thisLength)
			throw "source does not fit";

		if (typeIs(source, "table")) {
			if (
				"buffer" in source &&
				"byteOffset" in source &&
				"byteLength" in source
			) {
				const srcStart = source.byteOffset;
				const dstStart =
					this.byteOffset + offset * this.BYTES_PER_ELEMENT;
				buffer.copy(
					this.buffer,
					dstStart,
					source.buffer,
					srcStart,
					source.byteLength,
				);
			} else {
				for (const i of $range(0, sourceLength - 1)) {
					const value = source[i]; // + 1 - automatically compiles it to be like this
					bufferWrite(
						this.buffer,
						this.byteOffset +
							(offset + i) * this.BYTES_PER_ELEMENT,
						value,
					);
				}
			}
		}
	}

	slice(startPos = 0, endPos = getn(this)): this {
		const view = this.subarray(startPos, endPos);
		const out = new TypedArray(
			view.BYTES_PER_ELEMENT,
			view.signed,
			getn(view),
		) as this;
		out.set(view);
		return out;
	}

	fill(value: number, startPos = 0, endPos = getn(this)): this {
		const len = getn(this);

		if (startPos < 0) startPos = math.max(len + startPos, 0);
		if (endPos < 0) endPos = math.max(len + endPos, 0);

		startPos = math.clamp(startPos, 0, len);
		endPos = math.clamp(endPos, 0, len);

		for (const i of $range(startPos, endPos - 1)) {
			this[i] = value;
		}

		return this;
	}

	// ===== copyWithin(target, startPos, endPos?) =====
	copyWithin(
		target: number,
		startPos: number,
		endPos = getn(this),
	): this {
		const len = getn(this);

		// normalize negative numbers
		if (target < 0) target = len + target;
		if (startPos < 0) startPos = len + startPos;
		if (endPos < 0) endPos = len + endPos;

		target = math.clamp(target, 0, len);
		startPos = math.clamp(startPos, 0, len);
		endPos = math.clamp(endPos, 0, len);

		const count = math.min(endPos - startPos, len - target);
		if (count <= 0) return this;

		const elementSize = this.BYTES_PER_ELEMENT;

		const srcOffset = this.byteOffset + startPos * elementSize;
		const dstOffset = this.byteOffset + target * elementSize;
		const byteLength = count * elementSize;

		// use buffer.copy, works even for overlapping regions
		buffer.copy(
			this.buffer,
			dstOffset,
			this.buffer,
			srcOffset,
			byteLength,
		);

		/*
		// temp buffer to preserve overlap semantics
		for (const i of $range(0, count - 1)) {
			this[target + i] = this[startPos + i];
		}
		*/

		return this;
	}
}

// ---- typed arrays ----
export class Uint8Array extends TypedArray {
	constructor(
		source: TypedArraySource,
		byteOffset?: number,
		length?: number,
	) {
		super(1, false, source, byteOffset, length);
	}
}

export class Uint16Array extends TypedArray {
	constructor(
		source: TypedArraySource,
		byteOffset?: number,
		length?: number,
	) {
		super(2, false, source, byteOffset, length);
	}
}

export class Int16Array extends TypedArray {
	constructor(
		source: TypedArraySource,
		byteOffset?: number,
		length?: number,
	) {
		super(2, true, source, byteOffset, length);
	}
}

export class Int32Array extends TypedArray {
	constructor(
		source: TypedArraySource,
		byteOffset?: number,
		length?: number,
	) {
		super(4, true, source, byteOffset, length);
	}
}
