#!/usr/bin/env bash

set -e

VERSION="$(grep "^com.palantir.conjure.typescript:conjure-typescript" < ../../versions.props | tail -1 | sed 's/^com.palantir.conjure.typescript:conjure-typescript = \(.*\)$/\1/')"
ARTIFACT_NAME="conjure-typescript-${VERSION}"
DOWNLOAD_OUTPUT="build/downloads/conjure-typescript.tgz"

mkdir -p build/downloads
curl -L "https://palantir.bintray.com/releases/com/palantir/conjure/typescript/conjure-typescript/${VERSION}/${ARTIFACT_NAME}.tgz" -o "$DOWNLOAD_OUTPUT"

tar xf "$DOWNLOAD_OUTPUT" -C build
mv "build/$ARTIFACT_NAME" build/conjure-typescript
