/**
 * Configuration for a custom chatmail relay (private/self-hosted chatmail server).
 */
export interface CustomChatmailRelayConfig {
  /** Enable custom chatmail relay mode */
  enabled: boolean;
  /** Full URL to the chatmail account creation endpoint */
  url?: string;
  /** Optional authentication token for the chatmail server */
  token?: string;
}

/**
 * Delta Chat channel plugin configuration.
 */
export interface DeltaChatConfig {
  /** Enable or disable the channel */
  enabled: boolean;
  /**
   * Email address for the bot.
   * Use "auto" or leave undefined to create a chatmail account automatically.
   */
  email?: string;
  /**
   * Password for the email account.
   * Required when email is set to a specific address (not "auto").
   */
  password?: string;
  /** Display name shown to contacts */
  displayName: string;
  /** Directory for Delta Chat account data */
  dataDir: string;
  /** Path to the deltachat-rpc-server binary */
  rpcServerPath: string;
  /**
   * Chatmail server hostname for auto-created accounts.
   * Only used when email is "auto" or not set.
   * @default "nine.testrun.org"
   */
  chatmailServer: string;
  /** Custom chatmail relay configuration for private/self-hosted servers */
  customChatmailRelay?: CustomChatmailRelayConfig;
  /** Direct message policy */
  dmPolicy?: "open" | "allowlist" | "pairing" | "disabled";
  /** List of allowed email addresses (for allowlist policy) */
  allowFrom?: string[];
  /** Require mention in groups to respond */
  requireMention?: boolean;
}

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG: Partial<DeltaChatConfig> = {
  enabled: true,
  displayName: "OC",
  dataDir: "~/.openclaw/deltachat-data",
  rpcServerPath: "deltachat-rpc-server",
  chatmailServer: "nine.testrun.org",
  dmPolicy: "open",
  requireMention: false,
};

/**
 * Validates the configuration and returns normalized config.
 * Throws if the configuration is invalid.
 */
export function validateConfig(
  config: Partial<DeltaChatConfig>,
): DeltaChatConfig {
  // Apply defaults
  const merged: DeltaChatConfig = {
    ...DEFAULT_CONFIG,
    ...config,
    enabled: config.enabled ?? DEFAULT_CONFIG.enabled ?? true,
    displayName: config.displayName ?? DEFAULT_CONFIG.displayName ?? "OC",
    dataDir: config.dataDir ?? DEFAULT_CONFIG.dataDir ?? "~/.openclaw/deltachat-data",
    rpcServerPath: config.rpcServerPath ?? DEFAULT_CONFIG.rpcServerPath ?? "deltachat-rpc-server",
    chatmailServer: config.chatmailServer ?? DEFAULT_CONFIG.chatmailServer ?? "nine.testrun.org",
  } as DeltaChatConfig;

  // Validate custom chatmail relay if enabled
  if (merged.customChatmailRelay?.enabled) {
    if (!merged.customChatmailRelay.url) {
      throw new Error(
        "customChatmailRelay.url is required when customChatmailRelay.enabled is true",
      );
    }
    // Validate URL format
    let url: URL;
    try {
      url = new URL(merged.customChatmailRelay.url);
    } catch {
      throw new Error(
        `customChatmailRelay.url is invalid: ${merged.customChatmailRelay.url}`,
      );
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error(
        `customChatmailRelay.url must use http or https protocol, got: ${url.protocol}`,
      );
    }
  }

  // Validate email/password combination
  const isAutoEmail = !merged.email || merged.email === "auto";
  const hasCustomRelay =
    merged.customChatmailRelay?.enabled && merged.customChatmailRelay?.url;

  if (!isAutoEmail && !merged.password && !hasCustomRelay) {
    throw new Error(
      "password is required when email is set to a specific address (not 'auto')",
    );
  }

  // Validate allowFrom if provided
  if (merged.allowFrom) {
    if (!Array.isArray(merged.allowFrom)) {
      throw new Error("allowFrom must be an array of email addresses");
    }
    for (const email of merged.allowFrom) {
      if (typeof email !== "string" || !email.includes("@")) {
        throw new Error(`Invalid email in allowFrom: ${email}`);
      }
    }
  }

  return merged;
}
