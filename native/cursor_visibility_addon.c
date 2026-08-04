#include <ApplicationServices/ApplicationServices.h>
#include <dlfcn.h>
#include <node_api.h>
#include <stdbool.h>
#include <stdint.h>

typedef uint32_t CGSConnectionID;
typedef CGSConnectionID (*CGSMainConnectionIDFunction)(void);
typedef CGError (*CGSObscureCursorFunction)(CGSConnectionID);

static bool cursor_hidden = false;
static CGSMainConnectionIDFunction main_connection_function = NULL;
static CGSObscureCursorFunction obscure_cursor_function = NULL;

static napi_value boolean_result(napi_env env, bool value) {
  napi_value result;
  napi_get_boolean(env, value, &result);
  return result;
}

static napi_value hide_cursor(napi_env env, napi_callback_info info) {
  if (cursor_hidden) return boolean_result(env, true);
  CGError error = CGDisplayHideCursor(CGMainDisplayID());
  if (error == kCGErrorSuccess) cursor_hidden = true;
  return boolean_result(env, error == kCGErrorSuccess);
}

static napi_value show_cursor(napi_env env, napi_callback_info info) {
  if (!cursor_hidden) return boolean_result(env, true);
  CGError error = CGDisplayShowCursor(CGMainDisplayID());
  if (error == kCGErrorSuccess) cursor_hidden = false;
  return boolean_result(env, error == kCGErrorSuccess);
}

static napi_value obscure_cursor(napi_env env, napi_callback_info info) {
  if (!cursor_hidden || !main_connection_function || !obscure_cursor_function) {
    return boolean_result(env, false);
  }

  CGSConnectionID connection = main_connection_function();
  return boolean_result(
      env,
      connection != 0 && obscure_cursor_function(connection) == kCGErrorSuccess);
}

static void restore_cursor(void *data) {
  if (!cursor_hidden) return;
  CGDisplayShowCursor(CGMainDisplayID());
  cursor_hidden = false;
}

static napi_value initialize(napi_env env, napi_value exports) {
  main_connection_function = (CGSMainConnectionIDFunction)dlsym(
      RTLD_DEFAULT, "CGSMainConnectionID");
  obscure_cursor_function = (CGSObscureCursorFunction)dlsym(
      RTLD_DEFAULT, "CGSObscureCursor");
  napi_add_env_cleanup_hook(env, restore_cursor, NULL);

  napi_property_descriptor properties[] = {
      {"hide", NULL, hide_cursor, NULL, NULL, NULL, napi_default, NULL},
      {"show", NULL, show_cursor, NULL, NULL, NULL, napi_default, NULL},
      {"obscure", NULL, obscure_cursor, NULL, NULL, NULL, napi_default, NULL},
  };
  napi_define_properties(env, exports, 3, properties);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
