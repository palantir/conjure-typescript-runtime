#!/usr/bin/env bash

set -e

CONJURE_TYPESCRIPT=build/conjure-typescript/bin/conjure-typescript
TEST_DIR=src/__integTest__/__generated__

# Clear directory before regenerating
if [ -e "$TEST_DIR/index.ts" ]; then
    rm -rf "$TEST_DIR/conjure-compliance" "$TEST_DIR/index.ts"
fi

$CONJURE_TYPESCRIPT generate resources/compliance-api.json "$TEST_DIR" --packageName generated --packageVersion 0.0.0

# Clean up package cruft
rm ${TEST_DIR}/*.json "$TEST_DIR/.npmignore"

# Replace replaces references to point to internal package
find src/__integTest__/__generated__/  -name "*.ts" -type f -exec sed -i '' 's|conjure-client|../../../httpApiBridge|g' {} \;
