#!/bin/sh
set -eu
mkdir -p native
clang -framework ApplicationServices native/cursor_visibility_helper.c -o native/cursor-visibility-helper
