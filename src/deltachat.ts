import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { mkdir, access } from "node:fs/promises";
import {
  StdioDeltaChat,
  C,
  type T,
  type DcEvent,
} from "@deltachat/jsonrpc-client";
import type { DeltaChatConfig } from "./types.js";

function checkBinaryExists(command: string): boolean {
  const check =
    process.platform === "win32"
      ? spawnSync("where", [command], { stdio: "ignore" })
      : spawnSync("command", ["-v", command], { stdio: "ignore" });
  return check.status === 0;
}

export type SessionKey =
  | { type: "dm"; email: string }
  | { type: "group"; chatId: number };

/** Event handler type for Delta Chat events */
export type DeltaChatEventHandler = (event: DcEvent) => void;

export class DeltaChatClient {
  private dc: StdioDeltaChat | null = null;
  private server: ChildProcess | null = null;
  private accountId = 0;
  private running = false;
  private config: DeltaChatConfig;
  private crashTimes: number[] = [];
  private inFlightCount = 0;
  private inFlightResolve: (() => void) | null = null;

  constructor(config: DeltaChatConfig) {
    this.config = config;
  }

  // --- Static helpers for session key management ---

  static parseSessionKey(key: string): SessionKey | null {
    if (!key.startsWith("deltachat:")) return null;
    const parts = key.split(":");
    if (parts.length < 3) return null;

    if (parts[1] === "dm") {
      const email = parts.slice(2).join(":"); // email may contain colons (unlikely but safe)
      if (!email) return null;
      return { type: "dm", email };
    }
    if (parts[1] === "group") {
      const chatId = parseInt(parts[2], 10);
      if (isNaN(chatId)) return null;
      return { type: "group", chatId };
    }
    return null;
  }

  static buildSessionKey(type: "dm", email: string): string;
  static buildSessionKey(type: "group", chatId: number): string;
  static buildSessionKey(type: string, id: string | number): string {
    return `deltachat:${type}:${id}`;
  }

  // --- Lifecycle ---

  async start(): Promise<void> {
    const dataDir = this.resolveDataDir();
    await mkdir(dataDir, { recursive: true });

    if (!checkBinaryExists(this.config.rpcServerPath)) {
      throw new Error(
        `deltachat-rpc-server not found: "${this.config.rpcServerPath}". ` +
          `Install it via pip (pip install deltachat-rpc-server) or download ` +
          `a prebuilt binary from https://github.com/chatmail/core/releases`,
      );
    }

    this.server = spawn(this.config.rpcServerPath, [], {
      // security: shell disabled to prevent injection; only whitelisted
      // env vars are forwarded to the child process.
      shell: false,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        USER: process.env.USER,
        LOGNAME: process.env.LOGNAME,
        SHELL: process.env.SHELL,
        TMPDIR: process.env.TMPDIR,
        LANG: process.env.LANG,
        LC_ALL: process.env.LC_ALL,
        DC_ACCOUNTS_PATH: dataDir,
      },
      stdio: ["pipe", "pipe", "inherit"],
    });

    // Wait for spawn to succeed or fail before proceeding
    await new Promise<void>((resolve, reject) => {
      this.server!.on("error", (err: Error) => {
        reject(
          new Error(
            `Failed to spawn ${this.config.rpcServerPath}: ${err.message}`,
          ),
        );
      });
      this.server!.on("spawn", () => {
        resolve();
      });
    });

    this.server.on("exit", (code) => this.handleServerExit(code));

    this.dc = new StdioDeltaChat(
      this.server.stdin!,
      this.server.stdout!,
      true,
    );

    await this.configureAccount();
    await this.dc.rpc.startIo(this.accountId);
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;

    // Wait for in-flight dispatches to complete (up to 10 seconds)
    if (this.inFlightCount > 0) {
      await Promise.race([
        new Promise<void>((resolve) => {
          this.inFlightResolve = resolve;
        }),
        new Promise<void>((resolve) => setTimeout(resolve, 10_000)),
      ]);
    }

