# Knightly mobile

Expo SDK 57 / React Native 0.86. The native component layer reuses Knightly's
palette, fonts and SVG pieces. The web app and Python backend remain available.

See the [migration audit and next steps](../docs/migration-progress.md) for current
screen coverage, remaining gaps and the ordered implementation checklist.

## Platform direction

This Expo app is the future shared iOS, Android and browser client, with React
Native Web for the browser. Development prioritizes iOS now. The existing `web/`
app stays available until the Expo app reaches browser feature parity and passes
desktop interaction checks. Shared domain logic, API contracts, tokens and routes
support consolidation; platform services and phone/desktop shells can differ.

## Navigation skeleton

The four bottom tabs are Home, Games, Play and Progress. The top-bar gear opens
Settings as a separate stack screen. Home launches
Practice; Practice, Puzzles and game review run outside the tabs. Settings opens
the Welcome → Link Account → Import Progress preview. Game review has separate
All Moves and Review Complete placeholders.

Without a hosted API URL, Home offers sample practice and Games offers a review
preview. Home uses an explicitly labeled design-preview unit and sample positions.
With a configured server, Home reads the existing `/api/home` learning-path contract;
sign-in and the existing real practice and
games list remain active. Placeholder actions do not import games or save reviews.

The branded shell uses Expo Router's headless tabs and React Native SVG icons.
It runs natively on iOS and through React Native Web in the browser. Wide browser
windows use a sidebar and a separate Today's goal column; phone windows use the
four-tab bar and goal counters. Browser consolidation is still in progress.

## Run on iPhone

Use Node.js 22 and pnpm 12. From a fresh clone, install the committed lockfile:

```sh
cd mobile
pnpm install --frozen-lockfile
pnpm exec expo login --browser
pnpm start --go --tunnel --port 8084
```

Install the latest compatible Expo Go (SDK 57) and sign in to the same Expo account
as the CLI. Open the terminal's `exp://` URL in Expo Go or scan its QR with Camera.
Tunnel mode works over cellular and other Wi-Fi networks; the Mac must remain
awake, online, and running Metro. Use `pnpm start --go` for a faster same-Wi-Fi
connection. Expo Go isn't an installed release of Knightly.

## Hosted account and real practice

Without `EXPO_PUBLIC_API_URL`, the app opens the two-position sample practice.
Sample answers never change real progress. To connect your account, put your
existing hosted app's HTTPS origin in `.env.local` (production is
`https://knightlychess.app`, from `infra/cloudflare/variables.tf`):

```dotenv
EXPO_PUBLIC_API_URL=https://knightlychess.app
```

Reload the Expo Go app after changing the environment. The app obtains the public
Clerk key from `/api/config` and signs in through Clerk's hosted Account Portal.
Sessions use Clerk's SecureStore token cache; every API call obtains a fresh token.
Never place a Clerk secret key or a personal access token in `EXPO_PUBLIC_*`.

Clerk's Native API must be enabled for the existing instance. Production builds
must register `app.knightly.preview` in Clerk's Native applications settings.
Check this configuration with the instance owner; the app does not change dashboard
settings. If the backend uses `KNIGHTLY_ALLOWED_ORIGINS`, set
`KNIGHTLY_ALLOW_NATIVE_AUTH=1` on the server to accept verified native tokens that
omit `azp`. Tokens with an origin still must match the website allowlist. Production
has this enabled and allows `app.knightly.preview://callback` in Clerk.
Installed iPhone sign-in and authenticated practice were confirmed October 9, 2026.
Local tests verify request contracts; another server or build needs its own live test.

Connected screens:

- Home: learning units, today's game, due positions, tactic puzzles and the bot
  path. Account, appearance and sign out are in Settings.
- Practice: server cards, answers, two-step hints, Show me, next review dates,
  ungraded end-of-session retries, and the daily summary. Only the server grades.
- Games: paginated imported-game list. Full game review and importing/analysing
  games remain on the web while those screens are migrated.

Failed requests show errors and retry controls. They do not silently switch to
sample data. A sign-in rejection requires signing in again (or correcting server
native-auth configuration). Keep the same Clerk instance to preserve identity
and avoid creating a separate mobile user's review history.

## Installed iPhone preview

