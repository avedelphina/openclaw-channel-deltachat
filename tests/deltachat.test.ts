import { describe, it, expect } from "vitest";
import { DeltaChatClient } from "../src/deltachat.js";
import { validateConfig, DEFAULT_CONFIG } from "../src/types.js";

// We can't easily test the real deltachat-rpc-server in unit tests,
// so we test the session key resolution and config logic.

describe("DeltaChatClient", () => {
  describe("parseSessionKey", () => {
    it("parses dm session key", () => {
      const result = DeltaChatClient.parseSessionKey(
        "deltachat:dm:alice@example.com",
      );
      expect(result).toEqual({ type: "dm", email: "alice@example.com" });
    });

    it("parses group session key", () => {
      const result = DeltaChatClient.parseSessionKey("deltachat:group:42");
      expect(result).toEqual({ type: "group", chatId: 42 });
    });

    it("returns null for invalid session key", () => {
      expect(DeltaChatClient.parseSessionKey("invalid")).toBeNull();
      expect(
        DeltaChatClient.parseSessionKey("deltachat:unknown:foo"),
      ).toBeNull();
      expect(DeltaChatClient.parseSessionKey("")).toBeNull();
    });

    it("returns null for group key with non-numeric id", () => {
      expect(
        DeltaChatClient.parseSessionKey("deltachat:group:abc"),
      ).toBeNull();
    });

    it("handles email with colons (edge case)", () => {
      // While colons in email addresses are extremely rare, the parser should handle them
      const result = DeltaChatClient.parseSessionKey(
        "deltachat:dm:user:domain@example.com",
      );
      expect(result).toEqual({
        type: "dm",
        email: "user:domain@example.com",
      });
    });
  });

  describe("buildSessionKey", () => {
    it("builds dm session key", () => {
      expect(
        DeltaChatClient.buildSessionKey("dm", "alice@example.com"),
      ).toBe("deltachat:dm:alice@example.com");
    });

    it("builds group session key", () => {
      expect(DeltaChatClient.buildSessionKey("group", 42)).toBe(
        "deltachat:group:42",
      );
    });
  });
});

describe("validateConfig", () => {
  it("applies default values", () => {
    const config = validateConfig({});
    expect(config.enabled).toBe(true);
    expect(config.displayName).toBe("OC");
    expect(config.dataDir).toBe("~/.openclaw/deltachat-data");
    expect(config.rpcServerPath).toBe("deltachat-rpc-server");
    expect(config.chatmailServer).toBe("nine.testrun.org");
    expect(config.dmPolicy).toBe("open");
    expect(config.requireMention).toBe(false);
  });

  it("uses provided values over defaults", () => {
    const config = validateConfig({
      enabled: false,
      displayName: "MyBot",
      chatmailServer: "custom.example.com",
      dmPolicy: "allowlist",
    });
    expect(config.enabled).toBe(false);
    expect(config.displayName).toBe("MyBot");
    expect(config.chatmailServer).toBe("custom.example.com");
    expect(config.dmPolicy).toBe("allowlist");
  });

  it("accepts valid custom chatmail relay config", () => {
    const config = validateConfig({
      customChatmailRelay: {
        enabled: true,
        url: "https://chatmail.example.com/new",
      },
    });
    expect(config.customChatmailRelay?.enabled).toBe(true);
    expect(config.customChatmailRelay?.url).toBe(
      "https://chatmail.example.com/new",
    );
  });

  it("accepts custom chatmail relay with token", () => {
    const config = validateConfig({
      customChatmailRelay: {
        enabled: true,
        url: "https://chatmail.example.com/new",
        token: "secret-token-123",
      },
    });
    expect(config.customChatmailRelay?.token).toBe("secret-token-123");
  });

  it("throws when custom chatmail relay is enabled without URL", () => {
    expect(() =>
      validateConfig({
        customChatmailRelay: {
          enabled: true,
        },
      }),
    ).toThrow("customChatmailRelay.url is required");
  });

  it("throws when custom chatmail relay URL is invalid", () => {
    expect(() =>
      validateConfig({
        customChatmailRelay: {
          enabled: true,
          url: "not-a-valid-url",
        },
      }),
    ).toThrow("customChatmailRelay.url is invalid");
  });

  it("throws when custom chatmail relay URL has wrong protocol", () => {
    expect(() =>
      validateConfig({
        customChatmailRelay: {
          enabled: true,
          url: "ftp://chatmail.example.com/new",
        },
      }),
    ).toThrow("customChatmailRelay.url must use http or https protocol");
  });

  it("throws when email is set without password and no custom relay", () => {
    expect(() =>
      validateConfig({
        email: "bot@example.com",
      }),
    ).toThrow("password is required when email is set to a specific address");
  });

  it("does not throw when email is 'auto' without password", () => {
    const config = validateConfig({
      email: "auto",
    });
    expect(config.email).toBe("auto");
    expect(config.password).toBeUndefined();
  });

  it("does not throw when using custom relay without password", () => {
    const config = validateConfig({
      customChatmailRelay: {
        enabled: true,
        url: "https://chatmail.example.com/new",
      },
    });
    expect(config.customChatmailRelay?.enabled).toBe(true);
  });

  it("accepts valid allowFrom array", () => {
    const config = validateConfig({
      allowFrom: ["alice@example.com", "bob@test.org"],
    });
    expect(config.allowFrom).toEqual(["alice@example.com", "bob@test.org"]);
  });

  it("throws when allowFrom is not an array", () => {
    expect(() =>
      validateConfig({
        allowFrom: "not-an-array" as unknown as string[],
      }),
    ).toThrow("allowFrom must be an array");
  });

  it("throws when allowFrom contains invalid email", () => {
    expect(() =>
      validateConfig({
        allowFrom: ["alice@example.com", "not-an-email"],
      }),
    ).toThrow("Invalid email in allowFrom");
  });

  it("accepts complete custom chatmail configuration", () => {
    const config = validateConfig({
      enabled: true,
      displayName: "CustomBot",
      customChatmailRelay: {
        enabled: true,
        url: "https://private.chatmail.io/new",
        token: "api-key-12345",
      },
      dataDir: "/custom/path",
      dmPolicy: "allowlist",
      allowFrom: ["user1@example.com", "user2@example.com"],
      requireMention: true,
    });

    expect(config.displayName).toBe("CustomBot");
    expect(config.customChatmailRelay?.enabled).toBe(true);
    expect(config.customChatmailRelay?.url).toBe(
      "https://private.chatmail.io/new",
    );
    expect(config.customChatmailRelay?.token).toBe("api-key-12345");
    expect(config.dmPolicy).toBe("allowlist");
    expect(config.requireMention).toBe(true);
  });

  it("accepts avatarPath", () => {
    const config = validateConfig({
      avatarPath: "/path/to/avatar.png",
    });
    expect(config.avatarPath).toBe("/path/to/avatar.png");
  });

  it("accepts groupPolicy and groupAllowFrom", () => {
    const config = validateConfig({
      groupPolicy: "allowlist",
      groupAllowFrom: ["alice@example.com"],
    });
    expect(config.groupPolicy).toBe("allowlist");
    expect(config.groupAllowFrom).toEqual(["alice@example.com"]);
  });

  it("throws when groupAllowFrom contains invalid email", () => {
    expect(() =>
      validateConfig({
        groupAllowFrom: ["alice@example.com", "not-an-email"],
      }),
    ).toThrow("Invalid email in groupAllowFrom");
  });

  it("accepts sendReadReceipts and configWrites", () => {
    const config = validateConfig({
      sendReadReceipts: false,
      configWrites: false,
    });
    expect(config.sendReadReceipts).toBe(false);
    expect(config.configWrites).toBe(false);
  });
});

