#!/bin/sh
set -eu

if [ "$(uname -s)" != "Darwin" ]; then
  exit 0
fi

mkdir -p native
xcrun swiftc \
  -O \
  -framework Foundation \
  -framework Vision \
  native/HandPoseHelper.swift \
  -o native/hand-pose-helper
