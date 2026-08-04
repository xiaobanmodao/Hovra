#!/bin/sh
set -eu
mkdir -p native
node_include_dir="$(node -p "require('path').resolve(require('path').dirname(process.execPath), '../include/node')")"

clang -std=c11 \
  -bundle \
  -undefined dynamic_lookup \
  -I"$node_include_dir" \
  -framework ApplicationServices \
  native/cursor_visibility_addon.c \
  -o native/cursor-visibility.node
