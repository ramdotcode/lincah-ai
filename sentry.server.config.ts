import * as Sentry from '@sentry/nextjs';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    integrations: [
      Sentry.httpIntegration(),
      Sentry.captureConsoleIntegration({ levels: ['error', 'warn'] }),
    ],
    tracesSampleRate: 0.1,
  });
}
