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

import uuidjs = require("uuidjs");

export type Uuid = string & { _uuidBrand: string };

export function isUuid(name: string): name is Uuid {
    return uuidjs.parse(name) != null;
}

export function createRandomUuid(): Uuid {
    // to match Java's randomUUID impl which uses version 4
    return uuidjs.genV4().toString() as Uuid;
}

export function createUuid(name: string): Uuid {
    const uuid = uuidjs.parse(name);
    if (uuid == null) {
        throw new Error(`${name} is not a valid uuid string.`);
    }
    return uuid.toString() as Uuid;
}