`eas.json` has internal-device `preview`, unsigned `simulator`, and `production`
profiles. A physical iPhone preview requires an Apple Developer Program membership,
registered device and signing credentials. The Expo project is linked to
[@hunterhansen/knightly-preview](https://expo.dev/accounts/hunterhansen/projects/knightly-preview).
Apple sign-in succeeded and the individual membership is active. The preview
bundle identifier, distribution certificate and ad hoc provisioning profile are
provisioned, with the iPhone registered and included in the profile. The first
[preview build](https://expo.dev/accounts/hunterhansen/projects/knightly-preview/builds/cc95ade5-dca4-46c4-95ae-79ab2909412f)
finished successfully October 9, 2026 (version 0.1.0). Open that build page in
Safari on the registered iPhone and choose Install. Installation, account sign-in
and authenticated practice were confirmed on the registered iPhone.

1. Sign in with your own Expo account that has access to the linked project;
   `app.json` already contains its project ID. Ask the project owner for access
   before building; cloning the repo does not grant Expo or Apple team access.
2. The preview profile sets `EXPO_PUBLIC_API_URL=https://knightlychess.app`. A local
   ignored `.env.local` is not a substitute for configuring cloud builds.
3. Register the phone with `pnpm dlx eas-cli@latest device:create`, choose Website,
   and open the generated link in Safari on the iPhone. Install its registration
   profile in iOS Settings and return to Safari to finish. Confirm the phone is
   listed with `pnpm dlx eas-cli@latest device:list --apple-team-id GSMAB6KXN9`.
4. Run `pnpm dlx eas-cli@latest build --platform ios --profile preview` and complete
   Apple signing setup. Install from the build's link on the registered phone.

The existing ad hoc preview installs only on devices included in its provisioning
profile. Registering another phone requires a new preview build or re-signing with
an updated profile. The `production` profile is a starting point for store builds;
configure its server URL and store/signing setup before using it.

The preview includes its JS bundle, so it starts without Expo Go or Metro; real
practice still requires an internet connection to the hosted backend. Xcode is
not needed for EAS cloud builds. The first signed preview build completed on Expo.
The repository's `.easignore` limits cloud uploads to the mobile app and excludes
local environment files, dependencies and signing files. Inspect an archive with
`pnpm dlx eas-cli@latest build:inspect -p ios -s archive -e preview -o /tmp/knightly-archive`
before the first upload.

## Native board and usability checks

The board has a fixed square frame with eight equal rows and columns. Pieces are
an independent overlay: a 200ms slide uses the web motion easing, captures fade,
selection grows slightly, hints glow, and correct/wrong answers flash. A wrong
sample move slides out and returns before another answer is accepted. Checkmate
adds the king topple and result badges. Piece identity tracking supports castling,
en passant and promotion; unrelated positions reset without flying pieces.
Reanimated uses the system reduced-motion setting. Flipping/resizing snaps pieces
to their new coordinates. The second real-practice hint draws the move arrow.

Try on your phone:

1. Select e1, then e2 in sample practice: observe the slide, red flash, and return.
2. Tap Hint, Flip board, then play e1–e8: observe the rook slide and king topple.
3. Finish both positions and restart. Toggle dark appearance and open/close `?`.
4. Increase system text size: scroll to reach actions and scroll inside the help
   dialog. Buttons have a 48pt minimum height; help has a 44pt target.
5. Enable Reduce Motion and reload: avoid travel/topple motion, while outcomes stay
   legible. Enable VoiceOver: squares announce position, piece and legal targets;
   answers announce feedback. Verify dialog focus/escape on the physical device.
6. With the hosted server configured, sign in using the existing web account,
   check games/deck counts, answer a card, and verify the result on the web. Try
   network interruption, sign-out/reopen and the retry flow.

Native animation feel, VoiceOver behavior and text scaling need physical-device
validation. The first sample-screen launch was confirmed on iPhone October 9, 2026. Drag gestures, sounds, a promotion picker, rich game review, importing,
puzzles and the remaining settings screens are still migration work.

## Verification

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm tokens:check
pnpm exec expo export --platform ios --platform web
pnpm peers check
pnpm dlx expo-doctor
```

Tests cover chess fixtures, piece identity through moves/returns/captures/castles/
en passant/promotion, authenticated grading payloads, signed-out requests and
cancellation. An iOS export checks Hermes bundling, not installation or signing.
Browser verification checks layout and interactions, not native performance.

For a browser preview:

```sh
pnpm export:web
python3 -m http.server 8082 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:8082. Hosted-server browser previews also require appropriate
server CORS configuration; native HTTP requests don't use browser CORS.

The palette is generated from `web/src/styles/tokens.css`: `pnpm tokens:sync`
updates it, `pnpm tokens:check` detects drift. Reanimated/worklets are pinned to
SDK-compatible versions. ESLint 9 matches Expo's lint plugin. The pnpm build
allowlist permits the lint resolver's native binding and skips two dependencies'
optional postinstall messages.
