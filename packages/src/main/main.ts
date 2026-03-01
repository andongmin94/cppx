import path from "node:path";
import { registerIpcHandlers } from "./ipc";
import electron from "electron";
import type { BrowserWindow as BrowserWindowType } from "electron";

const { app, BrowserWindow } = electron;

let mainWindow: BrowserWindowType | null = null;

function createMainWindow(): BrowserWindowType {
  const window = new BrowserWindow({
    width: 1300,
    height: 900,
    minWidth: 1000,
    minHeight: 720,
    autoHideMenuBar: true,
    title: "cppx",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  return window;
}

app.whenReady().then(() => {
  mainWindow = createMainWindow();
  registerIpcHandlers(mainWindow);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
      registerIpcHandlers(mainWindow);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
