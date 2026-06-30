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

/**
 * Discriminated-union type descriptor mirroring the Conjure wire spec §5.1–5.4.
 * Used by {@link deserialize} to apply §5.6.1 coercions to raw JSON responses.
 *
 * Build descriptor values with the provided builder functions rather than constructing
 * the union directly.
 */
export type ConjureType =
    | {
          kind: "primitive";
          type: "string" | "boolean" | "integer" | "safelong" | "rid" | "uuid" | "bearertoken" | "binary" | "datetime";
      }
    | { kind: "double" }
    | { kind: "any" }
    | { kind: "enum" }
    | { kind: "optional"; item: ConjureType }
    | { kind: "list"; item: ConjureType }
    | { kind: "set"; item: ConjureType }
    | { kind: "map"; value: ConjureType }
    | { kind: "object"; fields: Record<string, ConjureType> }
    | { kind: "union"; variants: Record<string, ConjureType> }
    | { kind: "alias"; aliased: ConjureType }
    /** Lazy thunk — allows mutually-recursive descriptors without forward-reference issues. */
    | { kind: "reference"; resolve: () => ConjureType };

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

export const stringType = (): ConjureType => ({ kind: "primitive", type: "string" });
export const booleanType = (): ConjureType => ({ kind: "primitive", type: "boolean" });
export const integer = (): ConjureType => ({ kind: "primitive", type: "integer" });
export const safelong = (): ConjureType => ({ kind: "primitive", type: "safelong" });
export const rid = (): ConjureType => ({ kind: "primitive", type: "rid" });
export const uuid = (): ConjureType => ({ kind: "primitive", type: "uuid" });
export const bearertoken = (): ConjureType => ({ kind: "primitive", type: "bearertoken" });
export const binary = (): ConjureType => ({ kind: "primitive", type: "binary" });
export const datetime = (): ConjureType => ({ kind: "primitive", type: "datetime" });
export const double = (): ConjureType => ({ kind: "double" });
export const anyType = (): ConjureType => ({ kind: "any" });
export const enumType = (): ConjureType => ({ kind: "enum" });
export const optional = (item: ConjureType): ConjureType => ({ kind: "optional", item });
export const list = (item: ConjureType): ConjureType => ({ kind: "list", item });
export const set = (item: ConjureType): ConjureType => ({ kind: "set", item });
export const map = (value: ConjureType): ConjureType => ({ kind: "map", value });
export const object = (fields: Record<string, ConjureType>): ConjureType => ({ kind: "object", fields });
export const union = (variants: Record<string, ConjureType>): ConjureType => ({ kind: "union", variants });
export const alias = (aliased: ConjureType): ConjureType => ({ kind: "alias", aliased });
export const reference = (resolve: () => ConjureType): ConjureType => ({ kind: "reference", resolve });
