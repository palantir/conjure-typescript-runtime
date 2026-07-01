/**
 * @license
 * Copyright 2018 Palantir Technologies, Inc.
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

export interface IQoSMetadata {
    retryHint?: string;
    dueTo?: string;
}

export enum ConjureErrorType {
    Network = "NETWORK",
    Other = "OTHER",
    Parse = "PARSE",
    Status = "STATUS",
}

/**
 * Brands every {@link ConjureError} so {@link isConjureError} recognises errors from a *different* copy of
 * conjure-client (where `instanceof` fails), including ones that have crossed a Web Worker / `postMessage`
 * boundary. It has to be an own, enumerable, string-keyed property because that is the only shape structured
 * clone preserves — a symbol or prototype brand would be dropped by the clone. The price is visibility: it
 * necessarily surfaces in `JSON.stringify`, `Object.keys`, spread and `for...in`. The `"instanceof "` prefix
 * makes a branded object self-describing.
 */
const IS_CONJURE_ERROR_KEY = "instanceof com.palantir.conjure.ConjureError";

export class ConjureError<E> {
    // On the instance and enumerable (not a hidden prototype/symbol) so structured clone keeps it. See above.
    public readonly [IS_CONJURE_ERROR_KEY]: true = true;

    public readonly type: ConjureErrorType;
    public readonly originalError?: any;
    public readonly status?: number;
    public readonly body?: string | E;
    public readonly qos?: IQoSMetadata;

    constructor(
        errorType: ConjureErrorType,
        originalError?: any,
        status?: number,
        body?: string | E,
        qos?: IQoSMetadata,
    ) {
        this.type = errorType;
        this.originalError = originalError;
        this.status = status;
        this.body = body;
        this.qos = qos;
    }

    public toString() {
        return JSON.stringify(
            {
                body: this.body,
                originalError: this.originalError && this.originalError.toString(),
                qos: this.qos,
                status: this.status,
                type: this.type,
            },
            null,
            "  ",
        );
    }
}

export function isConjureError(error: unknown): error is ConjureError<unknown> {
    if (error == null) {
        return false;
    }

    // Fast path: an error from this same copy of the library.
    if (error instanceof ConjureError) {
        return true;
    }

    // Matches errors from another copy of conjure-client, and — since the brand survives structured clone —
    // ones that crossed a Worker boundary. Caveat: such a clone is data-only; its prototype (so `toString()`) is gone.
    if (typeof error === "object" && IS_CONJURE_ERROR_KEY in error && error[IS_CONJURE_ERROR_KEY] === true) {
        return true;
    }

    // Back-compat for an older conjure-client version on the page that predates the brand: match the class
    // name. Brittle (minifiers mangle names) and removable in a major version.
    const errorPrototype = Object.getPrototypeOf(error);

    return (
        errorPrototype != null &&
        errorPrototype.constructor != null &&
        errorPrototype.constructor.name === ConjureError.name
    );
}
