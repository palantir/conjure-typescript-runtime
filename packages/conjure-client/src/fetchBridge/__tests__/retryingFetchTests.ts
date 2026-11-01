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

import { IFetchResponse } from "../fetchBridge";
import { exponentialBackoff, RetryingFetch } from "../retryingFetch";

const baseUrl = "https://host.domain/path";
const token = "TOKEN";

describe("RetryingFetch", () => {
    const maxAttempts = 3;
    const backoff = exponentialBackoff(maxAttempts, 100);

    it("delegates to the passed delegate fetch", async () => {
        const expectedUrl = `${baseUrl}/a/val/b`;
        const expectedFetchRequest = createFetchRequest("POST");
        const expectedFetchResponse = createFetchResponse(undefined, 200);

        const delegateFetch = jest.fn((_, __) => {
            return Promise.resolve(expectedFetchResponse);
        });

        const retryingFetch = new RetryingFetch(delegateFetch, backoff);

        const response = retryingFetch.fetch(expectedUrl, expectedFetchRequest);

        await expect(response).resolves.toBe(expectedFetchResponse);
        expect(delegateFetch.mock.calls.length).toBe(1);
        expect(delegateFetch.mock.calls[0]).toEqual([expectedUrl, expectedFetchRequest]);
    });

    it("retries a limited number of times", async () => {
        const expectedUrl = `${baseUrl}/a/val/b`;
        const expectedFetchRequest = createFetchRequest("POST");
        const expectedFetchResponse = createFetchResponse(undefined, 429);

        const delegateFetch = jest.fn((_, __) => {
            return Promise.resolve(expectedFetchResponse);
        });

        const retryingFetch = new RetryingFetch(delegateFetch, backoff);

        const response = retryingFetch.fetch(expectedUrl, expectedFetchRequest);

        await expect(response).resolves.toBe(expectedFetchResponse);
        expect(delegateFetch.mock.calls.length).toBe(maxAttempts);
    });

    it("retries on 503s", async () => {
        const expectedUrl = `${baseUrl}/a/val/b`;
        const expectedFetchRequest = createFetchRequest("POST");
        const expectedFetchResponse = createFetchResponse(undefined, 503);

        const delegateFetch = jest.fn((_, __) => {
            return Promise.resolve(expectedFetchResponse);
        });

        const retryingFetch = new RetryingFetch(delegateFetch, backoff);

        const response = retryingFetch.fetch(expectedUrl, expectedFetchRequest);

        await expect(response).resolves.toBe(expectedFetchResponse);
        expect(delegateFetch.mock.calls.length).toBe(maxAttempts);
    });

    it("does not retry non-qos error response", async () => {
        const expectedUrl = `${baseUrl}/a/val/b`;
        const expectedFetchRequest = createFetchRequest("POST");
        const expectedFetchResponse = createFetchResponse(undefined, 400);

        const delegateFetch = jest.fn((_, __) => {
            return Promise.resolve(expectedFetchResponse);
        });

        const retryingFetch = new RetryingFetch(delegateFetch, backoff);

        const response = retryingFetch.fetch(expectedUrl, expectedFetchRequest);

        await expect(response).resolves.toBe(expectedFetchResponse);
        // check we did not retry
        expect(delegateFetch.mock.calls.length).toBe(1);
    });

    it("honours Retry-After header", async () => {
        const expectedUrl = `${baseUrl}/a/val/b`;
        const expectedFetchRequest = createFetchRequest("POST");
        const expectedFetchResponse = createFetchResponse(undefined, 429);
        if (expectedFetchResponse.headers instanceof Headers) {
            expectedFetchResponse.headers.append("Retry-After", "2");
        }

        const delegateFetch = jest.fn((_, __) => {
            return Promise.resolve(expectedFetchResponse);
        });

        const retryingFetch = new RetryingFetch(delegateFetch, backoff);

        const originalSetTimeout = window.setTimeout;
        const mockedSetTimeout = jest.fn((callback, timeout) => {
            originalSetTimeout(callback, timeout);
            return 0;
        });
        window.setTimeout = mockedSetTimeout as any;

        await retryingFetch.fetch(expectedUrl, expectedFetchRequest);
        expect(mockedSetTimeout.mock.calls[0][1]).toEqual(2000);

        // restore
        window.setTimeout = originalSetTimeout;
    });

    for (const hint of ["do-not-retry", "Do-Not-Retry"]) {
        it(`does not retry when the server sends Qos-Retry-Hint: ${hint}`, async () => {
            const response = createFetchResponse(undefined, 503);
            response.headers.append("Qos-Retry-Hint", hint);
            const delegateFetch = jest.fn((_, __) => Promise.resolve(response));

            const result = await new RetryingFetch(delegateFetch, backoff).fetch(baseUrl, createFetchRequest("GET"));

            expect(result).toBe(response);
            expect(delegateFetch.mock.calls.length).toBe(1);
        });
    }

    it("still retries on other Qos-Retry-Hint values", async () => {
        const throttled = createFetchResponse(undefined, 429);
        throttled.headers.append("Qos-Retry-Hint", "some-future-hint");
        const final = createFetchResponse(undefined, 200);
        const delegateFetch = jest.fn().mockResolvedValueOnce(throttled).mockResolvedValueOnce(final);

        const result = await new RetryingFetch(delegateFetch, () => 1).fetch(baseUrl, createFetchRequest("GET"));

        expect(result).toBe(final);
        expect(delegateFetch.mock.calls.length).toBe(2);
    });

    it("honours Retry-After headers in HTTP-date form", async () => {
        const response = createFetchResponse(undefined, 503);
        response.headers.append("Retry-After", new Date(Date.now() + 2000).toUTCString());
        const delays = await captureRetryDelays(response);

        // HTTP-dates have one-second resolution, so allow for truncation.
        expect(delays[0]).toBeGreaterThan(900);
        expect(delays[0]).toBeLessThanOrEqual(2000);
    });

    it("retries immediately for a Retry-After date in the past", async () => {
        const response = createFetchResponse(undefined, 503);
        response.headers.append("Retry-After", new Date(Date.now() - 60000).toUTCString());
        const delays = await captureRetryDelays(response);

        expect(delays[0]).toBe(0);
    });

    it("ignores Retry-After dates beyond the maximum", async () => {
        const response = createFetchResponse(undefined, 503);
        response.headers.append("Retry-After", new Date(Date.now() + 10 * 60000).toUTCString());
        const delays = await captureRetryDelays(response, () => 7);

        expect(delays[0]).toBe(7);
    });

    it("releases the body of responses it retries past", async () => {
        const discarded = createFetchResponse(undefined, 503);
        const cancel = jest.spyOn(discarded.body!, "cancel");
        const final = createFetchResponse(undefined, 200);
        const delegateFetch = jest.fn().mockResolvedValueOnce(discarded).mockResolvedValueOnce(final);

        const result = await new RetryingFetch(delegateFetch, () => 1).fetch(baseUrl, createFetchRequest("GET"));

        expect(result).toBe(final);
        expect(cancel).toHaveBeenCalledTimes(1);
    });

    it("stops retrying and rejects when the request's signal is aborted during backoff", async () => {
        const delegateFetch = jest.fn((_, __) => Promise.resolve(createFetchResponse(undefined, 503)));
        const controller = new AbortController();

        const promise = new RetryingFetch(delegateFetch, () => 50).fetch(baseUrl, {
            ...createFetchRequest("GET"),
            signal: controller.signal,
        });
        await new Promise(resolve => setTimeout(resolve, 10));
        controller.abort();

        await expect(promise).rejects.toMatchObject({ name: "AbortError" });
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(delegateFetch.mock.calls.length).toBe(1);
    });

    it("does not call the delegate when the signal is already aborted", async () => {
        const delegateFetch = jest.fn();
        const controller = new AbortController();
        controller.abort();

        const promise = new RetryingFetch(delegateFetch, backoff).fetch(baseUrl, {
            ...createFetchRequest("GET"),
            signal: controller.signal,
        });

        await expect(promise).rejects.toMatchObject({ name: "AbortError" });
        expect(delegateFetch).not.toHaveBeenCalled();
    });
});

