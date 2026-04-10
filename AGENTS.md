# AGENTS.md — openclaw-channel-deltachat

> This file contains essential information for AI coding agents working on this project. The reader is expected to know nothing about the project beforehand.

## Project Overview

**openclaw-channel-deltachat** is an [OpenClaw](https://openclaw.ai) channel plugin that bridges [Delta Chat](https://delta.chat) messaging to OpenClaw's AI agent pipeline.

Users interact with OpenClaw agents via end-to-end encrypted Delta Chat messages. The plugin handles the protocol translation between Delta Chat (email-based messaging) and OpenClaw's agent system.

### Key Characteristics

- **Type**: OpenClaw plugin (channel type)
- **Runtime**: Node.js, runs in-process within the OpenClaw gateway
- **Language**: TypeScript (ES Modules)
- **License**: MIT

## Architecture

```
Delta Chat Client  <-->  Email (IMAP/SMTP)  <-->  deltachat-rpc-server
                                                         |
                                                    JSON-RPC (stdio)
                                                         |
                                                  openclaw-channel-deltachat (this plugin)
                                                         |
                                                    in-process calls
                                                         |
                                                  OpenClaw Gateway (core)
                                                         |
                                                    AI Agent Pipeline
```

### Communication Flow

1. **Inbound**: Delta Chat messages → `deltachat-rpc-server` → `@deltachat/jsonrpc-client` → Plugin → OpenClaw agent pipeline
2. **Outbound**: OpenClaw agent responses → Plugin → `deltachat-rpc-server` → Delta Chat

## Technology Stack

| Component | Technology |
|-----------|------------|
| Language | TypeScript 5.5+ |
| Module System | ES Modules (`"type": "module"`) |
| Target | ES2022 |
| Testing | Vitest 2.0+ |
| Delta Chat Integration | `@deltachat/jsonrpc-client` |
| External Binary | `deltachat-rpc-server` (Rust binary) |

## Project Structure

```
├── openclaw.plugin.json     # Plugin manifest (id: "deltachat")
├── package.json             # npm package config
├── tsconfig.json            # TypeScript configuration
├── README.md                # User-facing documentation
├── .gitignore               # Git ignore rules
├── src/
│   ├── index.ts             # Plugin entry point, exports register(api)
│   ├── channel.ts           # ChannelPlugin implementation (adapters)
│   ├── deltachat.ts         # DeltaChatClient wrapper class
│   └── types.ts             # TypeScript type definitions + validation
├── tests/
│   ├── channel.test.ts      # Unit tests for channel logic
│   └── deltachat.test.ts    # Unit tests for DeltaChatClient + validation
└── docs/superpowers/        # Design specs and implementation plans
    ├── specs/
    └── plans/
```

### Source File Details

- **`src/index.ts`**: Plugin registration entry point. Exports `register(api)` function that:
  - Creates the Delta Chat channel
  - Registers the channel with OpenClaw
  - Sets up HTTP routes for the invite page (`/deltachat/invite`)
  - Generates HTML invite page with account-type-specific instructions

- **`src/channel.ts`**: Core channel plugin implementation with:
  - Channel metadata and capabilities
  - Config adapter (account resolution)
  - Outbound adapter (message sending)
  - Gateway adapter (lifecycle management)
  - Inbound message handling and context building
  - Access control (allowFrom checking)
  - Group context (subject, mention requirements)

- **`src/deltachat.ts`**: DeltaChatClient class that:
  - Spawns `deltachat-rpc-server` as child process
  - Manages JSON-RPC communication over stdio
  - Handles account configuration (email, chatmail, custom relay)
  - Manages session keys for DMs and groups
  - Implements crash recovery with rate limiting
  - Supports custom chatmail relays

- **`src/types.ts`**: Type definitions for:
  - `DeltaChatConfig` interface
  - `CustomChatmailRelayConfig` interface
  - `DEFAULT_CONFIG` constants
  - `validateConfig()` function for configuration validation

## Build and Development Commands

```bash
# Install dependencies
npm install

# Build TypeScript to dist/
npm run build
# Equivalent to: tsc

# Run tests once
npm run test
# Equivalent to: vitest run

# Run tests in watch mode
npm run test:watch
# Equivalent to: vitest

# Type check without emitting
npm run lint
# Equivalent to: tsc --noEmit
```

### Build Output

- Compiled JavaScript: `dist/` directory
- Type declarations: `dist/*.d.ts`
- Source maps: `dist/*.js.map`
- Entry point: `dist/index.js`

## Testing Strategy

Tests are written using **Vitest** and focus on unit testing logic that doesn't require the actual `deltachat-rpc-server` binary.

### Test Coverage

1. **`tests/deltachat.test.ts`**:
   - `DeltaChatClient.parseSessionKey()` - Parse DM and group session keys
   - `DeltaChatClient.buildSessionKey()` - Build session keys from components
   - `validateConfig()` - Configuration validation and defaults
   - Custom chatmail relay validation
   - allowFrom validation

2. **`tests/channel.test.ts`**:
   - `shouldSkipChat()` - Filter valid chat types (Single, Group)
   - `buildInboundContext()` - Build inbound message context for DMs and groups
   - Media handling (file attachments)
   - Edge cases (empty text, special characters, large IDs)

### Running Tests

```bash
# Run all tests
npm run test

# Run with watch mode for development
npm run test:watch
```

## Code Style Guidelines

### TypeScript Configuration

- **Strict mode**: Enabled (`strict: true`)
- **Module resolution**: `bundler`
- **File extensions**: Use `.js` for imports (ES Modules requirement)
  ```typescript
  import { DeltaChatClient } from "./deltachat.js";
  ```

### Naming Conventions

- Classes: `PascalCase` (e.g., `DeltaChatClient`)
- Interfaces: `PascalCase` (e.g., `DeltaChatConfig`)
- Functions: `camelCase` (e.g., `buildInboundContext`)
- Constants: `UPPER_SNAKE_CASE` for true constants
- Private methods: Prefix with `_` or use `private` keyword

### Code Patterns

1. **Null safety**: Always check for null/undefined before using optional values
2. **Error handling**: Use try-catch for async operations, log errors with context
3. **Session keys**: Format is `deltachat:<type>:<id>` where type is `dm` or `group`
4. **Chat type filtering**: Only process `Single` (DM) and `Group` chat types
5. **Type safety**: Avoid `any` where possible; use proper types and interfaces

## Configuration

### Plugin Configuration (openclaw.json)

Located at `~/.openclaw/openclaw.json`:

```json
{
  "channels": {
    "deltachat": {
      "email": "auto",
      "password": null,
      "chatmailServer": "nine.testrun.org",
      "customChatmailRelay": {
        "enabled": false,
        "url": "https://chatmail.example.com/new",
        "token": "optional-api-token"
      },
      "dataDir": "~/.openclaw/deltachat-data",
      "rpcServerPath": "deltachat-rpc-server",
      "dmPolicy": "open",
      "allowFrom": ["user@example.com"],
      "requireMention": false,
      "enabled": true
    }
  }
}
```

### Configuration Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `email` | string | yes | — | `"auto"` for chatmail, or actual email address |
| `password` | string | no | — | Email password (required if email is not "auto") |
| `chatmailServer` | string | no | `nine.testrun.org` | Chatmail server for auto-created accounts |
| `customChatmailRelay` | object | no | — | Custom relay config (see below) |
| `dataDir` | string | no | `~/.openclaw/deltachat-data` | Delta Chat data directory |
| `rpcServerPath` | string | no | `deltachat-rpc-server` | Path to rpc-server binary |
| `dmPolicy` | string | no | `open` | DM policy: `open`, `allowlist`, `pairing`, `disabled` |
| `allowFrom` | string[] | no | — | Allowed emails for `allowlist` policy |
| `requireMention` | boolean | no | `false` | Require @mention in groups |
| `enabled` | boolean | no | `true` | Enable/disable the channel |

### Custom Chatmail Relay

For private/self-hosted chatmail servers:

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `enabled` | boolean | yes | Enable custom relay mode |
| `url` | string | yes | Full URL to the account creation endpoint |
| `token` | string | no | Optional authentication token |

### Agent Name Resolution

The bot's display name is read from `IDENTITY.md` in the OpenClaw workspace (parsed from `**Name:**` line). Falls back to `"OC"` if not found.

## Runtime Behavior

### Lifecycle

1. **Start**: `gateway.startAccount()`
   - Validate configuration with `validateConfig()`
   - Spawn `deltachat-rpc-server` child process
   - Configure account (create new or reuse existing)
   - Generate SecureJoin invite link and QR code
   - Start message event handler
   - Block until `stopAccount()` is called

2. **Message Handling**:
   - Listen for `IncomingMsg` events
   - Skip system messages and self-sent messages
   - Auto-accept contact requests
   - Check `allowFrom` if configured
   - Build inbound context and dispatch to OpenClaw
   - Mark messages as seen after processing

3. **Stop**: `gateway.stopAccount()`
   - Wait for in-flight dispatches (up to 10s)
   - Stop IO gracefully via `stopIo()`
   - Close RPC client
   - Kill server process
   - Reset invite state

### Session Key Format

- **DM**: `deltachat:dm:<email>` (e.g., `deltachat:dm:alice@example.com`)
- **Group**: `deltachat:group:<chatId>` (e.g., `deltachat:group:42`)

### Error Handling

- **Config validation**: Throws descriptive errors for invalid configuration
- **Server crashes**: Automatic respawn with rate limiting (max 3 crashes per 60 seconds)
- **Send failures**: Logged via `MsgFailed` event subscription
- **Network issues**: Handled by Delta Chat core (auto-reconnect, message queuing)

## HTTP Routes

The plugin registers HTTP endpoints on the OpenClaw gateway:

| Path | Description |
|------|-------------|
| `/deltachat/invite` | HTML page with QR code and connection instructions |
| `/deltachat/invite/qr.svg` | Raw QR code SVG |
| `/deltachat/invite/link` | Plain text invite link |

The invite page adapts based on account type:
- **Chatmail**: Shows QR scanning instructions
- **Regular email**: Shows email-based connection instructions

## Prerequisites for Development

1. **Node.js**: Version compatible with TypeScript 5.5+
2. **deltachat-rpc-server**: Must be on `$PATH`
   ```bash
   # Install via pip (easiest method)
   pip install deltachat-rpc-server
   
   # Verify
   deltachat-rpc-server --version
   ```
3. **OpenClaw**: Gateway must be running for full integration testing

## Security Considerations

1. **Encryption**: All messages are end-to-end encrypted by Delta Chat
2. **Authentication**: Uses Delta Chat's SecureJoin protocol for verified connections
3. **Access Control**: Configurable via `dmPolicy` and `allowFrom` options
4. **Credentials**: Email passwords stored in OpenClaw config (standard OpenClaw practice)
5. **Data Directory**: Contains Delta Chat account state (keys, messages) — protect appropriately
6. **Custom Relay Tokens**: API tokens for custom chatmail relays are stored in config

## Common Development Tasks

### Adding a New Feature

1. Write tests first (TDD approach)
2. Implement the feature in appropriate source file
3. Update `validateConfig()` if adding config options
4. Update `openclaw.plugin.json` schema
5. Ensure all tests pass: `npm run test`
6. Verify build: `npm run build`
7. Run type check: `npm run lint`
8. Update README.md and AGENTS.md

### Modifying Message Handling

Changes to inbound message flow should be made in:
- `src/channel.ts`: `buildInboundContext()`, message handler in `gateway.startAccount()`
- `src/deltachat.ts`: `startMessageHandler()` for low-level event handling

### Adding New Configuration Options

1. Add to `DeltaChatConfig` interface in `src/types.ts`
2. Add to `DEFAULT_CONFIG` if applicable
3. Add validation logic to `validateConfig()`
4. Update `resolveAccountFromConfig()` in `src/channel.ts`
5. Update `openclaw.plugin.json` schema
6. Update documentation in README.md and AGENTS.md

## Dependencies

### Production
- `@deltachat/jsonrpc-client`: ^2.47.0 — Delta Chat JSON-RPC client

### Development
- `typescript`: ^5.5.0 — TypeScript compiler
- `vitest`: ^2.0.0 — Test runner
- `@types/node`: ^22.0.0 — Node.js type definitions

### Peer
- `openclaw`: * — OpenClaw gateway (provided at runtime)

## Known Limitations

- No message streaming/live edits (Delta Chat is email-based)
- No reactions or emoji responses
- No Webxdc apps integration
- Single bot account per plugin instance
- No read receipts as typing indicators
- No inline keyboards or interactive elements

## References

- [Delta Chat](https://delta.chat)
- [Delta Chat Core Releases](https://github.com/chatmail/core/releases)
- [OpenClaw](https://openclaw.ai)
- Design spec: `docs/superpowers/specs/2026-03-25-openclaw-deltachat-channel-design.md`
- Implementation plan: `docs/superpowers/plans/2026-03-25-openclaw-deltachat-channel.md`
