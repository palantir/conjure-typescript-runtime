#!/bin/bash

# Regression check for #79: the emitted typings must not require lib.dom.d.ts.
#
# Consumers in a Node environment (directly or transitively) compile without the DOM
# lib. If the generated .d.ts files name DOM types without pulling the lib in, tsc
# fails with TS2304 inside node_modules and breaks their build. This type-checks the
# built package the way such a consumer would.
#
# Run after `compile`, since it checks the contents of lib/.

set -e
set -o pipefail

PACKAGE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

if [ ! -f "$PACKAGE_DIR/lib/index.d.ts" ]; then
    echo "check-node-typings: lib/index.d.ts not found; run 'yarn compile' first." >&2
    exit 1
fi

mkdir -p "$WORK_DIR/node_modules"
ln -s "$PACKAGE_DIR" "$WORK_DIR/node_modules/conjure-client"

cat > "$WORK_DIR/consumer.ts" <<'CONSUMER'
import { FetchBridge, IFetchResponse } from "conjure-client";

export const bridge = FetchBridge;

// Exercise the members that depend on Fetch API types, so this fails if the typings
// are made to resolve by weakening them (for example to empty interfaces) rather than
// by making the required lib available.
declare const response: IFetchResponse;
export const contentType: string | null = response.headers.get("content-type");
export async function size(): Promise<number> {
    return (await response.blob()).size;
}
CONSUMER

# No "dom" lib and no @types: the strictest form of the environment from #79.
cat > "$WORK_DIR/tsconfig.json" <<'TSCONFIG'
{
    "compilerOptions": {
        "lib": ["es2019"],
        "module": "commonjs",
        "moduleResolution": "node",
        "noEmit": true,
        "skipLibCheck": false,
        "strict": true,
        "types": []
    },
    "files": ["consumer.ts"]
}
TSCONFIG

echo "check-node-typings: type-checking built typings without lib.dom..."
if ! "$PACKAGE_DIR/../../node_modules/.bin/tsc" -p "$WORK_DIR/tsconfig.json"; then
    echo "" >&2
    echo "check-node-typings: FAILED. The published typings do not resolve without" >&2
    echo "lib.dom.d.ts, which breaks Node consumers. See #79." >&2
    exit 1
fi
echo "check-node-typings: OK"
