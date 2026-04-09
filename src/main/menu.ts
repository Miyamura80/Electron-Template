import {
    type BrowserWindow,
    Menu,
    type MenuItemConstructorOptions,
    app,
    shell,
} from "electron";

/**
 * Build and install the application menu.
 *
 * Keeps things minimal but real: File, Edit (with native roles for copy /
 * paste / undo), View (reload + devtools in dev), Window, Help. On macOS we
 * prepend the standard app menu so Cmd+Q and About work correctly.
 *
 * Add project-specific items by extending the returned template - do NOT
 * fork this file per-feature, keep menu logic centralized.
 */
export function buildApplicationMenu(mainWindow: BrowserWindow): Menu {
    const isMac = process.platform === "darwin";
    const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);

    const template: MenuItemConstructorOptions[] = [];

    if (isMac) {
        template.push({
            label: app.getName(),
            submenu: [
                { role: "about" },
                { type: "separator" },
                { role: "services" },
                { type: "separator" },
                { role: "hide" },
                { role: "hideOthers" },
                { role: "unhide" },
                { type: "separator" },
                { role: "quit" },
            ],
        });
    }

    template.push({
        label: "&File",
        submenu: [
            {
                label: "New Window",
                accelerator: "CmdOrCtrl+N",
                click: () => {
                    mainWindow.webContents.send("menu:new-window");
                },
            },
            { type: "separator" },
            isMac ? { role: "close" } : { role: "quit" },
        ],
    });

    template.push({
        label: "&Edit",
        submenu: [
            { role: "undo" },
            { role: "redo" },
            { type: "separator" },
            { role: "cut" },
            { role: "copy" },
            { role: "paste" },
            { role: "selectAll" },
        ],
    });

    template.push({
        label: "&View",
        submenu: [
            { role: "reload" },
            { role: "forceReload" },
            ...(isDev ? [{ role: "toggleDevTools" as const }] : []),
            { type: "separator" },
            { role: "resetZoom" },
            { role: "zoomIn" },
            { role: "zoomOut" },
            { type: "separator" },
            { role: "togglefullscreen" },
        ],
    });

    template.push({
        label: "&Window",
        submenu: [
            { role: "minimize" },
            { role: "zoom" },
            ...(isMac
                ? [
                      { type: "separator" as const },
                      { role: "front" as const },
                      { type: "separator" as const },
                      { role: "window" as const },
                  ]
                : [{ role: "close" as const }]),
        ],
    });

    template.push({
        label: "&Help",
        submenu: [
            {
                label: "Learn More",
                click: () => {
                    shell.openExternal(
                        "https://github.com/miyamura80/electron-template",
                    );
                },
            },
            {
                label: "Report an Issue",
                click: () => {
                    shell.openExternal(
                        "https://github.com/miyamura80/electron-template/issues",
                    );
                },
            },
        ],
    });

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
    return menu;
}
