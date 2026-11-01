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

import { ConjureError, ConjureErrorType } from "../../errors/error";
import { FetchBridge, IFetchResponse } from "../fetchBridge";
import { exponentialBackoff, RetryingFetch } from "../retryingFetch";

const baseUrl = "https://host.domain/path";
const userAgent = { productName: "foo", productVersion: "1.2.3" };

function jsonResponse(data: any, status = 200): IFetchResponse {
    return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
        status,
    });
}

/** A fetch that only settles when its signal aborts, like a real request to an unresponsive server. */
function hangingFetchHonouringSignal() {
    return jest.fn(
        (_url: string | Request, init?: RequestInit) =>
            new Promise<IFetchResponse>((_resolve, reject) => {
                const signal = init!.signal!;
                signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
            }),
    );
}

async function captureError(promise: Promise<any>): Promise<ConjureError<any>> {
    try {
        await promise;
    } catch (e) {
        return e as ConjureError<any>;
    }
    throw new Error("expected the promise to reject");
}

describe("FetchBridge timeouts and cancellation", () => {
    it("does not attach a signal when neither a timeout nor a signal is configured", async () => {
        const fetch = jest.fn((_url: string | Request, _init?: RequestInit) => Promise.resolve(jsonResponse({ a: 1 })));
        const bridge = new FetchBridge({ baseUrl, userAgent, fetch });

        await expect(bridge.call("S", "e", "GET", "/foo")).resolves.toEqual({ a: 1 });
        expect(fetch.mock.calls[0][1]!.signal).toBeUndefined();
    });

    it("rejects with a NETWORK error when the request exceeds requestTimeoutMs, aborting the fetch", async () => {
        const fetch = hangingFetchHonouringSignal();
        const bridge = new FetchBridge({ baseUrl, userAgent, fetch, requestTimeoutMs: 20 });

        const error = await captureError(bridge.call("S", "e", "GET", "/foo"));

        expect(error).toBeInstanceOf(ConjureError);
        expect(error.type).toBe(ConjureErrorType.Network);
        expect(error.originalError.name).toBe("TimeoutError");
        expect(error.originalError.message).toBe("Request timed out after 20ms");
        expect(fetch.mock.calls[0][1]!.signal!.aborted).toBe(true);
    });

    it("times out even if the fetch implementation ignores the signal", async () => {
        const fetch = jest.fn(() => new Promise<IFetchResponse>(() => undefined));
        const bridge = new FetchBridge({ baseUrl, userAgent, fetch, requestTimeoutMs: 20 });

        const error = await captureError(bridge.call("S", "e", "GET", "/foo"));

        expect(error.type).toBe(ConjureErrorType.Network);
        expect(error.originalError.name).toBe("TimeoutError");
    });

    it("applies the timeout to reading the response body", async () => {
        const slowBody: IFetchResponse = {
            ...jsonResponse(undefined),
            body: null,
            headers: new Headers({ "Content-Type": "application/json" }),
            json: () => new Promise(() => undefined),
            ok: true,
            status: 200,
        } as any;
        const bridge = new FetchBridge({
            baseUrl,
            fetch: () => Promise.resolve(slowBody),
            requestTimeoutMs: 20,
            userAgent,
        });

        const error = await captureError(bridge.call("S", "e", "GET", "/foo"));

        expect(error.type).toBe(ConjureErrorType.Network);
        expect(error.originalError.name).toBe("TimeoutError");
    });

    it("succeeds within the timeout and leaves the signal un-aborted", async () => {
        const fetch = jest.fn((_url: string | Request, _init?: RequestInit) => Promise.resolve(jsonResponse({ a: 1 })));
        const bridge = new FetchBridge({ baseUrl, userAgent, fetch, requestTimeoutMs: 20 });

        await expect(bridge.call("S", "e", "GET", "/foo")).resolves.toEqual({ a: 1 });
        await new Promise(resolve => setTimeout(resolve, 40));
        expect(fetch.mock.calls[0][1]!.signal!.aborted).toBe(false);
    });

    it("rejects with an OTHER error carrying an AbortError when the caller aborts", async () => {
        const fetch = hangingFetchHonouringSignal();
        const bridge = new FetchBridge({ baseUrl, userAgent, fetch });
        const controller = new AbortController();

        const promise = bridge.callEndpoint({
            endpointPath: "/foo",
            method: "GET",
            pathArguments: [],
            queryArguments: {},
            signal: controller.signal,
        });
        controller.abort();
        const error = await captureError(promise);

        expect(error.type).toBe(ConjureErrorType.Other);
        expect(error.originalError.name).toBe("AbortError");
        expect(fetch.mock.calls[0][1]!.signal!.aborted).toBe(true);
    });

    it("does not send a request when the caller's signal is already aborted", async () => {
        const fetch = jest.fn();
        const bridge = new FetchBridge({ baseUrl, userAgent, fetch });
        const controller = new AbortController();
        controller.abort();

        const error = await captureError(
            bridge.callEndpoint({
                endpointPath: "/foo",
                method: "GET",
                pathArguments: [],
                queryArguments: {},
                signal: controller.signal,
            }),
        );

        expect(error.type).toBe(ConjureErrorType.Other);
        expect(error.originalError.name).toBe("AbortError");
        expect(fetch).not.toHaveBeenCalled();
    });

    it("stops RetryingFetch backoff when the timeout elapses", async () => {
        const delegate = jest.fn((_url: string | Request, _init?: RequestInit) =>
            Promise.resolve(jsonResponse({}, 503)),
        );
        const retrying = new RetryingFetch(delegate, () => 50);
        const bridge = new FetchBridge({ baseUrl, userAgent, fetch: retrying.fetch, requestTimeoutMs: 20 });

        const error = await captureError(bridge.call("S", "e", "GET", "/foo"));
        expect(error.type).toBe(ConjureErrorType.Network);

        // Give a cancelled retry timer the chance to (wrongly) fire.
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(delegate).toHaveBeenCalledTimes(1);
    });

    it("rejects invalid requestTimeoutMs values", () => {
        for (const requestTimeoutMs of [0, -1, NaN, Infinity]) {
            expect(() => new FetchBridge({ baseUrl, userAgent, requestTimeoutMs })).toThrow(/requestTimeoutMs/);
        }
    });
});

describe("FetchBridge auth header", () => {
    for (const token of [null, ""]) {
        it(`omits the Authorization header when the token supplier returns ${JSON.stringify(token)}`, async () => {
            const fetch = jest.fn((_url: string | Request, _init?: RequestInit) =>
                Promise.resolve(jsonResponse({ a: 1 })),
            );
            const bridge = new FetchBridge({ baseUrl, userAgent, fetch, token: () => token as any });

            await bridge.call("S", "e", "GET", "/foo");

            expect((fetch.mock.calls[0][1]!.headers as any).Authorization).toBeUndefined();
        });
    }

    it("still sends real tokens", async () => {
        const fetch = jest.fn((_url: string | Request, _init?: RequestInit) => Promise.resolve(jsonResponse({ a: 1 })));
        const bridge = new FetchBridge({ baseUrl, userAgent, fetch, token: () => Promise.resolve("TOKEN") });

        await bridge.call("S", "e", "GET", "/foo");

        expect((fetch.mock.calls[0][1]!.headers as any).Authorization).toBe("Bearer TOKEN");
    });
});

describe("exponentialBackoff", () => {
    it("bounds the total number of attempts", () => {
        const backoff = exponentialBackoff(3, 100);
        expect(backoff(0)).not.toBeUndefined();
        expect(backoff(1)).not.toBeUndefined();
        expect(backoff(2)).toBeUndefined();
    });
});
