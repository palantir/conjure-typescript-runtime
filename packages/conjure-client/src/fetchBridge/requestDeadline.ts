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

/**
 * Creates the error used when a signal is aborted without a reason (older runtimes don't populate
 * `AbortSignal.reason`). Mirrors the `AbortError` DOMException that `fetch` rejects with.
 * @internal
 */
export function createAbortError(): Error {
    if (typeof DOMException !== "undefined") {
        return new DOMException("The operation was aborted.", "AbortError");
    }
    const error = new Error("The operation was aborted.");
    error.name = "AbortError";
    return error;
}

/** @internal */
export function getAbortReason(signal: AbortSignal): unknown {
    const reason = (signal as { reason?: unknown }).reason;
    return reason !== undefined ? reason : createAbortError();
}

function createTimeoutError(timeoutMs: number): Error {
    const message = `Request timed out after ${timeoutMs}ms`;
    if (typeof DOMException !== "undefined") {
        return new DOMException(message, "TimeoutError");
    }
    const error = new Error(message);
    error.name = "TimeoutError";
    return error;
}

interface IDeadlineFailure {
    readonly timedOut: boolean;
    readonly error: unknown;
}

/**
 * Tracks the lifetime of a single request: an optional timeout plus an optional caller-supplied `AbortSignal`.
 *
 * When either fires, the request's `signal` is aborted (so `fetch` and `RetryingFetch` stop work and free the
 * connection) and every promise passed through {@link race} rejects immediately — even on runtimes whose `fetch`
 * ignores `signal`, so callers always get a timely answer.
 *
 * When neither a timeout nor a caller signal is configured this is a no-op: `signal` is `undefined` and
 * {@link race} returns the original promise untouched.
 *
 * @internal
 */
export class RequestDeadline {
    public readonly signal: AbortSignal | undefined;

    private readonly controller: AbortController | undefined;
    private readonly isActive: boolean;
    private timer: ReturnType<typeof setTimeout> | undefined;
    private failure: IDeadlineFailure | undefined;
    private rejectors: Array<(error: unknown) => void> = [];
    private detachCallerSignal: (() => void) | undefined;

    constructor(timeoutMs: number | undefined, callerSignal: AbortSignal | undefined) {
        const hasTimeout = timeoutMs !== undefined;
        this.isActive = hasTimeout || callerSignal !== undefined;
        if (!this.isActive) {
            this.controller = undefined;
            this.signal = undefined;
            return;
        }

        this.controller = typeof AbortController !== "undefined" ? new AbortController() : undefined;
        this.signal = this.controller !== undefined ? this.controller.signal : callerSignal;

        if (callerSignal !== undefined) {
            if (callerSignal.aborted) {
                this.fail({ timedOut: false, error: getAbortReason(callerSignal) });
            } else {
                const onAbort = () => this.fail({ timedOut: false, error: getAbortReason(callerSignal) });
                callerSignal.addEventListener("abort", onAbort);
                this.detachCallerSignal = () => callerSignal.removeEventListener("abort", onAbort);
            }
        }

        if (hasTimeout && this.failure === undefined) {
            this.timer = setTimeout(
                () => this.fail({ timedOut: true, error: createTimeoutError(timeoutMs!) }),
                timeoutMs,
            );
        }
    }

    /** True if the request was cut short because the timeout elapsed. */
    public get timedOut(): boolean {
        return this.failure !== undefined && this.failure.timedOut;
    }

    /** True if the request was cut short because the caller's signal was aborted. */
    public get aborted(): boolean {
        return this.failure !== undefined && !this.failure.timedOut;
    }

    /** The timeout error or the caller's abort reason, if the deadline has been hit. */
    public get error(): unknown {
        return this.failure === undefined ? undefined : this.failure.error;
    }

    /** Throws the deadline error if the timeout has elapsed or the caller has aborted. */
    public throwIfFailed(): void {
        if (this.failure !== undefined) {
            throw this.failure.error;
        }
    }

    /** Resolves/rejects like `promise`, but rejects as soon as the deadline is hit. */
    public race<T>(promise: Promise<T>): Promise<T> {
        if (!this.isActive) {
            return promise;
        }
        if (this.failure !== undefined) {
            promise.catch(noop);
            return Promise.reject(this.failure.error);
        }
        return new Promise<T>((resolve, reject) => {
            this.rejectors.push(reject);
            promise.then(resolve, reject);
        });
    }

    /** Stops the timer and detaches from the caller's signal. Call once the response has been fully handled. */
    public dispose(): void {
        if (this.timer !== undefined) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
        if (this.detachCallerSignal !== undefined) {
            this.detachCallerSignal();
            this.detachCallerSignal = undefined;
        }
        this.rejectors = [];
    }

    private fail(failure: IDeadlineFailure) {
        if (this.failure !== undefined) {
            return;
        }
        this.failure = failure;
        if (this.controller !== undefined) {
            this.controller.abort(failure.error);
        }
        const rejectors = this.rejectors;
        this.dispose();
        rejectors.forEach(reject => reject(failure.error));
    }
}

// tslint:disable-next-line:no-empty
function noop() {}
