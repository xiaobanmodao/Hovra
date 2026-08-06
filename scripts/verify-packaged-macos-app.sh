#!/bin/sh
set -eu

if [ "$(uname -s)" != "Darwin" ]; then
  exit 0
fi

archive_path="out/make/zip/darwin/arm64/Hovra-darwin-arm64-0.0.0.zip"
if [ ! -f "$archive_path" ]; then
  echo "Packaged macOS archive not found: $archive_path" >&2
  exit 1
fi

# Verify a clean extraction because Desktop folders managed by File Provider can
# immediately add Finder metadata to the directly runnable build directory.
verify_dir="$(mktemp -d)"
trap 'rm -rf "$verify_dir"' EXIT INT TERM
ditto -x -k "$archive_path" "$verify_dir"
app_path="$verify_dir/Hovra.app"
codesign --verify --deep --strict "$app_path"
test -f "$app_path/Contents/Resources/cursor-visibility.node"
