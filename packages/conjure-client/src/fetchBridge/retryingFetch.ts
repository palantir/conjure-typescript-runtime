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

import { FetchFunction, IFetchResponse } from "./fetchBridge";
import { getAbortReason } from "./requestDeadline";

/**
 * The maximum value we accept in a Retry-After header.
 * If a server passes a value larger than this, we disregard
 * the Retry-After header.
 */
const MAX_RETRY_AFTER_MS = 60000;

/**
 * Conjure servers send `Qos-Retry-Hint: do-not-retry` alongside a 429/503 when retrying would only make an
 * overload worse; clients should surface the failure instead. Matched case-insensitively, as in
 * conjure-java-runtime-api's `QosReason.RetryHint`.
 */
const QOS_RETRY_HINT_HEADER = "Qos-Retry-Hint";
const QOS_DO_NOT_RETRY = "do-not-retry";

/**
 * A backoff strategy must return either the number of milliseconds to wait before retrying
 * a request, or undefined to indicate we should stop backing-off (e.g. if the maximum number
 * of retries have been exceeded.
 */
export type BackoffStrategy = (attempt: number) => number | undefined;

const SERVICE_UNAVAILABLE = 503;
const TOO_MANY_REQUESTS = 429;

/**
 * Implements "exponential backoff with full jitter", suggesting a backoff duration chosen randomly from the interval
 * `[0, backoffSlotSize * 2^c)` for the c-th retry.
 *
 * Note that `maxNumRetries` bounds the total number of *attempts*, including the first one: with
 * `exponentialBackoff(3, 100)` a request is sent at most 3 times (1 initial attempt + 2 retries).
 */
export function exponentialBackoff(maxNumRetries: number, backoffSlotSizeMs: number): BackoffStrategy {
    return (attempt: number) => {
        if (attempt + 1 >= maxNumRetries) {
            return undefined;
        }

        const upperBound = Math.pow(2, attempt);
        return Math.floor(Math.random() * upperBound * backoffSlotSizeMs);
    };
}

/**
 * Wraps a `fetch` implementation to transparently retry `429 Too Many Requests` and `503 Service Unavailable`
 * responses using the given {@link BackoffStrategy}, honouring the server's `Retry-After` header (in either its
 * delta-seconds or HTTP-date form) and Conjure's `Qos-Retry-Hint: do-not-retry` header.
 *
 * Retries stop immediately if the request's `signal` is aborted.
 */
export class RetryingFetch {
    constructor(private delegate: FetchFunction, private backoffStrategy: BackoffStrategy) {}

    public get fetch(): FetchFunction {
        return this.fetchInternal.bind(this);
    }

    private fetchInternal(url: string | Request, init?: RequestInit): Promise<IFetchResponse> {
        return new Promise((resolve, reject) => {
            this.doAttempt(url, init, 0, resolve, reject);
        });
    }

    private getRetryAfterHeaderValueInMilliseconds(response: IFetchResponse): number | undefined {
        const retryAfterHeader = response.headers.get("Retry-After");
        if (retryAfterHeader == null) {
            return undefined;
        }

        let retryAfterInMilliseconds: number;
        const retryAfterInSeconds = parseInt(retryAfterHeader, 10);
        if (!isNaN(retryAfterInSeconds)) {
            retryAfterInMilliseconds = retryAfterInSeconds * 1000;
        } else {
            // RFC 9110 section 10.2.3 also allows an HTTP-date, e.g. "Wed, 21 Oct 2015 07:28:00 GMT".
            const retryAt = Date.parse(retryAfterHeader);
            if (isNaN(retryAt)) {
                return undefined;
            }
            // A date in the past means "retry now".
            retryAfterInMilliseconds = Math.max(0, retryAt - Date.now());
        }

        if (retryAfterInMilliseconds < 0 || retryAfterInMilliseconds > MAX_RETRY_AFTER_MS) {
            return undefined;
        }

        return retryAfterInMilliseconds;
    }

    private getRetryAfter(response: IFetchResponse, attempt: number): number | undefined {
        if (response.status === TOO_MANY_REQUESTS || response.status === SERVICE_UNAVAILABLE) {
            const retryHint = response.headers.get(QOS_RETRY_HINT_HEADER);
            if (retryHint != null && retryHint.trim().toLowerCase() === QOS_DO_NOT_RETRY) {
                return undefined;
            }

            const backoffStrategyBackoff = this.backoffStrategy(attempt);
            if (backoffStrategyBackoff === undefined) {
                return undefined;
            }

            const retryAfterFromHeader = this.getRetryAfterHeaderValueInMilliseconds(response);
            if (retryAfterFromHeader !== undefined) {
                return retryAfterFromHeader;
            } else {
                return backoffStrategyBackoff;
            }
        }

        return undefined;
    }

    private async doAttempt(
        url: string | Request,
        init: RequestInit | undefined,
        attempt: number,
        resolve: (value: IFetchResponse) => void,
        reject: (value: any) => void,
    ): Promise<void> {
        const signal = init != null && init.signal != null ? init.signal : undefined;
        if (signal !== undefined && signal.aborted) {
            reject(getAbortReason(signal));
            return;
        }

        // fetch expects a nully context, so alias
        const fetchFunction = this.delegate;
        try {
            const response = await fetchFunction(url, init);
            if (response.ok) {
                resolve(response);
                return;
            }

            const retryAfter = this.getRetryAfter(response, attempt);
            if (retryAfter === undefined) {
                // no more retries, return what we have
                resolve(response);
                return;
            }

            // We're discarding this response: release its body so the underlying connection can be reused
            // instead of being held open until garbage collection.
            discardBody(response);

            // let's try again!
            const retry = () => {
                if (signal !== undefined) {
                    signal.removeEventListener("abort", onAbort);
                }
                this.doAttempt(url, init, attempt + 1, resolve, reject);
            };
            const timer = setTimeout(retry, retryAfter);
            const onAbort = () => {
                clearTimeout(timer);
                reject(getAbortReason(signal!));
            };
            if (signal !== undefined) {
                signal.addEventListener("abort", onAbort);
            }
        } catch (e) {
            reject(e);
        }
    }
}

function discardBody(response: IFetchResponse) {
    try {
        const body = response.body;
        if (body != null && typeof body.cancel === "function" && !body.locked) {
            body.cancel().catch(() => undefined);
        }
    } catch {
        // Best effort only: some fetch polyfills expose non-standard bodies.
    }
}
