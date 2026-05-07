# openclaw-channel-deltachat

An [OpenClaw](https://openclaw.ai) channel plugin that bridges [Delta Chat](https://delta.chat) messaging to OpenClaw's AI agent pipeline.

Users interact with OpenClaw agents via end-to-end encrypted Delta Chat messages.

> **Fork notice:** This project is forked from [`jhayashi/dcbot`](https://github.com/jhayashi/dcbot.git) and adapted into a proper OpenClaw channel plugin with additional features like access control, custom chatmail relays, and ClawHub packaging.

## Why Delta Chat?

**End-to-end encryption by default** — Autocrypt + OpenPGP, no trust-the-server model.

**No phone number required** — Works with any email address.

**No app store dependency** — APK available directly, F-Droid, etc.

**Decentralized** — Uses existing email infrastructure, no single provider.

**Chatmail for speed** — Chatmail servers provide instant delivery like regular chat apps.

**Group support** — Topic-based groups for organizing conversations with the AI.

**Works alongside regular email** — Bot can also respond to plain email (with regular IMAP account).

**No vendor lock-in** — Messages are standard emails, exportable, auditable.

**Privacy** — No metadata harvesting, no ads, no tracking.

## Prerequisites

- [OpenClaw](https://openclaw.ai) gateway running
- [`deltachat-rpc-server`](https://github.com/chatmail/core/releases) on your `$PATH` (see below)

### Installing deltachat-rpc-server

The easiest way is via pip (ships a prebuilt binary):

```bash
pip install deltachat-rpc-server
```

Alternatively, download a prebuilt binary from the [Delta Chat core releases](https://github.com/chatmail/core/releases) and place it on your `$PATH`.

Verify the install:

```bash
deltachat-rpc-server --version
```

## Install

```bash
openclaw plugins install openclaw-channel-deltachat
```

Or from source:

```bash
git clone https://github.com/avedelphina/openclaw-channel-deltachat.git
cd deltaclaw
npm install && npm run build
openclaw plugins install -l .
```

## Quick Start (Zero Config)

Add a minimal entry to `~/.openclaw/openclaw.json`:

```json
{
  "channels": {
    "deltachat": {
      "email": "auto"
    }
  }
}
```

Restart the gateway:

```bash
openclaw gateway restart
```

On first start, the plugin automatically:
1. Creates a [chatmail](https://delta.chat/chatmail) account (no email credentials needed)
2. Generates a SecureJoin invite link and QR code
3. Reads the agent's display name from `IDENTITY.md` in the workspace
4. Sets the bot's avatar from `avatar.png`, `avatar.jpg`, or `logo.png` in the workspace (if present)

Open `http://127.0.0.1:18789/deltachat/invite` in your browser to see the QR code. Scan it with Delta Chat to establish an encrypted connection, then start chatting.

## Using a Custom Email Account

To use a regular email provider (Gmail, Fastmail, etc.) instead of chatmail:

```json
{
  "channels": {
    "deltachat": {
      "email": "bot@example.com",
      "password": "app-password"
    }
  }
}
```

With a regular email account, encryption is established automatically after the first message exchange (no QR scan needed). Any IMAP/SMTP provider works.

## Using a Custom Chatmail Relay

For private or self-hosted chatmail servers that require authentication or use a non-standard endpoint, use the `customChatmailRelay` configuration:

```json
{
  "channels": {
    "deltachat": {
      "customChatmailRelay": {
        "enabled": true,
        "url": "https://chatmail.example.com/new",
        "token": "your-api-token-here"
      }
    }
  }
}
```

This is useful for:
- **Private chatmail servers** that require an API token
- **Self-hosted chatmail instances** with custom domains
- **Enterprise deployments** with controlled account provisioning

The plugin will contact the relay's `/new` endpoint to create an account, then configure Delta Chat with the returned credentials.

## Access Control

Restrict who can interact with your bot using the `dmPolicy` and `allowFrom` options:

```json
{
  "channels": {
    "deltachat": {
      "email": "auto",
      "dmPolicy": "allowlist",
      "allowFrom": [
        "alice@example.com",
        "bob@example.com"
      ]
    }
  }
}
```

Available policies:
- `open` — Anyone can chat with the bot (default)
- `allowlist` — Only emails in `allowFrom` can chat
- `pairing` — Only verified contacts (via SecureJoin)
- `disabled` — DMs are disabled

You can also control group chat access with `groupPolicy` and `groupAllowFrom`:

```json
{
  "channels": {
    "deltachat": {
      "groupPolicy": "allowlist",
      "groupAllowFrom": ["alice@example.com"]
    }
  }
}
```

- `open` — Anyone can interact in groups (default)
- `allowlist` — Only emails in `groupAllowFrom` can trigger the bot in groups
- `disabled` — Bot ignores all group messages

Unauthorized users will receive a rejection message.

## Group Chat Settings

Configure how the bot behaves in group chats:

```json
{
  "channels": {
    "deltachat": {
      "email": "auto",
      "requireMention": false
    }
  }
}
```

- `requireMention: true` — The bot only responds when mentioned (@botname)
- `requireMention: false` — The bot responds to all messages (default)

## Configuration Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `email` | yes | — | Set to `"auto"` for chatmail, or a real email address |
| `password` | no | — | Email password (only needed with a real email address) |
| `chatmailServer` | no | `"nine.testrun.org"` | Chatmail server for auto-created accounts |
| `customChatmailRelay` | no | — | Custom chatmail relay config (see below) |
| `dataDir` | no | `~/.openclaw/deltachat-data` | Delta Chat data directory |
| `rpcServerPath` | no | `"deltachat-rpc-server"` | Path to rpc-server binary |
| `avatarPath` | no | — | Path to the bot's avatar image (PNG/JPEG). Falls back to workspace avatar files |
| `dmPolicy` | no | `"open"` | Direct message policy: `open`, `allowlist`, `pairing`, `disabled` |
| `allowFrom` | no | — | Array of allowed email addresses (for `allowlist` policy) |
| `groupPolicy` | no | `"open"` | Group chat policy: `open`, `allowlist`, `disabled` |
| `groupAllowFrom` | no | — | Array of allowed email addresses for group interactions |
| `sendReadReceipts` | no | `true` | Send read receipts (MDN) for allowed DMs |
| `configWrites` | no | `true` | Allow `/config` updates from this channel |
| `requireMention` | no | `false` | Require @mention in groups for the bot to respond |
| `enabled` | no | `true` | Enable/disable the channel |

### Custom Chatmail Relay Options

| Option | Required | Description |
|--------|----------|-------------|
| `enabled` | yes | Enable custom relay mode (must be `true`) |
| `url` | yes | Full URL to the chatmail account creation endpoint |
| `token` | no | Optional authentication token for the relay |

The bot's display name is read from `IDENTITY.md` in the OpenClaw workspace.

## Invite Page

The plugin serves a SecureJoin invite page at `/deltachat/invite` on the gateway:

- `/deltachat/invite` — HTML page with QR code and instructions
- `/deltachat/invite/qr.svg` — Raw QR code SVG
- `/deltachat/invite/link` — Plain text invite link

The invite page adapts based on your account type:
- **Chatmail accounts**: Shows QR code scanning instructions
- **Regular email accounts**: Shows email-based connection instructions with optional QR code

## Verified Groups

Because chatmail addresses are auto-generated and random, users typically can't add the bot to a group by email address. Instead, the bot can create **verified groups** and share a QR code:

```bash
# Create a verified group (returns JSON with groupId, inviteLink, qrSvg)
curl -X POST http://127.0.0.1:18789/deltachat/groups \
  -H "Content-Type: application/json" \
  -d '{"name":"My AI Group"}'
```

Group invite endpoints:
- `POST /deltachat/groups` — Create a new verified group
- `GET /deltachat/groups/:groupId/invite` — Get invite JSON
- `GET /deltachat/groups/:groupId/invite/qr.svg` — Raw QR code SVG
- `GET /deltachat/groups/:groupId/invite/link` — Plain text invite link

If someone adds the bot to an existing group, the bot enforces `groupPolicy` before joining. Unauthorized additions are automatically declined by leaving the group.

## How It Works

The plugin spawns `deltachat-rpc-server` as a child process and communicates via JSON-RPC over stdio. When a message arrives, it's dispatched to OpenClaw's agent pipeline via `channelRuntime.reply.dispatchReplyWithBufferedBlockDispatcher()`. Agent responses are sent back as Delta Chat messages.

Supports both 1:1 DMs and group chats. Each conversation gets its own OpenClaw session. All AI logic, conversation history, and access control are managed by OpenClaw.

### Graceful Shutdown

The plugin implements graceful shutdown:
- Waits for in-flight message dispatches to complete (up to 10 seconds)
- Stops I/O before closing the connection to prevent message loss

### Crash Recovery

If the `deltachat-rpc-server` process crashes:
- The plugin automatically respawns the server after 5 seconds
- After 3 crashes within 60 seconds, the plugin enters a disabled state
- All state (account, keys, verified contacts) persists in the data directory

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm run test

# Run tests in watch mode
npm run test:watch

# Type check
npm run lint
```

## License

MIT
