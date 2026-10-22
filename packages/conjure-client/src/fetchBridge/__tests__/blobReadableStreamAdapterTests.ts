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

import { blobToReadableStream } from "../blobReadableStreamAdapter";

const HUNG = "HUNG";

function withTimeout<T>(promise: Promise<T>, ms = 1000): Promise<T | typeof HUNG> {
    return Promise.race([promise, new Promise<typeof HUNG>(resolve => setTimeout(() => resolve(HUNG), ms))]);
}

describe("blobToReadableStream", () => {
    it("emits the blob's bytes and then closes the stream", async () => {
        const stream = await blobToReadableStream(Promise.resolve(new Blob(["hello"])));
        const reader = stream.getReader();

        const first = await withTimeout(reader.read());
        expect(first).not.toBe(HUNG);
        const chunk = (first as ReadableStreamReadResult<Uint8Array>).value!;
        expect(Array.from(chunk)).toEqual(Array.from("hello").map(c => c.charCodeAt(0)));

        // Previously the stream never closed, so this read hung forever.
        await expect(withTimeout(reader.read())).resolves.toEqual({ done: true, value: undefined });
    });

    it("errors the stream when reading the blob fails", async () => {
        const failure = new Error("body read failed");
        const stream = await blobToReadableStream(Promise.reject(failure));
        const reader = stream.getReader();

        await expect(withTimeout(reader.read())).rejects.toBe(failure);
    });
});
