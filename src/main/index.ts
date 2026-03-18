import { app, BrowserWindow, nativeImage, Menu } from "electron";
import path from "node:path";
import { AgentManager } from "./agent-manager.js";
import { PtyManager } from "./pty-manager.js";
import { registerIpcHandlers } from "./ipc-handlers.js";
import { loadWindowState, saveWindowState } from "./store.js";

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  // In dev, app.getAppPath() points to the vite output dir, not project root.
  // Use __dirname to resolve relative to the compiled main process file.
  const isDev = !!MAIN_WINDOW_VITE_DEV_SERVER_URL;
  const iconPath = isDev
    ? path.join(process.cwd(), "assets", "icon.png")
    : path.join(app.getAppPath(), "assets", "icon.png");

  const savedWindowState = loadWindowState();

  mainWindow = new BrowserWindow({
    icon: nativeImage.createFromPath(iconPath),
    width: savedWindowState?.width ?? 1400,
    height: savedWindowState?.height ?? 900,
    x: savedWindowState?.x,
    y: savedWindowState?.y,
    minWidth: 800,
    minHeight: 600,
    title: "CrabCast",
    ...(process.platform === "darwin" ? {
      titleBarStyle: "hiddenInset" as const,
      trafficLightPosition: { x: 12, y: 12 },
    } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Persist window position/size on move and resize
  const saveCurrentWindowState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const bounds = mainWindow.getBounds();
    saveWindowState({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
  };
  mainWindow.on("resized", saveCurrentWindowState);
  mainWindow.on("moved", saveCurrentWindowState);

  const agentManager = new AgentManager(mainWindow);
  const ptyManager = new PtyManager(mainWindow);
  registerIpcHandlers(agentManager, ptyManager, mainWindow);

  // Set dock icon on macOS
  const icon = nativeImage.createFromPath(iconPath);
  if (process.platform === "darwin" && !icon.isEmpty() && app.dock) {
    app.dock.setIcon(icon);
  }

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }
}

app.whenReady().then(() => {
  // Override default menu to remove Cmd+W close-window accelerator.
  // The renderer handles Cmd+W to close the selected agent instead.
  const menu = Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
