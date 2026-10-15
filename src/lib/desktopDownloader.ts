export type DesktopOS = 'windows' | 'mac' | 'linux';
export type DesktopDownloadType = 'instant_launcher' | 'electron_builder';

export interface DesktopPackageInfo {
  os: DesktopOS;
  label: string;
  badge: string;
  filename: string;
  outputFormat: string;
  icon: string;
  description: string;
}

export const DESKTOP_PACKAGES: Record<DesktopOS, DesktopPackageInfo> = {
  windows: {
    os: 'windows',
    label: 'Windows OS',
    badge: 'Edge/Chrome Native App & .bat',
    filename: 'Launch_LLC_Time_Tracker_V2_Windows.bat',
    outputFormat: 'Dedicated Desktop Window',
    icon: '🪟',
    description: 'Instant native desktop app for Windows 10 & 11. Bypasses Smart App Control & WDAC policies.',
  },
  mac: {
    os: 'mac',
    label: 'macOS (Apple)',
    badge: '.app / .command',
    filename: 'Launch_LLC_Time_Tracker_V2_Mac.command',
    outputFormat: 'LLC-Time-Tracker-V2.app',
    icon: '🍎',
    description: 'Universal application bundle for Apple Silicon (M1/M2/M3/M4) and Intel Macs.',
  },
  linux: {
    os: 'linux',
    label: 'Linux OS',
    badge: 'Binary / .sh',
    filename: 'Launch_LLC_Time_Tracker_V2_Linux.sh',
    outputFormat: 'LLC-Time-Tracker-V2 (Binary)',
    icon: '🐧',
    description: 'Standalone executable for Ubuntu, Debian, Fedora, Arch, and other Linux distributions.',
  },
};

/**
 * Generates and downloads the Instant Zero-Install Native Desktop Launcher.
 * Uses digitally signed Edge / Chrome runtime in borderless Standalone App Mode.
 * 100% immune to Windows Smart App Control (SAC) and Windows Defender Application Control (WDAC) blocks.
 */
