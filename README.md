# Chute

Toss files and text to people on the same network. Drop something in on one machine,
it pops out on everyone else's. End-to-end encrypted, gone in a day.

## Download

- **Mac** (Intel and Apple Silicon, signed and notarized):
  [Chute-1.0.4-mac-universal.dmg](https://github.com/izhansari/chute/releases/download/v1.0.4/Chute-1.0.4-mac-universal.dmg)
- **Windows**: [Chute-1.0.4-win-x64.exe](https://github.com/izhansari/chute/releases/download/v1.0.4/Chute-1.0.4-win-x64.exe)
  (unsigned: SmartScreen shows "More info → Run anyway" once)

All releases: https://github.com/izhansari/chute/releases

- **Nothing to install on the other devices.** One machine runs the server; everyone
  else just opens a URL in a browser (Mac, Windows, Linux, phone).
- **End-to-end encrypted.** Text and files are encrypted in the browser with AES-256-GCM
  using a key derived from a shared passphrase. The server stores only ciphertext and
  never sees the passphrase, file names, or contents.
- **Temporary.** Items are deleted automatically after 24 hours (configurable), or
  immediately with the ✕ button.
- **Locked down.** HTTPS, LAN-only address filtering, a 10-minute lockout after 10
  bad passphrase attempts, size limits, and a strict Content-Security-Policy.
- **Zero dependencies** for the server. Plain Node.js; `npm install` is only needed to
  build the desktop app.

## Two ways to run it

1. **Desktop app** (recommended): a menu bar app on Mac and a system tray app on Windows.
   One person picks "Host", everyone else picks their computer from a list. Native
   notifications and an unread badge, drop files on the menu bar icon, send the clipboard
   from the tray menu, launch at login. No certificate warnings.
2. **Plain server + browser**: run `npm start` on one machine, everyone else opens a URL.
   Zero dependencies, works from any device with a browser, including phones.

Both use the same web UI and the same encryption; you can mix them freely.

## Desktop app

Build installers (needs Node 18+; produces one universal `.dmg` for Intel and Apple
Silicon Macs and an installer `.exe` for Windows, in `dist/`):

```bash
npm install
npm run dist
```

Or run it straight from source while developing:

```bash
npm run desktop
```

First launch walks you through it one step at a time: welcome, host or join, the details
for that choice (passphrase and, for hosts, a couple of options), then a "you're in" page.
The passphrase you enter there also unlocks the chute window, so you type it once.

Later, the gear button in the window (or "Settings…" in the tray menu) opens the same
screen:

- **Host the chute on this computer**: choose the shared passphrase. The chute runs in the
  background whenever this computer is on and announces itself on the network.
- **Connect to a teammate's chute**: hosts on the network appear in a list; click **Use**.
  You can also type an address such as `https://their-mac.local:8443`.

Then click the menu bar / tray icon: a popover opens under it and closes when you click
away. Pin it (the pin button, or "Keep window open" in the tray menu) while you drag
things in from Finder or Explorer. Everything else is the same web UI described below, plus:

- **Notifications** when someone else adds something, and an unread count next to the
  menu bar icon (a red dot on Windows) until you open the chute. New items are marked.
- **Real previews as icons.** Images, PDFs and most documents show a thumbnail of the
  actual file instead of a generic icon. The sender makes the thumbnail (with the OS
  thumbnailer in the desktop app) and it travels encrypted with the item, so receivers
  can tell what a file is without downloading it.
- **Quick Look** (Mac): the eye button or the thumbnail opens the decrypted file in Quick
  Look. On Windows it opens in the default app.
- **Drag items out.** Drag a file from the chute straight to your Desktop, a Finder window,
  or another app. Text items drag out as text. Files are decrypted the moment you press on
  them, so the drag has a real file behind it.
- **Click a text item to copy it.** The chevron expands long text; the whole card copies.
- **Drop files onto the menu bar icon** (Mac). Dragging over the icon pops the window open
  with a big drop target, so you can drop on the icon or in the window.
- **Save files to** a folder of your choice (Settings → Behaviour).
- **Host offline** shows in red the moment the host goes away, and recovers on its own. If
  the host sets up a new chute, you're asked for the new passphrase.
- **Send clipboard** from the tray menu: text or a screenshot you just copied.
- **Downloads** land in your Downloads folder with a notification; click it to reveal.
- **Launch at login** from the tray menu, so it is always there.
- The host's self-signed certificate is remembered on first connection (trust on first
  use). If it ever changes, you are asked before continuing.

### Locking, leaving, and closing a chute

- **Close the window** by clicking the menu bar icon again, pressing Esc, or clicking
  anywhere else. Nothing happens to the chute; it's just out of the way.
- **Quit Chute** closes the app. If you are the host, the chute is offline until you open
  Chute again; the items are still there when it comes back (until they expire).
- **Pause hosting** (click the green "Hosting" pill or the power button in the window, or
  use the tray menu or Settings) takes the chute off the network. One dialog asks whether to keep the items or delete everything.
  The chute is paused, not gone: **Start hosting again** brings it back with the same
  passphrase and, if you kept them, the same items.
- **Empty the chute** (host, tray menu or Settings) deletes everything in it right now for
  everyone, and keeps hosting.
- **Delete this chute** (host, Settings) stops hosting, deletes everything, and forgets the
  passphrase, back to a fresh start.
- **Leave this chute** (joiner, tray menu or Settings) forgets the address and passphrase
  on this device. Nothing is deleted for anyone else.
- **Can't connect?** Settings → Connection → **Test** tells you exactly why: not reachable
  (different network), nothing listening (host paused), certificate changed (host made a new
  chute), or refused. On a Mac, if the test times out even though you're on the same Wi-Fi,
  check System Settings → Privacy & Security → **Local Network** and allow Chute.
- Settings shows the connection: who's hosting and their address, online/offline, the
  host's expiry and size limits, and for hosts, how many devices are connected.
- Settings can **show the passphrase** (eye button) and **change it**. Changing it clears
  the chute, since items are encrypted with the old one. The passphrase is kept on the
  device encrypted with the OS keychain so it can be shown later.
- Hosts set a **maximum chute size** (1 GB to 20 GB, or no limit; default 10 GB). Uploads
  that would exceed it are refused with "the chute is full", and the window shows
  "used of total" next to the item count.

### "Apple could not verify Chute is free of malware"

`npm run dist` makes **unsigned** installers. On another person's Mac, Gatekeeper blocks
the first open with that message (and on recent macOS the old right-click → Open trick
no longer works). The DMG includes a text file with these steps:

1. Click **Done**, not Move to Trash.
2. System Settings → **Privacy & Security** → scroll to the bottom.
3. Next to *"Chute" was blocked to protect your Mac*, click **Open Anyway**, then **Open**.

Once per machine. Terminal alternative: `xattr -dr com.apple.quarantine /Applications/Chute.app`.
Windows SmartScreen: "More info → Run anyway".

### Signing and notarizing (removes the warning for everyone)

You need the paid Apple Developer Program and a **Developer ID Application** certificate
installed in your keychain (Xcode → Settings → Accounts → Manage Certificates → + →
Developer ID Application). Then:

Store notarization credentials in your keychain once. The team ID is the one in
parentheses on the *Developer ID Application* line of `security find-identity -v -p codesigning`
(not your personal development team). The password is an app-specific password from
account.apple.com → Sign-In and Security; it is prompted for, never put on the command line.

```bash
xcrun notarytool store-credentials chute --apple-id "you@example.com" --team-id XXXXXXXXXX
```

Then build:

```bash
APPLE_KEYCHAIN_PROFILE=chute npm run dist:signed
```

The build is already configured for the hardened runtime, entitlements, and notarization;
electron-builder signs with the Developer ID it finds and submits the app to Apple (a few
minutes), then staples the ticket. The resulting DMG opens on any Mac without warnings.
For Windows, a code-signing certificate can be supplied via `CSC_LINK` / `CSC_KEY_PASSWORD`.

To confirm a build will pass Gatekeeper on other Macs, mount the DMG and run:

```bash
spctl -a -vv -t exec "/Volumes/Chute/Chute.app"
```

It should print `accepted` and `source=Notarized Developer ID`.

## Plain server: setup (once, on the machine that will host the chute)

Requirements: Node.js 18+ and OpenSSL (already on macOS and Linux; on Windows
`winget install ShiningLight.OpenSSL`).

```bash
npm run setup
```

You'll be asked for a shared passphrase. Give it to your team out of band. It is never
stored and never sent to the server; only a hash of a separately derived login token is
kept. Setup also generates a self-signed TLS certificate.

Optional flags: `--ttl 12` (hours to keep items), `--max 2048` (max MB per item),
`--port 8443`. You can also pass `--pass "..."` for a non-interactive setup.

## Plain server: run

```bash
npm start
```

The server prints the addresses to open, e.g. `https://your-mac.local:8443` or
`https://192.168.1.20:8443`. On the host machine itself, `http://localhost:8444` works
with no certificate warning.

Other devices will see a one-time "certificate not trusted" warning because the
certificate is self-signed. Choose **Advanced → Proceed** (Chrome/Edge) or
**Show Details → visit this website** (Safari). To make the warning go away for good,
import `config/cert.pem` into the device's trust store.

## Using it

- Enter the passphrase once. Tick **Remember on this device** to skip it next time.
- **Drag files** onto the page, click **choose files**, or just **paste** (⌘V / Ctrl+V)
  anywhere: text, screenshots, or files copied from Finder/Explorer.
- Type in the text box and press **Send text** (or ⌘/Ctrl + Enter).
- On the other machine: **Copy** a text item to the clipboard, **Download** a file, or
  **Preview** an image inline. **✕** deletes an item right away.
- The list refreshes itself every few seconds.

## Changing the passphrase

Run `npm run setup` again and restart the server. Items uploaded under the old
passphrase can no longer be decrypted, so clear them out first or let them expire.

## How the security works

1. Browser derives a master key from the passphrase with PBKDF2-SHA256 (250k iterations,
   per-install salt), then two subkeys with HKDF: an *auth token* and an *encryption key*.
2. The auth token is sent as a bearer token. The server compares its SHA-256 hash against
   the hash saved at setup, in constant time. It cannot recover the encryption key from it.
3. Every item is encrypted client-side: `iv || AES-256-GCM(body)`. The metadata (file name,
   type, text preview) is encrypted the same way. The server only sees an opaque id, a byte
   count, and timestamps.
4. Decryption happens in the receiving browser. Tampered ciphertext fails GCM
   authentication and is refused.

What this protects against: someone sniffing the Wi-Fi, someone who finds the server's
data directory, and someone on the network who doesn't know the passphrase.

What it does not protect against: anyone who *has* the passphrase and network access, or
a compromised host machine (it serves the page, so it could serve malicious JavaScript).
That is the normal limit of any web-based end-to-end encryption.

## Project layout

- `lib/server.js`: the server as a module (used by both the CLI and the desktop app)
- `lib/setup.js`: key derivation, certificate generation, config writing
- `server.js`, `setup.js`: command-line entry points
- `public/`: the web UI, served by the host and loaded by the desktop app
- `desktop/`: Electron shell (popover, tray, badge, notifications, settings, discovery, cert pinning)

## Notes

- Files are encrypted in memory in the browser, so very large files (multiple GB) are not
  practical. The default cap is 512 MB.
- Keep the host machine awake. On a Mac, `caffeinate -i npm start` prevents idle sleep
  while the server runs.
- Set `DROP_ALLOW_PUBLIC=1` only if you deliberately want to expose it beyond private IP
  ranges (e.g. behind a VPN with unusual addressing).
