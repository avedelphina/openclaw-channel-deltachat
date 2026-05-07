# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.15] - 2026-05-07

## [0.1.14] - 2026-05-07

## [0.1.13] - 2026-05-07

## [0.1.12] - 2026-05-07

## [0.1.11] - 2026-05-07

## [0.1.5] - 2026-05-06

### Fixed

- Added `channelConfigs.deltachat.schema` to `openclaw.plugin.json`. OpenClaw
  2026.4+ requires this metadata for channel plugins so config schema and setup
  surfaces work before runtime loads. This eliminates the manifest warning:
  "channel plugin manifest declares deltachat without channelConfigs metadata".

## [0.1.4] - 2026-05-06

### Fixed

- Emptied `configSchema` in `openclaw.plugin.json` to match the standard external
  plugin pattern. The OpenClaw Control UI form renderer cannot reliably handle
  rich JSON schemas from external plugin manifests; an empty schema eliminates
  the "Unsupported type: . Use Raw mode." error completely.

### Added

- Added `status.buildAccountSnapshot()` adapter so the invite link appears in
  gateway status snapshots.
- Added CLI command `openclaw deltachat-invite` that prints the SecureJoin
  invite link, QR code availability, and HTML invite page URL.

## [0.1.3] - 2026-05-06

### Fixed

- Removed `additionalProperties: false` from `openclaw.plugin.json` config schema to fix
  "Unsupported type: . Use Raw mode." rendering error in the OpenClaw Control UI.

### Added

- Added `gateway.loginWithQrStart()` and `gateway.loginWithQrWait()` adapter methods.
  This enables the OpenClaw UI to display a "Show QR Code" button for Delta Chat,
  matching the UX of WhatsApp and other QR-based channels.

## [0.1.2] - 2026-04-13

### Added

- Implemented `pairing` and `disabled` DM policies.
  - `pairing`: Only accepts direct messages from verified contacts (via SecureJoin).
  - `disabled`: Rejects all direct messages.
- Bot avatar support. The plugin auto-detects `avatar.png`, `avatar.jpg`, or `logo.png`
  in the OpenClaw workspace and sets it as the Delta Chat profile image.
  An explicit `avatarPath` config option is also available.
- Added `groupPolicy` and `groupAllowFrom` for group chat access control.
- Added `sendReadReceipts` toggle to control MDN read receipts for DMs.
- Added `configWrites` toggle for `/config` command gating.
- Added verified group creation via `POST /deltachat/groups` and group QR
  invite endpoints. Group contact requests are now policy-aware: unauthorized
  group additions trigger `leaveGroup()` automatically.

## [0.1.1] - 2026-04-10

### Fixed

- Removed unsupported `"format": "email"` from `openclaw.plugin.json` schema to prevent validator warnings at path `#/properties/allowFrom/items`.

## [0.1.0] - 2026-04-09

### Added

- Initial release of the OpenClaw Delta Chat channel plugin.
- Delta Chat messaging bridge with end-to-end encryption.
- SecureJoin invite link and QR code generation.
- Support for chatmail auto-account creation and custom chatmail relays.
- Configurable DM policies (`open`, `allowlist`, `pairing`, `disabled`).
