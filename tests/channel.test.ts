import { describe, it, expect } from "vitest";
import {
  buildInboundContext,
  shouldSkipChat,
  checkDmPolicy,
  checkGroupPolicy,
  splitMessage,
} from "../src/channel.js";

describe("channel", () => {
  describe("shouldSkipChat", () => {
    it("allows Single chats", () => {
      expect(shouldSkipChat("Single")).toBe(false);
    });

    it("allows Group chats", () => {
      expect(shouldSkipChat("Group")).toBe(false);
    });

    it("skips Mailinglist chats", () => {
      expect(shouldSkipChat("Mailinglist")).toBe(true);
    });

    it("skips Broadcast chats", () => {
      expect(shouldSkipChat("OutBroadcast")).toBe(true);
      expect(shouldSkipChat("InBroadcast")).toBe(true);
    });

    it("skips other chat types", () => {
      expect(shouldSkipChat("Unknown")).toBe(true);
      expect(shouldSkipChat("")).toBe(true);
    });
  });

  describe("buildInboundContext", () => {
    it("builds context for a DM text message", () => {
      const ctx = buildInboundContext({
        text: "Hello bot",
        senderEmail: "alice@example.com",
        chatType: "Single",
        chatId: 10,
        file: null,
        fileMime: null,
      });

      expect(ctx.text).toBe("Hello bot");
      expect(ctx.sessionKey).toBe("deltachat:dm:alice@example.com");
      expect(ctx.chatType).toBe("direct");
      expect(ctx.chatId).toBe(10);
      expect(ctx.media).toBeNull();
      expect(ctx.senderEmail).toBe("alice@example.com");
    });

    it("builds context for a group text message", () => {
      const ctx = buildInboundContext({
        text: "Hello group",
        senderEmail: "alice@example.com",
        chatType: "Group",
        chatId: 42,
        file: null,
        fileMime: null,
      });

      expect(ctx.sessionKey).toBe("deltachat:group:42");
      expect(ctx.chatType).toBe("group");
      expect(ctx.chatId).toBe(42);
    });

    it("includes media when file is present", () => {
      const ctx = buildInboundContext({
        text: "Check this image",
        senderEmail: "alice@example.com",
        chatType: "Single",
        chatId: 10,
        file: "/path/to/image.jpg",
        fileMime: "image/jpeg",
      });

      expect(ctx.media).toEqual({
        path: "/path/to/image.jpg",
        mimeType: "image/jpeg",
      });
    });

    it("sets media to null when no file", () => {
      const ctx = buildInboundContext({
        text: "Just text",
        senderEmail: "alice@example.com",
        chatType: "Single",
        chatId: 10,
        file: null,
        fileMime: null,
      });

      expect(ctx.media).toBeNull();
    });

    it("sets media to null when only fileMime is present", () => {
      const ctx = buildInboundContext({
        text: "Just text",
        senderEmail: "alice@example.com",
        chatType: "Single",
        chatId: 10,
        file: null,
        fileMime: "image/jpeg",
      });

      expect(ctx.media).toBeNull();
    });

    it("sets media to null when only file is present", () => {
      const ctx = buildInboundContext({
        text: "Just text",
        senderEmail: "alice@example.com",
        chatType: "Single",
        chatId: 10,
        file: "/path/to/file",
        fileMime: null,
      });

      expect(ctx.media).toBeNull();
    });

    it("handles empty text message", () => {
      const ctx = buildInboundContext({
        text: "",
        senderEmail: "alice@example.com",
        chatType: "Single",
        chatId: 10,
        file: null,
        fileMime: null,
      });

      expect(ctx.text).toBe("");
      expect(ctx.sessionKey).toBe("deltachat:dm:alice@example.com");
    });

    it("handles special characters in sender email", () => {
      const ctx = buildInboundContext({
        text: "Hello",
        senderEmail: "user+tag@example.com",
        chatType: "Single",
        chatId: 10,
        file: null,
        fileMime: null,
      });

      expect(ctx.sessionKey).toBe("deltachat:dm:user+tag@example.com");
      expect(ctx.senderEmail).toBe("user+tag@example.com");
    });

    it("handles large chat IDs", () => {
      const ctx = buildInboundContext({
        text: "Hello",
        senderEmail: "alice@example.com",
        chatType: "Group",
        chatId: 2147483647,
        file: null,
        fileMime: null,
      });

      expect(ctx.sessionKey).toBe("deltachat:group:2147483647");
      expect(ctx.chatId).toBe(2147483647);
    });
  });

  describe("checkDmPolicy", () => {
    it("allows any sender when policy is open", () => {
      const result = checkDmPolicy({
        dmPolicy: "open",
        senderEmail: "anyone@example.com",
        isVerified: false,
      });
      expect(result.allowed).toBe(true);
    });

    it("disabled blocks all DMs", () => {
      const result = checkDmPolicy({
        dmPolicy: "disabled",
        senderEmail: "anyone@example.com",
        isVerified: true,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not configured to accept direct messages");
    });

    it("pairing allows verified contacts", () => {
      const result = checkDmPolicy({
        dmPolicy: "pairing",
        senderEmail: "verified@example.com",
        isVerified: true,
      });
      expect(result.allowed).toBe(true);
    });

    it("pairing blocks unverified contacts", () => {
      const result = checkDmPolicy({
        dmPolicy: "pairing",
        senderEmail: "unverified@example.com",
        isVerified: false,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("only chat with verified contacts");
    });

    it("allowlist allows listed emails", () => {
      const result = checkDmPolicy({
        dmPolicy: "allowlist",
        senderEmail: "alice@example.com",
        allowFrom: ["alice@example.com", "bob@example.com"],
        isVerified: false,
      });
      expect(result.allowed).toBe(true);
    });

    it("allowlist blocks non-listed emails", () => {
      const result = checkDmPolicy({
        dmPolicy: "allowlist",
        senderEmail: "stranger@example.com",
        allowFrom: ["alice@example.com"],
        isVerified: false,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("add your email to the allowlist");
    });

    it("allowlist allows anyone when list is empty", () => {
      const result = checkDmPolicy({
        dmPolicy: "allowlist",
        senderEmail: "anyone@example.com",
        allowFrom: [],
        isVerified: false,
      });
      expect(result.allowed).toBe(true);
    });

    it("allowlist allows anyone when allowFrom is undefined", () => {
      const result = checkDmPolicy({
        dmPolicy: "allowlist",
        senderEmail: "anyone@example.com",
        isVerified: false,
      });
      expect(result.allowed).toBe(true);
    });
  });

  describe("checkGroupPolicy", () => {
    it("allows any sender when policy is open", () => {
      const result = checkGroupPolicy({
        groupPolicy: "open",
        senderEmail: "anyone@example.com",
      });
      expect(result.allowed).toBe(true);
    });

    it("disabled blocks all group messages", () => {
      const result = checkGroupPolicy({
        groupPolicy: "disabled",
        senderEmail: "anyone@example.com",
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not configured to respond in group chats");
    });

    it("allowlist allows listed emails", () => {
      const result = checkGroupPolicy({
        groupPolicy: "allowlist",
        senderEmail: "alice@example.com",
        groupAllowFrom: ["alice@example.com", "bob@example.com"],
      });
      expect(result.allowed).toBe(true);
    });

    it("allowlist blocks non-listed emails", () => {
      const result = checkGroupPolicy({
        groupPolicy: "allowlist",
        senderEmail: "stranger@example.com",
        groupAllowFrom: ["alice@example.com"],
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("group allowlist");
    });

    it("allowlist allows anyone when list is empty", () => {
      const result = checkGroupPolicy({
        groupPolicy: "allowlist",
        senderEmail: "anyone@example.com",
        groupAllowFrom: [],
      });
      expect(result.allowed).toBe(true);
    });

    it("allowlist allows anyone when groupAllowFrom is undefined", () => {
      const result = checkGroupPolicy({
        groupPolicy: "allowlist",
        senderEmail: "anyone@example.com",
      });
      expect(result.allowed).toBe(true);
    });
  });

  describe("splitMessage", () => {
    it("returns a single part for short text", () => {
      const text = "Hello, world!";
      const parts = splitMessage(text, 100);
      expect(parts).toEqual([text]);
    });

    it("splits at paragraph boundaries when possible", () => {
      const para1 = "a".repeat(100);
      const para2 = "b".repeat(100);
      const para3 = "c".repeat(100);
      const text = `${para1}\n\n${para2}\n\n${para3}`;
      const parts = splitMessage(text, 250);
      expect(parts.length).toBe(2);
      // Finds the last paragraph break before 250, which is between para2 and para3
      expect(parts[0]).toBe(`${para1}\n\n${para2}`);
      expect(parts[1]).toBe(para3);
    });

    it("splits at line boundaries when paragraphs are too far", () => {
      const line1 = "a".repeat(100);
      const line2 = "b".repeat(100);
      const line3 = "c".repeat(100);
      const text = `${line1}\n${line2}\n${line3}`;
      const parts = splitMessage(text, 250);
      expect(parts.length).toBe(2);
      // Finds the last line break before 250, which is between line2 and line3
      expect(parts[0]).toBe(`${line1}\n${line2}`);
      expect(parts[1]).toBe(line3);
    });

    it("splits at sentence boundaries when lines are too far", () => {
      const s1 = "First sentence here. ";
      const s2 = "Second sentence here. ";
      const s3 = "Third sentence here.";
      const text = s1 + s2 + s3;
      const parts = splitMessage(text, 45);
      expect(parts.length).toBe(2);
      // Finds the last sentence end before 45, which is after s2
      expect(parts[0]).toBe("First sentence here. Second sentence here.");
      expect(parts[1]).toBe("Third sentence here.");
    });

    it("splits at word boundaries when sentences are too far", () => {
      const text = "one two three four five six";
      const parts = splitMessage(text, 15);
      expect(parts.length).toBe(2);
      expect(parts[0]).toBe("one two three");
      expect(parts[1]).toBe("four five six");
    });

    it("hard splits when no natural boundary exists", () => {
      const text = "abcdefghijklmnopqrstuvwxyz";
      const parts = splitMessage(text, 10);
      expect(parts.length).toBe(3);
      expect(parts[0]).toBe("abcdefghij");
      expect(parts[1]).toBe("klmnopqrst");
      expect(parts[2]).toBe("uvwxyz");
    });

    it("uses the default 3600 limit", () => {
      const text = "x".repeat(4000);
      const parts = splitMessage(text);
      expect(parts.length).toBe(2);
      expect(parts[0].length).toBeLessThanOrEqual(3600);
      expect(parts[1].length).toBeLessThanOrEqual(3600);
    });
  });
});
