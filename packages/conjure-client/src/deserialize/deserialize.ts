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

import { ConjureType } from "./types";

/**
 * Thrown when {@link deserialize} encounters a value that does not conform to the
 * expected Conjure wire format (§5.6.1). The {@link path} field contains the
 * dot/bracket path to the offending location in the JSON (e.g. `"recipe.ingredients[2].name"`).
 */
export class ConjureDeserializeError extends Error {
    public readonly path: string;

    constructor(path: string, detail: string) {
        super(`Deserialization error at "${path || "<root>"}": ${detail}`);
        this.path = path;
        Object.setPrototypeOf(this, ConjureDeserializeError.prototype);
    }
}

/**
 * Applies Conjure §5.6.1 coercions to a raw JSON value according to the given type descriptor.
 *
 * Key behaviours:
 *  - `optional` — `null` / `undefined` / absent key → `undefined`; otherwise recurse.
 *  - `list` / `set` — `null` / `undefined` → `[]`; otherwise validates and maps elements.
 *  - `map`  — `null` / `undefined` → `{}`; otherwise validates and maps values.
 *  - `object` — required fields that are absent/null delegate to the field's own type rule.
 *  - `union` — unknown variant passes through unchanged (§4.4 forward-compat).
 *  - `double` — passes through `number` values AND the strings `"NaN"`, `"Infinity"`, `"-Infinity"`.
 *  - primitives — validates `typeof`; does NOT cast (§5.6.2: `"true"` is not `boolean`).
 *  - `any` — returned as-is with no validation.
 */
export function deserialize<T = unknown>(type: ConjureType, json: unknown): T {
    return deserializeAt(type, json, "") as T;
}

function deserializeAt(type: ConjureType, json: unknown, path: string): unknown {
    switch (type.kind) {
        case "optional":
            return json == null ? undefined : deserializeAt(type.item, json, path);

        case "list":
        case "set":
            if (json == null) {
                return [];
            }
            if (!Array.isArray(json)) {
                throw new ConjureDeserializeError(path, `expected array, got ${typeof json}`);
            }
            return json.map((item, i) => deserializeAt(type.item, item, `${path}[${i}]`));

        case "map": {
            if (json == null) {
                return {};
            }
            if (typeof json !== "object" || Array.isArray(json)) {
                throw new ConjureDeserializeError(path, `expected object for map, got ${typeof json}`);
            }
            const out: Record<string, unknown> = {};
            for (const key of Object.keys(json as object)) {
                out[key] = deserializeAt(type.value, (json as Record<string, unknown>)[key], `${path}["${key}"]`);
            }
            return out;
        }

        case "object": {
            if (json == null) {
                throw new ConjureDeserializeError(path, "expected object, got null or undefined");
            }
            if (typeof json !== "object" || Array.isArray(json)) {
                throw new ConjureDeserializeError(path, `expected object, got ${typeof json}`);
            }
            const out: Record<string, unknown> = {};
            for (const [fieldName, fieldType] of Object.entries(type.fields)) {
                const fieldPath = path.length > 0 ? `${path}.${fieldName}` : fieldName;
                out[fieldName] = deserializeAt(fieldType, (json as Record<string, unknown>)[fieldName], fieldPath);
                // Unknown keys in the JSON object are intentionally ignored (§4.1 forward-compat).
            }
            return out;
        }

        case "union": {
            if (json == null) {
                throw new ConjureDeserializeError(path, "expected union object, got null or undefined");
            }
            if (typeof json !== "object" || Array.isArray(json)) {
                throw new ConjureDeserializeError(path, `expected object for union, got ${typeof json}`);
            }
            const unionJson = json as Record<string, unknown>;
            const variant = unionJson.type;
            if (typeof variant !== "string") {
                throw new ConjureDeserializeError(path, "union missing string 'type' discriminant");
            }
            const variantType = type.variants[variant];
            if (variantType == null) {
                // Unknown variant — pass through unchanged per §4.4 forward-compat.
                return json;
            }
            return {
                type: variant,
                [variant]: deserializeAt(variantType, unionJson[variant], `${path}.${variant}`),
            };
        }

        case "enum":
            if (json == null) {
                throw new ConjureDeserializeError(path, "expected enum string, got null or undefined");
            }
            if (typeof json !== "string") {
                throw new ConjureDeserializeError(path, `expected string for enum, got ${typeof json}`);
            }
            // Unknown enum values are tolerated (§4.3 forward-compat).
            return json;

        case "primitive":
            if (json == null) {
                throw new ConjureDeserializeError(path, `expected ${type.type}, got null or undefined`);
            }
            switch (type.type) {
                case "string":
                case "rid":
                case "uuid":
                case "bearertoken":
                case "binary":
                case "datetime":
                    if (typeof json !== "string") {
                        throw new ConjureDeserializeError(path, `expected string, got ${typeof json}`);
                    }
                    return json;
                case "boolean":
                    if (typeof json !== "boolean") {
                        throw new ConjureDeserializeError(path, `expected boolean, got ${typeof json}`);
                    }
                    return json;
                case "integer":
                    if (
                        typeof json !== "number" ||
                        !Number.isInteger(json) ||
                        json < -2147483648 ||
                        json > 2147483647
                    ) {
                        throw new ConjureDeserializeError(
                            path,
                            `expected 32-bit signed integer, got ${JSON.stringify(json)}`,
                        );
                    }
                    return json;
                case "safelong":
                    if (typeof json !== "number" || !Number.isSafeInteger(json)) {
                        throw new ConjureDeserializeError(
                            path,
                            `expected safelong (integer in range -(2^53-1) to 2^53-1), got ${JSON.stringify(json)}`,
                        );
                    }
                    return json;
            }

        // The exhaustive-switch lint rule is satisfied by the union above.
        // eslint-disable-next-line no-fallthrough
        case "double":
            if (json == null) {
                throw new ConjureDeserializeError(path, "expected double, got null or undefined");
            }
            if (typeof json === "number") {
                return json;
            }
            // §5.1: "NaN", "Infinity", "-Infinity" are the wire representations of the non-finite IEEE 754 values.
            // Convert to actual JS numbers so the return type is always `number`.
            if (json === "NaN") {
                return NaN;
            }
            if (json === "Infinity") {
                return Infinity;
            }
            if (json === "-Infinity") {
                return -Infinity;
            }
            throw new ConjureDeserializeError(
                path,
                `expected number or one of "NaN", "Infinity", "-Infinity", got ${JSON.stringify(json)}`,
            );

        case "any":
            return json;

        case "alias":
            return deserializeAt(type.aliased, json, path);

        case "reference":
            return deserializeAt(type.resolve(), json, path);
    }
}
