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
 * Brand stamped on every {@link ConjureError} instance so {@link isConjureError} can recognise errors
 * thrown by a *different* copy of conjure-client on the page (e.g. a bundling/dedupe miss), where
 * `instanceof` fails because each copy defines its own `ConjureError` class.
 *
 * It uses `Symbol.for` (the runtime-global symbol registry) rather than `Symbol()` so that every copy
 * resolves this key to the *same* symbol; a plain class-name string would instead be unreliable because
 * minifiers rename classes. Being a symbol, it is also skipped by `JSON.stringify`, `Object.keys`, and
 * `for...in`, so it never leaks into serialized output.
 */
const CONJURE_ERROR_BRAND = Symbol.for("com.palantir.conjure.ConjureError");

export class ConjureError<E> {
    // Brands the prototype so isConjureError can detect ConjureErrors from other copies of the library,
    // without stamping a symbol onto (and cluttering) every instance.
    public get [CONJURE_ERROR_BRAND](): true {
        return true;
    }

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

    // Common case, and the cheapest check: an error from this same copy of the library, matched by its
    // prototype. Tried first because the cross-copy paths below can only ever add to this result.
    if (error instanceof ConjureError) {
        return true;
    }

    // A duplicate copy of the library defines its own `ConjureError` class, so the `instanceof` above
    // can't see its instances; the shared brand is what lets us recognise them. (See CONJURE_ERROR_BRAND.)
    if (typeof error === "object" && CONJURE_ERROR_BRAND in error && error[CONJURE_ERROR_BRAND] === true) {
        return true;
    }

    // Back-compat for errors from copies of conjure-client that predate the brand: fall back to matching
    // the class name. This is brittle (minifiers mangle class names) and can go once every producer
    // emits the brand.
    const errorPrototype = Object.getPrototypeOf(error);

    return (
        errorPrototype != null &&
        errorPrototype.constructor != null &&
        errorPrototype.constructor.name === ConjureError.name
    );
}
