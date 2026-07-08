import type { NextConfig } from "next";
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  org: 'sentry-project',
  project: 'sentry-project',
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
});
