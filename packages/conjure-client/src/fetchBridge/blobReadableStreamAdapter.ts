/**
 * @license
 * Copyright 2019 Palantir Technologies, Inc.
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

import "web-streams-polyfill";

export function blobToReadableStream(blobPromise: Promise<Blob>): ReadableStream<Uint8Array> {
    return new ReadableStream({
        start: controller => {
            const reader = new FileReader();
            reader.onload = () => {
                controller.enqueue(new Uint8Array(reader.result as ArrayBuffer));
            };
            reader.onerror = () => {
                controller.error(reader.error);
            };
            blobPromise.then(blob => reader.readAsArrayBuffer(blob));
        },
    });
}
