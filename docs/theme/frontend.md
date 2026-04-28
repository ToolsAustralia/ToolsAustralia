# Theme — Frontend

## Components

[src/components/theme/](../../src/components/theme/) — theme switcher UI components.

## Hooks

See [architecture.md](./architecture.md#hooks).

## Bootstrap

`themeBootstrap.ts` runs in the root layout pre-React to set the initial theme class on `<html>`. Prevents flash of wrong theme.
