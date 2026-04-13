# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
