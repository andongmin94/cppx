import { IPC_CHANNELS } from "@shared/channels";
import type { CppxApi, ProjectConfigPayload, RunCommandPayload } from "@shared/contracts";
import electron from "electron";

const { contextBridge, ipcRenderer } = electron;

const api: CppxApi = {
  runCommand: (payload: RunCommandPayload) =>
    ipcRenderer.invoke(IPC_CHANNELS.RUN_COMMAND, payload),
  selectWorkspace: () => ipcRenderer.invoke(IPC_CHANNELS.SELECT_WORKSPACE),
  getDefaultWorkspace: () => ipcRenderer.invoke(IPC_CHANNELS.GET_DEFAULT_WORKSPACE),
  getToolStatus: () => ipcRenderer.invoke(IPC_CHANNELS.GET_TOOL_STATUS),
  getProjectConfig: (workspace: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_PROJECT_CONFIG, workspace),
  saveProjectConfig: (workspace: string, config: ProjectConfigPayload) =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_PROJECT_CONFIG, workspace, config),
  onLog: (listener) => {
    const wrapped = (_event: unknown, entry: unknown) => {
      listener(entry as Parameters<typeof listener>[0]);
    };
    ipcRenderer.on(IPC_CHANNELS.LOG, wrapped);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.LOG, wrapped);
    };
  }
};

contextBridge.exposeInMainWorld("cppx", api);
