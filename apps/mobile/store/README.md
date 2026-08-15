# App Store assets

`store.config.js` (one level up) drives text metadata through `eas metadata:push`.
EAS Metadata cannot manage screenshots or privacy labels — those are uploaded by
hand in App Store Connect.

- `screenshots/*.png` — what is live on the listing, 1320×2868 (6.9"), the only
  iPhone size Apple requires. App Store Connect scales every smaller size from
  these ("Using 6.9" Display").
- `screenshot-template.html` — the composite layout: warm background, headline
  pair, device frame with the capture bleeding off the bottom edge. Substitute
  `__LINE1__`, `__LINE2__` and `__SHOT__` (a `file://` path to a capture), then
  screenshot the page at exactly 1320×2868:

  ```bash
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=1320,2868 --screenshot=out.png file://$PWD/page.html
  ```

  Headlines mirror the five feature claims in `store.config.js`; keep them in
  sync so the listing reads as one piece.

## Regenerating

1. **Capture the app.** Screens must come from a 6.9" device so captures are
   1320×2868 with no scaling — create one with
   `xcrun simctl create AppStore-Shots "com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max" <runtime>`.
   Stage the status bar first:
   `xcrun simctl status_bar <udid> override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3`,
   then `xcrun simctl io <udid> screenshot captures/<id>.png`.
2. **Install the app on that simulator** from an EAS simulator build, not
   `expo run:ios`. On a Mac that has ever paired an iPhone, `expo run:ios`
   resolves the simulator and then runs the *physical device* signing check
   anyway, failing with "No code signing certificates are available" — passing
   `--device` with a simulator UDID does not help. A build profile with
   `ios.simulator: true`, `withoutCredentials: true` and
   `environment: production` sidesteps it and produces a release build with the
   production API baked in, which is what should be photographed.
3. **Give the app something to show.** The list is empty without an online host,
   so register throwaway repos as projects on a host, create workspaces with
   human-readable names (`superset ws update <id> --name "Fix input overflow
   handling"` — note `ws update` rejects `--local`, unlike `ws create`), and run
   agents on a few for real diff stats. Agents launched this way stop at Claude
   Code's "trust this folder?" prompt; release them with
   `superset terminals send --workspace <id> --terminal <id> --text 1`, otherwise
   they never edit anything.
4. **Composite each capture** with `screenshot-template.html` and the Chrome
   command above, writing into `screenshots/`.

## Uploading

In App Store Connect, open the version's Media Manager and **expand the 6.9"
section first** — collapsed, its file input does not exist and files land in the
6.5" slot, which rejects the dimensions. Upload **one file at a time**: a single
multi-file selection lands in a scrambled order, and order matters because the
first three appear on the app installation sheet.