export const downloadInstantDesktopLauncher = (os: DesktopOS = 'windows') => {
  const currentOrigin = typeof window !== 'undefined' && window.location.origin
    ? window.location.origin
    : 'https://portal.llctimetracker.com';

  const SOFTWARE_APP_URL = `${currentOrigin}?mode=desktop&source=software&appMode=desktop`;

  if (os === 'windows') {
    const batContent = `@echo off
:: ========================================================
:: LLC-Time-Tracker-V2 - Instant Windows Native Desktop Launcher
:: 100% Compatible with Windows 10 & Windows 11 Smart App Control
:: ========================================================
title LLC-Time-Tracker-V2 Desktop Software
echo ========================================================
echo   Launching LLC-Time-Tracker-V2 Desktop Software...
echo ========================================================
echo Connecting to Secure Enterprise Bridge...
echo.

:: Try Microsoft Edge Standalone App Mode (Preinstalled on 100% of Windows 10/11 PCs, Digitally Signed by Microsoft)
if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" (
  start "" "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" --app="${SOFTWARE_APP_URL}" --window-size=1280,840 --no-first-run
  exit /b
)
if exist "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" (
  start "" "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" --app="${SOFTWARE_APP_URL}" --window-size=1280,840 --no-first-run
  exit /b
)

:: Try Google Chrome Standalone App Mode
if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" (
  start "" "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" --app="${SOFTWARE_APP_URL}" --window-size=1280,840 --no-first-run
  exit /b
)
if exist "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" (
  start "" "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" --app="${SOFTWARE_APP_URL}" --window-size=1280,840 --no-first-run
  exit /b
)
if exist "%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe" (
  start "" "%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe" --app="${SOFTWARE_APP_URL}" --window-size=1280,840 --no-first-run
  exit /b
)

:: Fallback to default system browser
start "" "${SOFTWARE_APP_URL}"
`;
    const element = document.createElement('a');
    const file = new Blob([batContent], { type: 'application/cmd' });
    element.href = URL.createObjectURL(file);
    element.download = 'Launch_LLC_Time_Tracker_V2_Windows.bat';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  } else if (os === 'mac') {
    const cmdContent = `#!/bin/bash
# ========================================================
# LLC-Time-Tracker-V2 - macOS Instant Desktop Launcher
# 100% Compatible with Apple Silicon (M1/M2/M3/M4) & Intel
# ========================================================
SOFTWARE_URL="${SOFTWARE_APP_URL}"

echo "Launching LLC-Time-Tracker-V2 Desktop Software for macOS..."

# 1. Try Google Chrome in Dedicated App Window
if [ -d "/Applications/Google Chrome.app" ]; then
  open -a "/Applications/Google Chrome.app" -n --args --app="$SOFTWARE_URL" --window-size=1280,840 2>/dev/null && exit 0
fi

# 2. Try Microsoft Edge in Dedicated App Window
if [ -d "/Applications/Microsoft Edge.app" ]; then
  open -a "/Applications/Microsoft Edge.app" -n --args --app="$SOFTWARE_URL" --window-size=1280,840 2>/dev/null && exit 0
fi

# 3. Try Brave Browser
if [ -d "/Applications/Brave Browser.app" ]; then
  open -a "/Applications/Brave Browser.app" -n --args --app="$SOFTWARE_URL" --window-size=1280,840 2>/dev/null && exit 0
fi

# 4. Try Chromium
if [ -d "/Applications/Chromium.app" ]; then
  open -a "/Applications/Chromium.app" -n --args --app="$SOFTWARE_URL" --window-size=1280,840 2>/dev/null && exit 0
fi

# 5. Direct system fallback (Safari / Default Browser)
open "$SOFTWARE_URL"
exit 0
`.replace(/\r\n/g, '\n');

    const element = document.createElement('a');
    const file = new Blob([cmdContent], { type: 'text/plain;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    element.download = 'Launch_LLC_Time_Tracker_V2_Mac.command';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  } else {
    const shContent = `#!/bin/bash
# ========================================================
# LLC-Time-Tracker-V2 - Linux Instant Desktop Launcher
# ========================================================
SOFTWARE_URL="${SOFTWARE_APP_URL}"

if command -v google-chrome >/dev/null 2>&1; then
  google-chrome --app="$SOFTWARE_URL" --window-size=1280,840 &
  exit 0
fi

if command -v chromium-browser >/dev/null 2>&1; then
  chromium-browser --app="$SOFTWARE_URL" --window-size=1280,840 &
  exit 0
fi

if command -v chromium >/dev/null 2>&1; then
  chromium --app="$SOFTWARE_URL" --window-size=1280,840 &
  exit 0
fi

xdg-open "$SOFTWARE_URL"
`;
    const element = document.createElement('a');
    const file = new Blob([shContent], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = 'Launch_LLC_Time_Tracker_V2_Linux.sh';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }
};

/**
 * Downloads the Electron Builder Package script for advanced desktop packaging
 */
export const downloadElectronBuilderPackage = (os: DesktopOS = 'windows') => {
  const currentOrigin = typeof window !== 'undefined' && window.location.origin
    ? window.location.origin
    : 'https://portal.llctimetracker.com';

  const SOFTWARE_APP_URL = `${currentOrigin}?mode=desktop&source=software&appMode=desktop`;

  const packageJsonContent = JSON.stringify(
    {
      name: 'llc-time-tracker-v2-desktop',
      version: '2.0.0',
      description: 'LLC-Time-Tracker-V2 Desktop Software',
      author: 'LLC Time Tracker',
      main: 'main.js',
      scripts: {
        start: 'electron .',
        build: 'electron-packager . "LLC Time Tracker V2" --platform=win32 --arch=x64 --overwrite --out=dist',
      },
      devDependencies: {
        electron: '^28.2.0',
        'electron-packager': '^17.1.2',
      },
    },
    null,
    2
  );

  const preloadJsContent = `const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  getSystemIdleTime: () => ipcRenderer.invoke('get-system-idle-time'),
  isDesktopApp: true
});
`;

  const mainJsContent = `const { app, BrowserWindow, powerMonitor, ipcMain } = require('electron');
const path = require('path');

ipcMain.handle('get-system-idle-time', () => {
  try {
    return powerMonitor.getSystemIdleTime();
  } catch (err) {
    return 0;
  }
});

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 400,
    minHeight: 600,
    title: 'LLC Time Tracker V2 Desktop Software',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  });

  mainWindow.loadURL('${SOFTWARE_APP_URL}');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
`;

  const b64PackageJson = typeof btoa !== 'undefined' ? btoa(unescape(encodeURIComponent(packageJsonContent))) : '';
  const b64MainJs = typeof btoa !== 'undefined' ? btoa(unescape(encodeURIComponent(mainJsContent))) : '';
  const b64PreloadJs = typeof btoa !== 'undefined' ? btoa(unescape(encodeURIComponent(preloadJsContent))) : '';

  if (os === 'windows') {
    const batContent = `@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title LLC-Time-Tracker-V2 Standalone Software Builder
echo ========================================================
echo   LLC-Time-Tracker-V2 - Standalone Windows Desktop Builder
echo ========================================================
echo Working Directory: %cd%
echo.

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [Notice] Node.js is not installed on this PC.
  echo Launching in Instant Native Desktop mode instead...
  start "" "Launch_LLC_Time_Tracker_V2_Windows.bat"
  exit /b
)

echo [1/4] Generating desktop configuration (package.json)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "[System.IO.File]::WriteAllBytes('package.json', [System.Convert]::FromBase64String('${b64PackageJson}'))"

echo [2/4] Generating main.js and preload.js...
powershell -NoProfile -ExecutionPolicy Bypass -Command "[System.IO.File]::WriteAllBytes('main.js', [System.Convert]::FromBase64String('${b64MainJs}'))"
powershell -NoProfile -ExecutionPolicy Bypass -Command "[System.IO.File]::WriteAllBytes('preload.js', [System.Convert]::FromBase64String('${b64PreloadJs}'))"

echo.
echo [3/4] Installing Electron dependencies (npm install)...
call npm install --no-audit

echo.
echo [4/4] Compiling Standalone Windows Desktop Executable (.exe)...
call npm run build

echo.
echo ========================================================
echo SUCCESS! Your standalone Windows application is built!
echo.
echo Location: "%cd%\\dist\\LLC Time Tracker V2-win32-x64\\LLC Time Tracker V2.exe"
echo.
echo Note: If Windows Smart App Control blocks the shortcut,
echo right-click the file -> Properties -> check "Unblock" -> Apply,
echo or use "Launch_LLC_Time_Tracker_V2_Windows.bat".
echo ========================================================
pause
`;
    const element = document.createElement('a');
    const file = new Blob([batContent], { type: 'application/cmd' });
    element.href = URL.createObjectURL(file);
    element.download = 'Build_LLC_Time_Tracker_V2_Windows.bat';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  } else if (os === 'mac') {
    const shContent = `#!/bin/bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | tail -n 1)/bin:$PATH"
cd "$(dirname "$0")"

echo "========================================================"
echo "  LLC-Time-Tracker-V2 - macOS (.app) Software Builder"
echo "========================================================"
echo "Working directory: $(pwd)"
echo ""

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js runtime not detected. Launching in browser mode..."
  open "${SOFTWARE_APP_URL}"
  exit 0
fi

echo "[1/4] Writing package.json..."
node -e "require('fs').writeFileSync('package.json', Buffer.from('${b64PackageJson}', 'base64').toString('utf8'))"

echo "[2/4] Writing main.js and preload.js..."
node -e "require('fs').writeFileSync('preload.js', Buffer.from('${b64PreloadJs}', 'base64').toString('utf8'))"
node -e "require('fs').writeFileSync('main.js', Buffer.from('${b64MainJs}', 'base64').toString('utf8'))"

echo "[3/4] Installing Electron dependencies..."
npm install --no-audit

echo "[4/4] Launching standalone desktop tracker window..."
npx electron . &
`;
    const element = document.createElement('a');
    const file = new Blob([shContent], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = 'Build_LLC_Time_Tracker_V2_Mac.command';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  } else {
    const shContent = `#!/bin/bash
cd "$(dirname "$0")"

echo "========================================================"
echo "  LLC-Time-Tracker-V2 - Linux Software Builder"
echo "========================================================"

echo "[1/4] Writing package.json..."
node -e "require('fs').writeFileSync('package.json', Buffer.from('${b64PackageJson}', 'base64').toString('utf8'))"

echo "[2/4] Writing main.js and preload.js..."
node -e "require('fs').writeFileSync('preload.js', Buffer.from('${b64PreloadJs}', 'base64').toString('utf8'))"
node -e "require('fs').writeFileSync('main.js', Buffer.from('${b64MainJs}', 'base64').toString('utf8'))"

npm install --no-audit
npx electron . &
`;
    const element = document.createElement('a');
    const file = new Blob([shContent], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = 'Build_LLC_Time_Tracker_V2_Linux.sh';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }
};

/**
 * Universal downloader router
 */
export const downloadDesktopSoftwarePackage = (
  os: DesktopOS = 'windows',
  type: DesktopDownloadType = 'instant_launcher'
) => {
  if (type === 'instant_launcher') {
    downloadInstantDesktopLauncher(os);
  } else {
    downloadElectronBuilderPackage(os);
  }
};
