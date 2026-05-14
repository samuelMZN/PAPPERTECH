const fs = require("fs");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");

const FRONTEND_DIR = path.resolve(__dirname, "..");
const BACKEND_DIR = path.resolve(__dirname, "..", "..", "backend");
const BACKEND_ENTRY = path.join(BACKEND_DIR, "server.js");
const BACKEND_PORT = 4000;
const BACKEND_HOST = "127.0.0.1";
const START_TIMEOUT_MS = 12000;
const POLL_INTERVAL_MS = 500;

function isPortOpen(host, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    const finish = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

async function waitForBackend() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < START_TIMEOUT_MS) {
    if (await isPortOpen(BACKEND_HOST, BACKEND_PORT)) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  return false;
}

function startBackendDetached() {
  const stdoutPath = path.join(BACKEND_DIR, "backend.runtime.log");
  const stderrPath = path.join(BACKEND_DIR, "backend.runtime.error.log");
  const stdout = fs.openSync(stdoutPath, "a");
  const stderr = fs.openSync(stderrPath, "a");

  const child = spawn(process.execPath, [BACKEND_ENTRY], {
    cwd: BACKEND_DIR,
    detached: true,
    stdio: ["ignore", stdout, stderr],
    windowsHide: true,
    env: process.env
  });

  child.unref();

  return {
    pid: child.pid,
    stdoutPath,
    stderrPath
  };
}

function startFrontend() {
  const reactScriptsBin = path.join(
    FRONTEND_DIR,
    "node_modules",
    "react-scripts",
    "bin",
    "react-scripts.js"
  );

  const child = spawn(process.execPath, [reactScriptsBin, "start"], {
    cwd: FRONTEND_DIR,
    stdio: "inherit",
    env: process.env
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

async function main() {
  const alreadyRunning = await isPortOpen(BACKEND_HOST, BACKEND_PORT);

  if (alreadyRunning) {
    console.log("PapperTech: backend ya estaba encendido en http://localhost:4000");
  } else {
    console.log("PapperTech: iniciando backend automaticamente...");
    const runtime = startBackendDetached();
    const isReady = await waitForBackend();

    if (isReady) {
      console.log(`PapperTech: backend listo en http://localhost:4000 (pid ${runtime.pid})`);
    } else {
      console.warn("PapperTech: el backend no alcanzo a responder a tiempo.");
      console.warn(`Revisa los logs: ${runtime.stdoutPath}`);
      console.warn(`Errores backend: ${runtime.stderrPath}`);
    }
  }

  if (process.env.PAPPERTECH_SKIP_REACT === "1") {
    return;
  }

  startFrontend();
}

main().catch((error) => {
  console.error("PapperTech: no se pudo iniciar el frontend con backend automatico.");
  console.error(error);
  process.exit(1);
});
