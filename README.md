# Stompi-Speel

## Screenshot workflow

1. Install the tooling once:
   `npm.cmd install`
2. Capture the default desktop view:
   `npm.cmd run screenshot:desktop`
3. Capture a mobile view:
   `npm.cmd run screenshot:mobile`

The script serves the project locally, opens the page in a headless browser, waits for fonts to settle, and writes screenshots to `screenshots/`.

Extra options:
- `npm.cmd run screenshot -- --out screenshots/footer.png --selector .journey-sea`
- `npm.cmd run screenshot -- --width 1600 --height 1200 --full-page`