/** Runs a request whose first response is `first` and whose retry succeeds, recording each backoff delay. */
async function captureRetryDelays(first: IFetchResponse, strategy = backoffForever): Promise<number[]> {
    const delegateFetch = jest
        .fn()
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce(createFetchResponse(undefined, 200));
    const delays: number[] = [];
    const originalSetTimeout = window.setTimeout;
    window.setTimeout = ((callback: () => void, timeout: number) => {
        delays.push(timeout);
        return originalSetTimeout(callback, 0);
    }) as any;
    try {
        await new RetryingFetch(delegateFetch, strategy).fetch(baseUrl, createFetchRequest("GET"));
    } finally {
        window.setTimeout = originalSetTimeout;
    }
    return delays;
}

function backoffForever() {
    return 5;
}

function createFetchRequest(method: string, data?: any, contentType = "application/json", headers = {}): RequestInit {
    const request: RequestInit = {
        credentials: "same-origin",
        headers: {
            ...headers,
            Authorization: `Bearer ${token}`,
        },
        method,
    };
    if (data != null) {
        request.body = contentType === "application/json" ? JSON.stringify(data) : data;

        // when we do a fetch with form data, leave the Content-Type undefined so browser can set form boundary
        if (contentType !== "multipart/form-data") {
            (request.headers as any)["Content-Type"] = contentType;
        }
    }
    return request;
}

function createFetchResponse(data: any, status: number): IFetchResponse {
    return {
        body: new ReadableStream(),
        blob: () => Promise.resolve(new Blob([data])),
        headers: new Headers(),
        json: () => Promise.resolve(JSON.parse(data)),
        ok: 200 <= status && status < 300,
        status,
        text: () => Promise.resolve(data),
    };
}
