export const IPC_CHANNELS = {
  RUN_COMMAND: "cppx:run-command",
  SELECT_WORKSPACE: "cppx:select-workspace",
  GET_DEFAULT_WORKSPACE: "cppx:get-default-workspace",
  GET_TOOL_STATUS: "cppx:get-tool-status",
  GET_PROJECT_CONFIG: "cppx:get-project-config",
  SAVE_PROJECT_CONFIG: "cppx:save-project-config",
  LOG: "cppx:log"
} as const;
