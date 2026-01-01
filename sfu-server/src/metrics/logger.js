const LEVELS = ['debug', 'info', 'warn', 'error'];

function getLevel() {
  const level = (process.env.LOG_LEVEL || 'info').toLowerCase();
  return LEVELS.includes(level) ? level : 'info';
}

function shouldLog(level) {
  const current = LEVELS.indexOf(getLevel());
  const target = LEVELS.indexOf(level);
  return target >= current;
}

function format(message, data) {
  if (data === undefined) return message;
  return `${message} ${JSON.stringify(data)}`;
}

function debug(message, data) {
  if (shouldLog('debug')) {
    console.debug(format(message, data));
  }
}

function info(message, data) {
  if (shouldLog('info')) {
    console.info(format(message, data));
  }
}

function warn(message, data) {
  if (shouldLog('warn')) {
    console.warn(format(message, data));
  }
}

function error(message, data) {
  if (shouldLog('error')) {
    console.error(format(message, data));
  }
}

module.exports = {
  debug,
  info,
  warn,
  error
};
