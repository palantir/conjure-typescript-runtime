/**
 * @license
 * Copyright 2026 Palantir Technologies, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ConjureDeserializeError, deserialize } from "../deserialize";
import {
    alias,
    anyType,
    booleanType,
    datetime,
    double,
    enumType,
    integer,
    list,
    map,
    object,
    optional,
    reference,
    rid,
    safelong,
    set,
    stringType,
    union,
    uuid,
} from "../types";

function expectError(fn: () => unknown, pathFragment: string): void {
    let caught: unknown;
    try {
        fn();
    } catch (e) {
        caught = e;
    }
    expect(caught).toBeInstanceOf(ConjureDeserializeError);
    expect((caught as ConjureDeserializeError).path).toContain(pathFragment);
}

// ---------------------------------------------------------------------------
// optional
// ---------------------------------------------------------------------------
describe("optional", () => {
    const optStr = optional(stringType());

    it("returns undefined for null", () => {
        expect(deserialize(optStr, null)).toBeUndefined();
    });

    it("returns undefined for undefined", () => {
        expect(deserialize(optStr, undefined)).toBeUndefined();
    });

    it("recurses into present value", () => {
        expect(deserialize(optStr, "hello")).toBe("hello");
    });

    it("propagates errors on bad inner type", () => {
        expectError(() => deserialize(optStr, 42), "");
    });
});

// ---------------------------------------------------------------------------
// list / set
// ---------------------------------------------------------------------------
describe("list", () => {
    const listInt = list(integer());

    it("returns [] for null", () => {
        expect(deserialize(listInt, null)).toEqual([]);
    });

    it("returns [] for undefined", () => {
        expect(deserialize(listInt, undefined)).toEqual([]);
    });

    it("maps elements", () => {
        expect(deserialize(listInt, [1, 2, 3])).toEqual([1, 2, 3]);
    });

    it("throws on non-array", () => {
        expectError(() => deserialize(listInt, "oops"), "");
    });

    it("includes element index in error path", () => {
        expectError(() => deserialize(listInt, [1, "bad", 3]), "[1]");
    });
});

describe("set", () => {
    const setStr = set(stringType());

    it("returns [] for null", () => {
        expect(deserialize(setStr, null)).toEqual([]);
    });

    it("deserializes to an array", () => {
        expect(deserialize(setStr, ["a", "b"])).toEqual(["a", "b"]);
    });
});

// ---------------------------------------------------------------------------
// map
// ---------------------------------------------------------------------------
describe("map", () => {
    const mapStrInt = map(integer());

    it("returns {} for null", () => {
        expect(deserialize(mapStrInt, null)).toEqual({});
    });

    it("returns {} for undefined", () => {
        expect(deserialize(mapStrInt, undefined)).toEqual({});
    });

    it("deserializes values", () => {
        expect(deserialize(mapStrInt, { a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
    });

    it("preserves string keys", () => {
        const result = deserialize<Record<string, number>>(mapStrInt, { foo: 42 });
        expect(Object.keys(result)).toEqual(["foo"]);
    });

    it("includes key in error path on bad value", () => {
        expectError(() => deserialize(mapStrInt, { a: "bad" }), '["a"]');
    });

    it("throws on non-object", () => {
        expectError(() => deserialize(mapStrInt, [1, 2]), "");
    });
});

// ---------------------------------------------------------------------------
// object
// ---------------------------------------------------------------------------
describe("object", () => {
    const recipeType = object({
        name: stringType(),
        servings: integer(),
        notes: optional(stringType()),
        tags: list(stringType()),
    });

    it("deserializes fully populated object", () => {
        const result = deserialize(recipeType, { name: "Soup", servings: 4, notes: "hot", tags: ["lunch"] });
        expect(result).toEqual({ name: "Soup", servings: 4, notes: "hot", tags: ["lunch"] });
    });

    it("absent optional field → undefined", () => {
        const result = deserialize<any>(recipeType, { name: "Soup", servings: 2, tags: [] });
        expect(result.notes).toBeUndefined();
    });

    it("absent list field → []", () => {
        const result = deserialize<any>(recipeType, { name: "Soup", servings: 2 });
        expect(result.tags).toEqual([]);
    });

    it("throws on null object", () => {
        expectError(() => deserialize(recipeType, null), "");
    });

    it("throws on absent required string with path", () => {
        expectError(() => deserialize(recipeType, { servings: 1, tags: [] }), "name");
    });

    it("throws on absent required integer with path", () => {
        expectError(() => deserialize(recipeType, { name: "X", tags: [] }), "servings");
    });

    it("ignores unknown keys", () => {
        const result = deserialize<any>(recipeType, { name: "X", servings: 1, tags: [], extra: "ignored" });
        expect((result as any).extra).toBeUndefined();
    });

    it("includes nested path in error", () => {
        const nested = object({ inner: object({ val: integer() }) });
        expectError(() => deserialize(nested, { inner: { val: "bad" } }), "inner.val");
    });
});

// ---------------------------------------------------------------------------
// union
// ---------------------------------------------------------------------------
describe("union", () => {
    const shapeType = union({
        circle: object({ radius: double() }),
        rect: object({ width: integer(), height: integer() }),
    });

    it("deserializes known variant", () => {
        const result = deserialize(shapeType, { type: "circle", circle: { radius: 3.14 } });
        expect(result).toEqual({ type: "circle", circle: { radius: 3.14 } });
    });

    it("passes through unknown variant unchanged", () => {
        const raw = { type: "triangle", triangle: { sides: 3 } };
        expect(deserialize(shapeType, raw)).toEqual(raw);
    });

    it("throws on null", () => {
        expectError(() => deserialize(shapeType, null), "");
    });

    it("throws when 'type' discriminant is missing", () => {
        expectError(() => deserialize(shapeType, { circle: { radius: 1 } }), "");
    });

    it("throws when 'type' discriminant is not a string", () => {
        expectError(() => deserialize(shapeType, { type: 42, circle: {} }), "");
    });
});

// ---------------------------------------------------------------------------
// enum
// ---------------------------------------------------------------------------
describe("enum", () => {
    const colorType = enumType();

    it("passes through known string value", () => {
        expect(deserialize(colorType, "RED")).toBe("RED");
    });

    it("tolerates unknown string value", () => {
        expect(deserialize(colorType, "ULTRAVIOLET")).toBe("ULTRAVIOLET");
    });

    it("throws on null", () => {
        expectError(() => deserialize(colorType, null), "");
    });

    it("throws on non-string", () => {
        expectError(() => deserialize(colorType, 1), "");
    });
});

// ---------------------------------------------------------------------------
// primitives — no-cast rule (§5.6.2)
// ---------------------------------------------------------------------------
describe("primitive: boolean", () => {
    it("accepts true / false", () => {
        expect(deserialize(booleanType(), true)).toBe(true);
        expect(deserialize(booleanType(), false)).toBe(false);
    });

    it("rejects string 'true' (no cast)", () => {
        expectError(() => deserialize(booleanType(), "true"), "");
    });

    it("rejects number 1", () => {
        expectError(() => deserialize(booleanType(), 1), "");
    });

    it("throws on null", () => {
        expectError(() => deserialize(booleanType(), null), "");
    });
});

describe("primitive: integer", () => {
    it("accepts values within 32-bit signed range", () => {
        expect(deserialize(integer(), 0)).toBe(0);
        expect(deserialize(integer(), 42)).toBe(42);
        expect(deserialize(integer(), -2147483648)).toBe(-2147483648);
        expect(deserialize(integer(), 2147483647)).toBe(2147483647);
    });

    it("rejects values outside 32-bit range", () => {
        expectError(() => deserialize(integer(), 2147483648), "");
        expectError(() => deserialize(integer(), -2147483649), "");
    });

    it("rejects non-integer floats", () => {
        expectError(() => deserialize(integer(), 3.14), "");
    });

    it("rejects string", () => {
        expectError(() => deserialize(integer(), "42"), "");
    });

    it("throws on null", () => {
        expectError(() => deserialize(integer(), null), "");
    });
});

describe("primitive: safelong", () => {
    it("accepts values within safe integer range", () => {
        expect(deserialize(safelong(), 0)).toBe(0);
        expect(deserialize(safelong(), Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
        expect(deserialize(safelong(), Number.MIN_SAFE_INTEGER)).toBe(Number.MIN_SAFE_INTEGER);
    });

    it("rejects values outside safe integer range", () => {
        expectError(() => deserialize(safelong(), Number.MAX_SAFE_INTEGER + 1), "");
        expectError(() => deserialize(safelong(), Number.MIN_SAFE_INTEGER - 1), "");
    });

    it("rejects non-integer floats", () => {
        expectError(() => deserialize(safelong(), 3.14), "");
    });

    it("rejects string", () => {
        expectError(() => deserialize(safelong(), "42"), "");
    });

    it("throws on null", () => {
        expectError(() => deserialize(safelong(), null), "");
    });
});

describe("primitive: string-like", () => {
    it("accepts strings", () => {
        expect(deserialize(stringType(), "hello")).toBe("hello");
        expect(deserialize(rid(), "ri.x.y.z.1")).toBe("ri.x.y.z.1");
        expect(deserialize(uuid(), "abc-123")).toBe("abc-123");
        expect(deserialize(datetime(), "2024-01-01T00:00:00Z")).toBe("2024-01-01T00:00:00Z");
    });

    it("rejects numbers", () => {
        expectError(() => deserialize(stringType(), 42), "");
    });
});

// ---------------------------------------------------------------------------
// double
// ---------------------------------------------------------------------------
describe("double", () => {
    const dbl = double();

    it("passes through finite numbers", () => {
        expect(deserialize(dbl, 3.14)).toBe(3.14);
        expect(deserialize(dbl, 0)).toBe(0);
    });

    it("converts 'NaN' string to JS NaN number (§5.1 wire representation)", () => {
        const result = deserialize<number>(dbl, "NaN");
        expect(Number.isNaN(result)).toBe(true);
    });

    it("converts 'Infinity' string to JS Infinity number", () => {
        expect(deserialize(dbl, "Infinity")).toBe(Infinity);
    });

    it("converts '-Infinity' string to JS -Infinity number", () => {
        expect(deserialize(dbl, "-Infinity")).toBe(-Infinity);
    });

    it("throws on null", () => {
        expectError(() => deserialize(dbl, null), "");
    });

    it("throws on other string", () => {
        expectError(() => deserialize(dbl, "3.14"), "");
    });
});

// ---------------------------------------------------------------------------
// any
// ---------------------------------------------------------------------------
describe("any", () => {
    const anyDescriptor = anyType();

    it("returns value unchanged regardless of shape", () => {
        expect(deserialize(anyDescriptor, null)).toBeNull();
        expect(deserialize(anyDescriptor, { x: 1 })).toEqual({ x: 1 });
        expect(deserialize(anyDescriptor, [1, 2, 3])).toEqual([1, 2, 3]);
        expect(deserialize(anyDescriptor, undefined)).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// alias — transparent
// ---------------------------------------------------------------------------
describe("alias", () => {
    it("delegates to the aliased type transparently", () => {
        const strAlias = alias(stringType());
        expect(deserialize(strAlias, "hello")).toBe("hello");
        expectError(() => deserialize(strAlias, 42), "");
    });

    it("chains aliases", () => {
        const inner = alias(integer());
        const outer = alias(inner);
        expect(deserialize(outer, 7)).toBe(7);
    });
});

// ---------------------------------------------------------------------------
// reference — lazy thunk for recursion
// ---------------------------------------------------------------------------
describe("reference", () => {
    // Build a self-referential type: linked list node
    interface INode {
        value: number;
        next?: INode;
    }
    // eslint-disable-next-line prefer-const
    let nodeType: ReturnType<typeof object>;
    const nodeRef = reference(() => nodeType);
    nodeType = object({ value: integer(), next: optional(nodeRef) });

    it("resolves thunk and deserializes recursive structure", () => {
        const json = { value: 1, next: { value: 2, next: { value: 3 } } };
        const result = deserialize<INode>(nodeType, json);
        expect(result.value).toBe(1);
        expect(result.next!.value).toBe(2);
        expect(result.next!.next!.value).toBe(3);
        expect(result.next!.next!.next).toBeUndefined();
    });

    it("includes deep path in error for recursive type", () => {
        expectError(() => deserialize(nodeType, { value: 1, next: { value: "bad" } }), "next.value");
    });
});

// ---------------------------------------------------------------------------
// nested structures (integration)
// ---------------------------------------------------------------------------
describe("nested structures", () => {
    it("handles list of objects with optional fields", () => {
        const itemType = object({ id: stringType(), count: optional(integer()) });
        const containerType = object({ items: list(itemType) });

        const result = deserialize<any>(containerType, {
            items: [{ id: "a", count: 3 }, { id: "b" }],
        });
        expect(result.items[0]).toEqual({ id: "a", count: 3 });
        expect(result.items[1]).toEqual({ id: "b", count: undefined });
    });

    it("handles map of list", () => {
        const t = map(list(integer()));
        expect(deserialize(t, { x: [1, 2], y: [3] })).toEqual({ x: [1, 2], y: [3] });
    });

    it("error path includes list index and object field", () => {
        const t = object({ rows: list(object({ val: integer() })) });
        expectError(() => deserialize(t, { rows: [{ val: 1 }, { val: "bad" }] }), "rows[1].val");
    });
});
