// Main electron file
const { app, BrowserWindow, Menu, MenuItem } = require('electron');
const { cap, CAPACITOR_DEEPLINK_PROTOCOL } = require('@capacitor-community/electron');
const path = require('path');

// read capacitor configuration
const capConfig = cap.readConfig();
// get a value from capacitor config
const appName = capConfig.appName;

// create the main electron window
async function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: appName,
    webPreferences: {
      // Disabled for security, enable if you need Node.js integration in your renderer process
      nodeIntegration: false, 
      // Disabled for security, enable if you need to expose Node.js modules to your renderer process
      contextIsolation: true,
      // Preload script for safe communication between main and renderer processes
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // load the capacitor app
  await cap.load(win);

  const menu = Menu.getApplicationMenu();
    let fileMenu = new MenuItem({
        label: 'File',
        submenu: [
            {
                label: 'Quit',
                accelerator: 'CmdOrCtrl+Q',
                click: () => {
                    app.quit();
                },
            },
        ],
    });

    if (menu && process.platform === 'darwin') {
        menu.insert(0, fileMenu);
        Menu.setApplicationMenu(menu);
    } else if (menu) {
        menu.append(fileMenu);
        Menu.setApplicationMenu(menu);
    } else {
        const newMenu = new Menu();
        newMenu.append(fileMenu);
        Menu.setApplicationMenu(newMenu);
    }
  
  // Uncomment this to open dev tools on start
  // win.webContents.openDevTools();
}

// when electron is ready
app.whenReady().then(createWindow);

// quit when all windows are closed
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// A preload script is required for security and to bridge the gap between Electron's main process and the web content.
// Create a file named 'preload.js' in the 'electron' directory with the following content:
/**
 * const { contextBridge, ipcRenderer } = require('electron');
 * 
 * contextBridge.exposeInMainWorld('electronAPI', {
 *   // Example function to send data to main process
 *   // send: (channel, data) => ipcRenderer.send(channel, data),
 *   // Example function to receive data from main process
 *   // on: (channel, func) => {
 *   //   ipcRenderer.on(channel, (event, ...args) => func(...args));
 *   // }
 * });
 */
