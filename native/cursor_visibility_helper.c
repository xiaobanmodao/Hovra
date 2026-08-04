#include <ApplicationServices/ApplicationServices.h>
#include <signal.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

static bool cursor_hidden = false;

static void show_cursor(void) {
  if (!cursor_hidden) return;
  CGDisplayShowCursor(kCGDirectMainDisplay);
  cursor_hidden = false;
}

static void cleanup_and_exit(int signal_number) {
  show_cursor();
  _Exit(128 + signal_number);
}

int main(void) {
  atexit(show_cursor);
  signal(SIGTERM, cleanup_and_exit);
  signal(SIGINT, cleanup_and_exit);

  char command[16];
  while (fgets(command, sizeof(command), stdin) != NULL) {
    if (strcmp(command, "hide\n") == 0 && !cursor_hidden) {
      CGDisplayHideCursor(kCGDirectMainDisplay);
      cursor_hidden = true;
    } else if (strcmp(command, "show\n") == 0) {
      show_cursor();
    }
  }

  return 0;
}
