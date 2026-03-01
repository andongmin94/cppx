import type { BrowserWindow } from "electron";
import { IPC_CHANNELS } from "@shared/channels";
import type { RunCommandPayload } from "@shared/contracts";
import { getCompilerScan } from "./cppx/installers";
import { getCppxRoot } from "./cppx/paths";
import { CppxService } from "./cppx/service";
import { resolveDefaultWorkspacePath } from "./default-workspace";
import electron from "electron";

const { dialog, ipcMain } = electron;

export function registerIpcHandlers(window: BrowserWindow): void {
  const service = new CppxService((entry) => {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.LOG, entry);
    }
  });

  ipcMain.removeHandler(IPC_CHANNELS.RUN_COMMAND);
  ipcMain.removeHandler(IPC_CHANNELS.SELECT_WORKSPACE);
  ipcMain.removeHandler(IPC_CHANNELS.GET_DEFAULT_WORKSPACE);
  ipcMain.removeHandler(IPC_CHANNELS.GET_CPPX_ROOT);
  ipcMain.removeHandler(IPC_CHANNELS.GET_COMPILER_SCAN);
  ipcMain.removeHandler(IPC_CHANNELS.GET_TOOL_STATUS);
  ipcMain.removeHandler(IPC_CHANNELS.GET_PROJECT_CONFIG);
  ipcMain.removeHandler(IPC_CHANNELS.SAVE_PROJECT_CONFIG);

  ipcMain.handle(IPC_CHANNELS.RUN_COMMAND, async (_event, payload: RunCommandPayload) =>
    service.execute(payload)
  );

  ipcMain.handle(IPC_CHANNELS.SELECT_WORKSPACE, async () => {
    const defaultWorkspace = await resolveDefaultWorkspacePath();
    const result = await dialog.showOpenDialog(window, {
      title: "cppx 작업 폴더 선택",
      defaultPath: defaultWorkspace,
      properties: ["openDirectory", "createDirectory"]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle(IPC_CHANNELS.GET_DEFAULT_WORKSPACE, async () =>
    resolveDefaultWorkspacePath()
  );
  ipcMain.handle(IPC_CHANNELS.GET_CPPX_ROOT, async () => getCppxRoot());
  ipcMain.handle(IPC_CHANNELS.GET_COMPILER_SCAN, async () => getCompilerScan());
  ipcMain.handle(IPC_CHANNELS.GET_TOOL_STATUS, async () => service.toolStatus());
  ipcMain.handle(IPC_CHANNELS.GET_PROJECT_CONFIG, async (_event, workspace: string) =>
    service.getProjectConfig(workspace)
  );
  ipcMain.handle(
    IPC_CHANNELS.SAVE_PROJECT_CONFIG,
    async (_event, workspace: string, config: unknown) =>
      service.saveProjectConfig(workspace, config)
  );
}
