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
 * Lets {@link isConjureError} recognise errors from a different copy of conjure-client on the page, where
 * `instanceof` fails because each copy defines its own `ConjureError` class. `Symbol.for` resolves to the
 * same symbol across copies; see
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol/for.
 */
const CONJURE_ERROR_BRAND = Symbol.for("com.palantir.conjure.ConjureError");

export class ConjureError<E> {
    // On the prototype rather than the instance, so the brand doesn't clutter every instance.
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

    // Fast path: an error from this same copy of the library.
    if (error instanceof ConjureError) {
        return true;
    }

    // An error from a different copy of the library, recognised by the shared brand. (See CONJURE_ERROR_BRAND.)
    if (typeof error === "object" && CONJURE_ERROR_BRAND in error && error[CONJURE_ERROR_BRAND] === true) {
        return true;
    }

    // Back-compat for copies that predate the brand: match the class name. Brittle (minifiers mangle names)
    // and removable once every producer emits the brand.
    const errorPrototype = Object.getPrototypeOf(error);

    return (
        errorPrototype != null &&
        errorPrototype.constructor != null &&
        errorPrototype.constructor.name === ConjureError.name
    );
}
