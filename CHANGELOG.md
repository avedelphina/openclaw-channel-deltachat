# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
