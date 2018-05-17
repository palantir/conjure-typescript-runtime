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

import { createRandomUuid, createUuid, isUuid } from "../uuid";

describe("uuid", () => {
    it("genreates random uuids", async () => {
        const uuidA = createRandomUuid();
        const uuidB = createRandomUuid();

        expect(uuidA).not.toEqual(uuidB);
    });

    it("fails on invalid uuid strings", async () => {
        expect(() => {
            // too short
            const id = createRandomUuid().toString();
            createUuid(id.substr(0, id.length - 4));
        }).toThrow();

        expect(() => {
            // not hex
            createUuid("x56a4180-h5aa-42ec-a945-5fd21dec0538");
        }).toThrow();

        expect(() => {
            // not valid
            createUuid("i am a valid uuid");
        }).toThrow();

        expect(() => {
            // not valid
            createUuid("");
        }).toThrow();
    });

    it("generates uuid from string", async () => {
        const uuid1 = createRandomUuid();
        const uuid2 = createUuid(uuid1.toString());

        expect(uuid1).toEqual(uuid2);
    });

    it("checks if strings are valid uuids", async () => {
        expect(isUuid("not a valid uuid")).toBeFalsy();
        expect(isUuid(createRandomUuid())).toBeTruthy();
    });
});
