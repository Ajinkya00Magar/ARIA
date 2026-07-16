const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const isDev = !app.isPackaged;

const fs = require('fs');
const logFile = path.join(app.getPath('userData'), 'debug.log');
function logToFile(msg) {
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
}

process.on('uncaughtException', err => {
  logToFile(`UNCAUGHT EXCEPTION: ${err.stack}`);
  dialog.showErrorBox('ARIA IDE — Fatal Error', `An unexpected error occurred:\n\n${err.message}\n\nPlease check the logs at ${logFile}`);
  app.quit();
});
process.on('unhandledRejection', err => logToFile(`UNHANDLED REJECTION: ${err.stack}`));

const serve = require('electron-serve');
const loadURL = serve({ directory: 'bundle/web/out' });

let mainWindow;

function createWindow() {
  logToFile('Creating window...');
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: "ARIA IDE"
  });

  if (isDev) {
    logToFile('Loading dev URL');
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    logToFile('Loading prod URL via electron-serve');
    loadURL(mainWindow).catch(err => logToFile(`loadURL error: ${err.stack}`));
  }

  mainWindow.on('closed', function () {
    logToFile('Window closed');
    mainWindow = null;
  });
  
  mainWindow.webContents.on('did-finish-load', () => {
    logToFile('Window did-finish-load');
  });
  
  mainWindow.webContents.on('did-fail-load', (e, code, desc) => {
    logToFile(`Window did-fail-load: ${code} ${desc}`);
  });
}

function startApi() {
  if (isDev) {
    logToFile('Running in dev mode. API handled externally.');
    return;
  }
  try {
    logToFile('Starting Express API in main process...');
    
    // Load bundled .env file
    const envPath = path.join(__dirname, 'bundle', '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      envContent.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match && !line.startsWith('#')) {
          process.env[match[1].trim()] = match[2].trim();
        }
      });
      logToFile('Bundled .env loaded successfully');
    }
    process.env.NODE_ENV = 'production';
    process.env.PORT = '3001';
    process.env.ELECTRON_USER_DATA = app.getPath('userData');
    process.env.ALLOWED_ORIGINS = 'http://localhost:3000,app://-';
    
    // Override stdout/stderr to also go to our log file so we can capture API logs
    const oldStdout = process.stdout.write;
    const oldStderr = process.stderr.write;
    process.stdout.write = function (string, encoding, fd) {
      logToFile(`STDOUT: ${string.trim()}`);
      return oldStdout.apply(process.stdout, arguments);
    };
    process.stderr.write = function (string, encoding, fd) {
      logToFile(`STDERR: ${string.trim()}`);
      return oldStderr.apply(process.stderr, arguments);
    };
    
    require('./bundle/api/dist/index.js');
    logToFile('Express API required successfully');
  } catch (err) {
    logToFile(`Failed to start API: ${err.stack}`);
    dialog.showErrorBox(
      'ARIA IDE — Startup Error',
      `The API server failed to start:\n\n${err.message}\n\nPlease reinstall the application.`
    );
    app.quit();
  }
}

app.disableHardwareAcceleration();

app.on('ready', () => { 
  logToFile('App ready event fired');
  startApi(); 
  createWindow(); 
});
app.on('window-all-closed', function () {
  logToFile('All windows closed');
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', function () {
  if (mainWindow === null) createWindow();
});