describe("DeltaChatClient profile methods", () => {
  it("setChatProfileImage throws when client is not started", async () => {
    const client = new DeltaChatClient({
      enabled: true,
      displayName: "Test",
      dataDir: "/tmp/dc-test",
      rpcServerPath: "deltachat-rpc-server",
      chatmailServer: "nine.testrun.org",
    });
    await expect(
      client.setChatProfileImage(1, "/path/to/image.png"),
    ).rejects.toThrow("Client not started");
  });

  it("createGroupChat throws when client is not started", async () => {
    const client = new DeltaChatClient({
      enabled: true,
      displayName: "Test",
      dataDir: "/tmp/dc-test",
      rpcServerPath: "deltachat-rpc-server",
      chatmailServer: "nine.testrun.org",
    });
    await expect(client.createGroupChat("Test Group", true)).rejects.toThrow(
      "Client not started",
    );
  });

  it("leaveGroup throws when client is not started", async () => {
    const client = new DeltaChatClient({
      enabled: true,
      displayName: "Test",
      dataDir: "/tmp/dc-test",
      rpcServerPath: "deltachat-rpc-server",
      chatmailServer: "nine.testrun.org",
    });
    await expect(client.leaveGroup(1)).rejects.toThrow("Client not started");
  });

  it("getGroupSecureJoinInvite throws when client is not started", async () => {
    const client = new DeltaChatClient({
      enabled: true,
      displayName: "Test",
      dataDir: "/tmp/dc-test",
      rpcServerPath: "deltachat-rpc-server",
      chatmailServer: "nine.testrun.org",
    });
    await expect(
      client.getGroupSecureJoinInvite(1),
    ).rejects.toThrow("Client not started");
  });
});

describe("DEFAULT_CONFIG", () => {
  it("has expected default values", () => {
    expect(DEFAULT_CONFIG.enabled).toBe(true);
    expect(DEFAULT_CONFIG.displayName).toBe("OC");
    expect(DEFAULT_CONFIG.dataDir).toBe("~/.openclaw/deltachat-data");
    expect(DEFAULT_CONFIG.rpcServerPath).toBe("deltachat-rpc-server");
    expect(DEFAULT_CONFIG.chatmailServer).toBe("nine.testrun.org");
    expect(DEFAULT_CONFIG.dmPolicy).toBe("open");
    expect(DEFAULT_CONFIG.requireMention).toBe(false);
  });
});
