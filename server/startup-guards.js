export function installFatalProcessGuards({
  processRef = process,
  logger = console,
  exit = (code) => process.exit(code)
} = {}) {
  const fatal = (label) => (error) => {
    logger.error(`[server] ${label}: ${error?.stack || error?.message || String(error)}`);
    exit(1);
  };
  processRef.on('uncaughtException', fatal('uncaughtException'));
  processRef.on('unhandledRejection', fatal('unhandledRejection'));
}

export function handleHttpListenError(error, {
  host,
  port,
  logger = console,
  exit = (code) => process.exit(code)
} = {}) {
  logger.error(`[server] HTTP listener failed on ${host}:${port}: ${error?.message || String(error)}`);
  exit(1);
}
