# LAN Drop

A tiny, end-to-end encrypted dropbox for people on the same network. Paste or drag
something in on one machine, grab it on another. Everything expires on its own.

- **Nothing to install on the other devices.** One machine runs the server; everyone
  else just opens a URL in a browser (Mac, Windows, Linux, phone).
- **End-to-end encrypted.** Text and files are encrypted in the browser with AES-256-GCM
  using a key derived from a shared passphrase. The server stores only ciphertext and
  never sees the passphrase, file names, or contents.
- **Temporary.** Items are deleted automatically after 24 hours (configurable), or
  immediately with the ✕ button.
- **Locked down.** HTTPS, LAN-only address filtering, a 10-minute lockout after 10
  bad passphrase attempts, size limits, and a strict Content-Security-Policy.
- **Zero dependencies.** Plain Node.js. No npm install needed.

## Setup (once, on the machine that will host the drop)

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

## Run

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

## Notes

- Files are encrypted in memory in the browser, so very large files (multiple GB) are not
  practical. The default cap is 512 MB.
- Keep the host machine awake. On a Mac, `caffeinate -i npm start` prevents idle sleep
  while the server runs.
- Set `DROP_ALLOW_PUBLIC=1` only if you deliberately want to expose it beyond private IP
  ranges (e.g. behind a VPN with unusual addressing).
