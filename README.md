# Custom notifications

An iPhone PWA that sends a push with text you choose at send time, under a name
and logo of your own. Straight away or after a delay, from seconds to days.

Alongside it there is a **native iOS app** with the same job but without the
"from Stripe" line, and a **dashboard** that recreates Stripe's own — on the
phone and at `/dashboard` in the browser, on the same data. See [iOS app](#ios-app).

## How it works

A **preset** is a name plus a logo. It becomes an icon on the iOS home screen.
The **text** is free at every send.

They are separate for a technical reason: Safari ignores the `icon` and `image`
fields of the payload and always shows the name and icon of the installed PWA.
N different logos → N installed icons.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill it in:
   - `npx web-push generate-vapid-keys` for the VAPID keys
   - `openssl rand -hex 32` for `APP_TOKEN`
   - Redis and QStash credentials from console.upstash.com
3. `npm run dev`

## Deploying to Vercel

In production: **https://notifiche-custom.vercel.app**

The order of the steps is forced:

1. `npx vercel link` and `npx vercel --prod` → first deploy, to get the URL
2. Upload the variables: `printf '%s' "$VALUE" | npx vercel env add NAME production`
3. `PUBLIC_BASE_URL` = the stable URL from step 1, **with no trailing slash**
4. `npx vercel --prod` again, because at step 1 that variable did not exist yet

Without the second deploy, delays over 30 seconds never fire: QStash would not
know which URL to call back.

### Vercel Authentication has to be turned off

A new project starts with SSO protection on every `.vercel.app` URL. With it on,
the home page redirects to Vercel's login and `/api/deliver/` answers `401`
before even reaching the app: the iPhone cannot install the PWA and QStash cannot
deliver anything.

```bash
npx vercel project protection disable notifiche-custom --sso
```

The app stays protected by `APP_TOKEN` on every API route regardless.

## Usage

1. At `/`, enter the token and create a preset with a name and a logo.
2. Open `/p/<slug>/` **on the iPhone, in Safari** → Share → Add to Home Screen.
3. Open the icon, tap *Enable notifications*, grant permission.
4. Write the title and the text, pick the delay, send.

## iOS app

The `ios-app/` folder holds a native app that does two things: it schedules the
same notifications without going through the server, and it shows a dashboard
that recreates the home screen of the Stripe app.

Native notifications are **local**: iOS schedules them, they do not come over the
internet. That is the reason the app exists — the PWA's web push adds a "from
Stripe" line under the title on its own, and there is no way to remove it.

The dashboard has no loose fields to fill in. You set **how much comes in per day
and at which prices**, and from there it computes daily revenue, both period
totals, the charts, payments, customers and net. Two figures that contradict each
other are not representable.

Colours, sizes and spacing are not eyeballed: they are sampled from screenshots
of the original app in `screenshot-dashboard/` and converted from Display P3 to
sRGB.

### Syncing with the browser

The settings live in Redis, as **a single row** read by both the app and the
`/dashboard` page. There is nothing to reconcile because there are no two copies:
last write wins.

Set it up once from `Edit → Sync`, entering the server address and the
`APP_TOKEN`. Without it the app still works: everything stays on the phone.

⚠️ **Two people with the same token share the same simulation.** If a second
device configures the sync, changing values on one side changes them on the
other. To use it independently with more than one person, leave the sync empty,
or split the data per user on the server (not implemented today).

`src/lib/simulation.ts` and `ios-app/Stripe/Simulation.swift` are not two
equivalent implementations: they have to produce the **identical** figures,
because they read the same settings. That is why the generator is SplitMix64 and
not `Math.random`, and why the order of operations matches line by line. **Touch
the algorithm on one side and it has to be touched on the other.** The seed stays
below 2^53, otherwise JSON rounds it and the two sides drift apart.

### Installing it on another iPhone

It does not go through the App Store: you build it and install it over the cable.
You need a Mac with Xcode, an Apple ID and the cable.

1. Download the repository and open `ios-app/Stripe.xcodeproj`
2. Plug the iPhone in and pick it as the destination, at the top
3. Under **Signing & Capabilities** pick your own **Team**: the one saved in the
   project belongs to another account and will not work
4. Change the **Bundle Identifier**, for example from `com.edoardo.stripe-notifier`
   to `com.yourname.stripe-notifier`: the current one is already registered
   elsewhere and signing fails
5. Press Play

On first launch iOS asks you to trust the developer: *Settings → General → VPN &
Device Management → Trust*.

**With a free Apple ID the profile expires after 7 days**: the icon stays but the
app no longer opens, and the phone has to be plugged back in and Play pressed
again. With a paid Apple Developer account it lasts a year.

From the terminal, without opening Xcode, it is two commands — replacing the
device identifier, which `xcrun devicectl list devices` prints:

```bash
cd ios-app && xcodebuild -project Stripe.xcodeproj -scheme Stripe -configuration Debug \
  -destination 'id=IDENTIFIER' -derivedDataPath ./dd -allowProvisioningUpdates build
```

```bash
xcrun devicectl device install app --device IDENTIFIER ./dd/Build/Products/Debug-iphoneos/Stripe.app
```

## Known limits

- Needs iOS 16.4+ and installation on the home screen: web push does not work in Safari.
- Name and logo are fixed at install time, they do not change per notification.
- With the app in the foreground iOS does not show the banner: use a delay and
  lock the screen, or fire the send from another device.
- Maximum delay 7 days, a QStash limit.

## Architecture in brief

| Piece | Where |
|---|---|
| Presets, icons, subscriptions, scheduled sends | Upstash Redis |
| Delays ≤ 30s | Next's `after()`: immediate response, delivery later |
| Delays > 30s | QStash, which calls back `/api/deliver/` |
| Service worker | `public/sw.js`, registered with scope `/p/<slug>/` |

Details and reasoning in `docs/superpowers/specs/`.

## Checking the credentials

Checks that Redis, QStash and the VAPID keys really answer. It never prints a
value, only the outcome:

```bash
npm run check
```

## Smoke test against production

Checks the full round trip on a deployed instance — presets, manifest, icons,
authentication and the QStash round trip — with no iPhone needed. It registers a
fake subscription, schedules a send an hour out and cancels it, then cleans up:

```bash
npm run smoke -- https://notifiche-custom.vercel.app
```

It is the quickest way to notice that `PUBLIC_BASE_URL` is wrong.

## Tests

```bash
npm test
```

The E2E tests need `.env.local` filled in (they skip themselves without
`APP_TOKEN`):

```bash
npx playwright install chromium
npm run test:e2e
```

The push flow on iOS cannot be automated: verification is manual, see
`docs/checklist-iphone.md`.
