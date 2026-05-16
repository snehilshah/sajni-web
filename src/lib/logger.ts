import pino from 'pino';

// Browser SPA: logs go to console only.
// Production suppresses debug/info to keep DevTools clean.
const logger = pino({
  level: import.meta.env.PROD ? 'warn' : 'debug',
  browser: {
    asObject: false,
  },
});

export default logger;
