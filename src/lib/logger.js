const isProd = import.meta.env.PROD;

function report(level, errorOrMsg, context = {}) {
  if (!isProd) {
    console[level]('[app]', errorOrMsg, Object.keys(context).length ? context : '');
    return;
  }
  // Production: structured log to console (replace with Sentry in one line):
  //   Sentry.captureException(errorOrMsg, { extra: context });
  const message = errorOrMsg instanceof Error ? errorOrMsg.message : String(errorOrMsg);
  console.error('[app]', message, context);
}

export const logger = {
  error: (errorOrMsg, context) => report('error', errorOrMsg, context),
  warn:  (errorOrMsg, context) => report('warn',  errorOrMsg, context),
  info:  (msg, context)        => { if (!isProd) console.info('[app]', msg, context ?? ''); },
};
