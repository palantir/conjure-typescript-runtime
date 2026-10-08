# CLAUDE.md

Guidance for [Claude Code](https://claude.com/claude-code) when working in this repository.

## What this repository is

`conjure-typescript-runtime` is the HTTP client runtime that generated Conjure TypeScript code depends on. It is a Yarn workspaces + Lerna monorepo, but there is currently only one published package:

| Path | Package | Notes |
| --- | --- | --- |
| `packages/conjure-client` | `conjure-client` | The entire public API. Everything below refers to this package. |

The important consequence of it being a runtime for *generated* code is that its public types are consumed by code nobody writes by hand, in environments the maintainers do not control — browsers, Node services, and build tools that only type-check. Changes to the public type surface are high blast radius.

## Commands

Run these from `packages/conjure-client`:

```
yarn compile              # tsc -p ./src, then rollup for the modern build
yarn lint                 # tslint
yarn prettier             # prettier --check, run from the repo root
yarn test:unit            # jest
yarn check-node-typings   # verifies the emitted .d.ts works without lib.dom (see below)
yarn build                # clean, lint, prettier, compile, check-node-typings, test
```

`yarn build` is what CI runs. Prefer running the individual steps while iterating, since `yarn test` also pulls down external tooling.

**`yarn test` needs network and a Java runtime.** It downloads the `conjure-typescript` compiler and a Java verification server, generates test bindings, then runs unit *and* integration tests. Without Java the integration suite cannot run at all. `yarn test:unit` is the part that runs anywhere, and it is usually the right thing to run locally.

## The typings must not require `lib.dom.d.ts`

This package's API describes Fetch API values, so its emitted declarations reference `Blob`, `Headers`, `Request`, `RequestInit` and `ReadableStream`. Those names come from `lib.dom.d.ts`, which **Node consumers do not have configured**. If the emitted `.d.ts` names them without making the lib available, `tsc` fails with `TS2304` inside `node_modules` and breaks the consumer's build — including consumers who only depend on this package transitively.

`src/fetchBridge/fetchBridge.ts` carries a `/// <reference lib="dom" />` directive for this reason. TypeScript propagates it into the generated `.d.ts`, so consumers pick the lib up automatically. Do not remove it without replacing it with something that keeps `yarn check-node-typings` passing.

Be careful about how this gets "fixed": declaring empty global interfaces (`interface Headers {}`) silences `TS2304` but resolves the types to `{}`, so `headers.get(...)` stops existing for Node consumers. That trades a loud build failure for silent loss of type safety. `check-node-typings` deliberately exercises real members so it rejects that shape of fix.

Local stand-in types are a reasonable idea but cannot currently express `ReadableStream<Uint8Array>`: the type parameter is not recoverable from `typeof globalThis`, so `body` degrades to `ReadableStream<unknown>` and stops being assignable for browser consumers.

## Conventions

- **Formatting and lint are enforced in CI.** Prettier runs from the repo root across everything; tslint runs against `src`. Run both before proposing changes.
- **Every source file carries the Apache 2.0 license header.** Copy it from a neighbouring file when adding one.
- **Interfaces are prefixed with `I`** (`IFetchResponse`, `IHttpApiBridge`), matching the Blueprint tslint config.
- **`yarn.lock` is checked.** CI fails if `yarn install` dirties it, so do not hand-edit it and do commit it when dependencies change.
- **Generated files are not checked in.** `src/generated/index.ts` is produced by `scripts/generate-library-version.sh` during `precompile`; run `yarn compile` rather than creating it by hand.

## Things to be careful about

- **Public type changes can break consumers without breaking this repo's build.** The package compiles with `"lib": ["dom", "es6", "es5"]`, so DOM types always resolve here. A change that only fails for a consumer without `lib.dom` will pass every check in this repo except `check-node-typings`. When touching exported types, type-check a consumer both ways.
- **`this.fetch || fetch` in `fetchBridge.ts` unions the injected fetch with the global one**, which intersects their parameter types. Loosening the type of a request-init field can fail there even though it looks permissive.
- **Do not claim the integration tests pass unless they actually ran.** They need Java and network; say which suites ran.
- **`web-streams-polyfill` is a runtime dependency, not a dev dependency.** Its `ReadableStream` is not interchangeable with the DOM one in both directions: the polyfill type has `values` and `[Symbol.asyncIterator]` that the DOM type lacks, so assigning a DOM stream to a polyfill-typed slot fails.

## Commit and PR conventions

`CONTRIBUTING.md` asks contributors to fork, branch, keep CI green, and open a PR optionally linking an issue. The repo uses `.changelog.yml`, so user-visible changes may need a changelog entry. Keep unrelated changes in separate commits.
