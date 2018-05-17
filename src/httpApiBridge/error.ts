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

export enum ConjureErrorType {
    Network = "NETWORK",
    Other = "OTHER",
    Parse = "PARSE",
    Status = "STATUS",
}

export class ConjureError<E> {
    public readonly type: ConjureErrorType;
    public readonly originalError?: any;
    public readonly status?: number;
    public readonly body?: string | E;

    constructor(errorType: ConjureErrorType, originalError?: any, status?: number, body?: string | E) {
        this.type = errorType;
        this.originalError = originalError;
        this.status = status;
        this.body = body;
    }

    public toString() {
        return JSON.stringify(
            {
                body: this.body,
                originalError: this.originalError && this.originalError.toString(),
                status: this.status,
                type: this.type,
            },
            null,
            "  ",
        );
    }
}

export function isConjureError(error: any): error is ConjureError<never> {
    return (
        error instanceof ConjureError ||
        (error.__proto__ && error.__proto__.constructor && error.__proto__.constructor.name === ConjureError.name)
    );
}