    // Stop IO gracefully before closing connection
    if (this.dc) {
      try {
        await this.dc.rpc.stopIo(this.accountId);
      } catch {
        // Ignore — server may already be gone
      }
      this.dc.close();
      this.dc = null;
    }
    if (this.server) {
      this.server.kill();
      this.server = null;
    }
  }

  // --- Message handling ---

  /**
   * Listen for incoming messages via the IncomingMsg event.
   *
   * We use the event-based approach instead of waitNextMsgs because
   * waitNextMsgs only returns "post-messages" (Delta Chat messages),
   * not regular emails. The IncomingMsg event fires for all messages
   * that DC assigns to a chat (when show_emails=2).
   */
  startMessageHandler(
    handler: (msg: T.Message, chat: T.FullChat) => Promise<void>,
  ): void {
    if (!this.dc) throw new Error("Client not started");

    this.dc.on(
      "IncomingMsg",
      async (
        _accountId: number,
        { chatId, msgId }: { chatId: number; msgId: number },
      ) => {
        if (!this.dc || !this.running) return;

        try {
          const msg = await this.dc.rpc.getMessage(this.accountId, msgId);

          // Skip system/info messages and self-sent messages
          if (msg.isInfo || msg.fromId === C.DC_CONTACT_ID_SELF) {
            await this.dc.rpc.markseenMsgs(this.accountId, [msgId]);
            return;
          }

          const chat = await this.dc.rpc.getFullChatById(
            this.accountId,
            chatId,
          );

          // Mark as seen immediately so the user knows the bot is alive,
          // even if the AI reply takes a while to generate.
          if (this.config.sendReadReceipts !== false) {
            await this.dc.rpc.markseenMsgs(this.accountId, [msgId]);
          }

          this.inFlightCount++;
          try {
            await handler(msg, chat);
          } catch (err) {
            console.error("[deltachat] Error handling message:", err);
          } finally {
            this.inFlightCount--;
            if (this.inFlightCount === 0 && this.inFlightResolve) {
              this.inFlightResolve();
              this.inFlightResolve = null;
            }
          }
        } catch (err) {
          if (!this.running) return;
          console.error("[deltachat] Error processing incoming message:", err);
        }
      },
    );
  }

  // --- Sending ---

  async sendText(chatId: number, text: string): Promise<number> {
    if (!this.dc) throw new Error("Client not started");
    return this.dc.rpc.miscSendTextMessage(this.accountId, chatId, text);
  }

  async setChatProfileImage(
    chatId: number,
    imagePath: string | null,
  ): Promise<void> {
    if (!this.dc) throw new Error("Client not started");
    await this.dc.rpc.setChatProfileImage(this.accountId, chatId, imagePath);
  }

  async createGroupChat(name: string, protect: boolean): Promise<number> {
    if (!this.dc) throw new Error("Client not started");
    return this.dc.rpc.createGroupChat(this.accountId, name, protect);
  }

  async leaveGroup(chatId: number): Promise<void> {
    if (!this.dc) throw new Error("Client not started");
    await this.dc.rpc.leaveGroup(this.accountId, chatId);
  }

  async getGroupSecureJoinInvite(
    chatId: number,
  ): Promise<{ inviteLink: string; svg: string }> {
    if (!this.dc) throw new Error("Client not started");
    const [inviteLink, svg] = await this.dc.rpc.getChatSecurejoinQrCodeSvg(
      this.accountId,
      chatId,
    );
    return { inviteLink, svg };
  }

  async acceptChat(chatId: number): Promise<void> {
    if (!this.dc) throw new Error("Client not started");
    await this.dc.rpc.acceptChat(this.accountId, chatId);
  }

  async sendFile(
    chatId: number,
    text: string | null,
    filePath: string,
    filename?: string,
  ): Promise<number> {
    if (!this.dc) throw new Error("Client not started");
    return this.dc.rpc.sendMsg(this.accountId, chatId, {
      text: text ?? null,
      html: null,
      viewtype: null,
      file: filePath,
      filename: filename ?? null,
      location: null,
      overrideSenderName: null,
      quotedMessageId: null,
      quotedText: null,
    });
  }

  // --- Events ---

  onEvent(
    event: string,
    handler: (...args: unknown[]) => void,
  ): void {
    if (!this.dc) throw new Error("Client not started");
    // Use type assertion for event handling (the library's types are complex)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.dc as any).on(event, handler);
  }

  // --- Queries ---

  async getChatBySessionKey(sessionKey: string): Promise<number> {
    if (!this.dc) throw new Error("Client not started");

    const parsed = DeltaChatClient.parseSessionKey(sessionKey);
    if (!parsed) throw new Error(`Invalid session key: ${sessionKey}`);

    if (parsed.type === "group") {
      return parsed.chatId;
    }

    // DM: look up or create chat by email
    const contactId = await this.dc.rpc.lookupContactIdByAddr(
      this.accountId,
      parsed.email,
    );
    if (contactId === null) {
      // Create contact first
      const newContactId = await this.dc.rpc.createContact(
        this.accountId,
        parsed.email,
        null,
      );
      return this.dc.rpc.createChatByContactId(this.accountId, newContactId);
    }
    return this.dc.rpc.createChatByContactId(this.accountId, contactId);
  }

  async getContactEmail(contactId: number): Promise<string> {
    if (!this.dc) throw new Error("Client not started");
    const contact = await this.dc.rpc.getContact(this.accountId, contactId);
    return contact.address;
  }

  async isContactVerified(contactId: number): Promise<boolean> {
    if (!this.dc) throw new Error("Client not started");
    const contact = await this.dc.rpc.getContact(this.accountId, contactId);
    return contact.isVerified;
  }

  async getChatMembers(
    chatId: number,
  ): Promise<Array<{ email: string; name: string }>> {
    if (!this.dc) throw new Error("Client not started");
    const contactIds = await this.dc.rpc.getChatContacts(
      this.accountId,
      chatId,
    );
    const members: Array<{ email: string; name: string }> = [];
    for (const id of contactIds) {
      if (id === C.DC_CONTACT_ID_SELF) continue;
      const contact = await this.dc.rpc.getContact(this.accountId, id);
      members.push({ email: contact.address, name: contact.displayName });
    }
    return members;
  }

  async getChatInfo(chatId: number): Promise<T.FullChat> {
    if (!this.dc) throw new Error("Client not started");
    return this.dc.rpc.getFullChatById(this.accountId, chatId);
  }

  /**
   * Get the SecureJoin invite link and QR code SVG for this bot.
   * Users can scan the QR code or open the invite link in Delta Chat
   * to establish a verified, encrypted connection with the bot.
   */
  async getSecureJoinInvite(): Promise<{ inviteLink: string; svg: string }> {
    if (!this.dc) throw new Error("Client not started");
    const [inviteLink, svg] = await this.dc.rpc.getChatSecurejoinQrCodeSvg(
      this.accountId,
      null,
    );
    return { inviteLink, svg };
  }

  /**
   * Check if the current account is a chatmail account.
   */
  async isChatmailAccount(): Promise<boolean> {
    if (!this.dc) throw new Error("Client not started");
    // isChatmail may not be available in all client versions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rpc = this.dc.rpc as any;
    if (typeof rpc.isChatmail === "function") {
      return rpc.isChatmail(this.accountId) as Promise<boolean>;
    }
    // Fallback: assume chatmail if using auto-created account without explicit email
    return !this.config.email || this.config.email === "auto" || 
           (this.config.customChatmailRelay?.enabled ?? false);
  }

  // --- Private ---

  private resolveDataDir(): string {
    const dir = this.config.dataDir;
    if (dir.split(/[\\/]/).some((segment) => segment === "..")) {
      throw new Error(`dataDir cannot contain '..' path components: ${dir}`);
    }
    let resolved = dir.startsWith("~") ? dir.replace("~", homedir()) : dir;
    resolved = resolve(resolved);
    return resolved;
  }

  private resolveAvatarPath(): string | null {
    if (!this.config.avatarPath) return null;
    let path = this.config.avatarPath;
    if (path.split(/[\\/]/).some((segment) => segment === "..")) {
      console.error(
        `[deltachat] avatarPath cannot contain '..' path components: ${path}`,
      );
      return null;
    }
    if (path.startsWith("~")) {
      path = path.replace("~", homedir());
    }
    path = resolve(path);
    // Validate file exists (async check can't run in sync context, so we do
    // a fire-and-forget warning)
    access(path).catch(() => {
      console.warn(`[deltachat] Avatar file not found or unreadable: ${path}`);
    });
    return path;
  }

  private async configureAccount(): Promise<void> {
    if (!this.dc) throw new Error("Client not started");

    const accounts = await this.dc.rpc.getAllAccountIds();

    if (accounts.length > 0) {
      this.accountId = accounts[0];

      // Check if already configured (has a working account)
      const isConfigured = await this.dc.rpc.isConfigured(this.accountId);
      if (isConfigured) {
        // Just update display name and bot settings
        const avatarPath = this.resolveAvatarPath();
        await this.dc.rpc.batchSetConfig(this.accountId, {
          bot: "1",
          show_emails: "2",
          displayname: this.config.displayName,
          selfavatar: avatarPath,
        });
        const addr = await this.dc.rpc.getConfig(this.accountId, "addr");
        console.log(`[deltachat] Using existing account: ${addr}`);
        if (avatarPath) {
          console.log(`[deltachat] Avatar set to: ${avatarPath}`);
        }
        return;
      }

      // Account exists but not configured — remove and start fresh
      await this.dc.rpc.removeAccount(this.accountId);
    }

    await this.createAccount();
  }

  private async createAccount(): Promise<void> {
    if (!this.dc) throw new Error("Client not started");

    this.accountId = await this.dc.rpc.addAccount();

    if (this.config.email && this.config.password) {
      // Use explicit credentials (e.g. for a regular IMAP account)
      console.log(`[deltachat] Configuring account with ${this.config.email}`);
      const avatarPathExplicit = this.resolveAvatarPath();
      await this.dc.rpc.batchSetConfig(this.accountId, {
        bot: "1",
        show_emails: "2",
        displayname: this.config.displayName,
        selfavatar: avatarPathExplicit,
      });
      const transport: Record<string, unknown> = {
        addr: this.config.email,
        imapServer: null,
        imapPort: null,
        imapSecurity: null,
        imapUser: null,
        smtpServer: null,
        smtpPort: null,
        smtpSecurity: null,
        smtpUser: null,
        smtpPassword: null,
        certificateChecks: null,
        oauth2: null,
      };
      if (this.config.password) {
        const pwdKey = "password";
        transport[pwdKey] = this.config.password;
      }
      await this.dc.rpc.addOrUpdateTransport(this.accountId, transport as any);
      await this.dc.rpc.configure(this.accountId);
      const addr = await this.dc.rpc.getConfig(this.accountId, "addr");
      console.log(`[deltachat] Configured account: ${addr}`);
    } else if (
      this.config.customChatmailRelay?.enabled &&
      this.config.customChatmailRelay.url
    ) {
      // Use custom chatmail relay
      console.log(
        `[deltachat] Creating account via custom chatmail relay: ${this.config.customChatmailRelay.url}`,
      );
      await this.createAccountViaCustomRelay();
    } else {
      // Auto-create a chatmail account on the default or configured server
      const server = this.config.chatmailServer;
      const chatmailUrl = `DCACCOUNT:https://${server}/new`;
      console.log(`[deltachat] Creating chatmail account on ${server}`);
      await this.dc.rpc.setConfigFromQr(this.accountId, chatmailUrl);
      const avatarPathChatmail = this.resolveAvatarPath();
      await this.dc.rpc.batchSetConfig(this.accountId, {
        bot: "1",
        show_emails: "2",
        displayname: this.config.displayName,
        selfavatar: avatarPathChatmail,
      });
      await this.dc.rpc.configure(this.accountId);
      const addr = await this.dc.rpc.getConfig(this.accountId, "addr");
      console.log(`[deltachat] Created chatmail account: ${addr}`);
      if (avatarPathChatmail) {
        console.log(`[deltachat] Avatar set to: ${avatarPathChatmail}`);
      }
    }
  }

  /**
   * Create an account via a custom chatmail relay.
   * This sends a request to the relay's /new endpoint and configures
   * the account with the returned credentials.
   */
  private async createAccountViaCustomRelay(): Promise<void> {
    if (!this.dc) throw new Error("Client not started");

    const relay = this.config.customChatmailRelay!;
    const url = relay.url!;

    // Build the account creation URL with optional token
    const accountUrl = new URL(url);
    if (relay.token) {
      accountUrl.searchParams.set("token", relay.token);
    }

    try {
      // Fetch account credentials from the custom relay
      const response = await fetch(accountUrl.toString(), {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Custom chatmail relay returned ${response.status}: ${errorText}`,
        );
      }

      const data = (await response.json()) as {
        email?: string;
        password?: string;
        error?: string;
      };

      if (data.error) {
        throw new Error(`Custom chatmail relay error: ${data.error}`);
      }

      if (!data.email || !data.password) {
        throw new Error(
          "Custom chatmail relay did not return email and password",
        );
      }

      console.log(
        `[deltachat] Got account from custom relay: ${data.email}`,
      );

      // Configure the account with the credentials from the relay
      const avatarPathRelay = this.resolveAvatarPath();
      await this.dc.rpc.batchSetConfig(this.accountId, {
        bot: "1",
        show_emails: "2",
        displayname: this.config.displayName,
        selfavatar: avatarPathRelay,
      });
      const transport: Record<string, unknown> = {
        addr: data.email,
        imapServer: null,
        imapPort: null,
        imapSecurity: null,
        imapUser: null,
        smtpServer: null,
        smtpPort: null,
        smtpSecurity: null,
        smtpUser: null,
        smtpPassword: null,
        certificateChecks: null,
        oauth2: null,
      };
      if (data.password) {
        const pwdKey = "password";
        transport[pwdKey] = data.password;
      }
      await this.dc.rpc.addOrUpdateTransport(this.accountId, transport as any);
      await this.dc.rpc.configure(this.accountId);

      console.log(`[deltachat] Configured custom relay account: ${data.email}`);
    } catch (err) {
      console.error(
        `[deltachat] Failed to create account via custom relay: ${err}`,
      );
      throw err;
    }
  }

  private handleServerExit(code: number | null): void {
    if (!this.running) return; // Expected shutdown

    console.error(`[deltachat] rpc-server exited with code ${code}`);

    // Clean up old handles before attempting respawn to avoid leaking
    // file descriptors and memory.
    this.dc?.close();
    if (this.server && !this.server.killed) {
      this.server.kill();
    }
    this.dc = null;
    this.server = null;

    const now = Date.now();
    this.crashTimes.push(now);
    // Only count crashes within the last 60 seconds
    this.crashTimes = this.crashTimes.filter((t) => now - t < 60_000);

    if (this.crashTimes.length >= 3) {
      console.error("[deltachat] Too many crashes, disabling plugin");
      this.running = false;
      return;
    }

    console.error("[deltachat] Attempting respawn in 5 seconds...");
    setTimeout(() => {
      if (this.running) {
        this.start().catch((err) => {
          console.error("[deltachat] Respawn failed:", err);
        });
      }
    }, 5000);
  }
}
