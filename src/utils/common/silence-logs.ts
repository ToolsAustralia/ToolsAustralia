// Temporary console silencer
// Guard all console outputs behind an environment flag to avoid terminal flooding during debugging.
// Set SILENCE_LOGS=true to mute console.log/info/warn/debug at runtime.

/* eslint-disable no-console */
declare const process: { env: Record<string, string | undefined> };

if (typeof process !== "undefined" && process.env && process.env.SILENCE_LOGS === "true") {
  const noop = () => {};
  try {
    console.log = noop as typeof console.log;
    console.info = noop as typeof console.info;
    console.warn = noop as typeof console.warn;
    console.debug = noop as typeof console.debug;
  } catch {
    // Ignore if console methods are read-only in some environments
  }
}

export {};



