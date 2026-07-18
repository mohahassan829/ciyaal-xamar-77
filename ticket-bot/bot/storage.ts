import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const CONFIG_FILE = path.join(DATA_DIR, "guild-configs.json");
const TICKETS_FILE = path.join(DATA_DIR, "tickets.json");

export interface GuildConfig {
  openCategoryId: string;
  closedCategoryId: string;
  staffRoleIds: string[];
  embedTitle: string;
  embedDescription: string;
  embedImage?: string;
  setupDone: boolean;
}

export interface TicketData {
  channelId: string;
  userId: string;
  guildId: string;
  claimedBy?: string;
  createdAt: number;
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJSON<T>(file: string, defaultVal: T): T {
  ensureDir();
  if (!fs.existsSync(file)) return defaultVal;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return defaultVal;
  }
}

function writeJSON(file: string, data: unknown) {
  ensureDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

// ─── Guild Config ─────────────────────────────────────────────────────────────

export function getGuildConfig(guildId: string): GuildConfig | null {
  const all = readJSON<Record<string, GuildConfig>>(CONFIG_FILE, {});
  return all[guildId] ?? null;
}

export function saveGuildConfig(guildId: string, config: GuildConfig) {
  const all = readJSON<Record<string, GuildConfig>>(CONFIG_FILE, {});
  all[guildId] = config;
  writeJSON(CONFIG_FILE, all);
}

// ─── Tickets ──────────────────────────────────────────────────────────────────

interface TicketsData {
  byChannel: Record<string, TicketData>;      // channelId -> ticket
  byUser: Record<string, string>;             // `${guildId}:${userId}` -> channelId
}

function readTickets(): TicketsData {
  return readJSON<TicketsData>(TICKETS_FILE, { byChannel: {}, byUser: {} });
}

function writeTickets(data: TicketsData) {
  writeJSON(TICKETS_FILE, data);
}

export function getUserOpenTicket(guildId: string, userId: string): TicketData | null {
  const data = readTickets();
  const channelId = data.byUser[`${guildId}:${userId}`];
  if (!channelId) return null;
  return data.byChannel[channelId] ?? null;
}

export function saveTicket(ticket: TicketData) {
  const data = readTickets();
  data.byChannel[ticket.channelId] = ticket;
  data.byUser[`${ticket.guildId}:${ticket.userId}`] = ticket.channelId;
  writeTickets(data);
}

export function getTicketByChannel(channelId: string): TicketData | null {
  const data = readTickets();
  return data.byChannel[channelId] ?? null;
}

export function updateTicket(channelId: string, updates: Partial<TicketData>) {
  const data = readTickets();
  if (!data.byChannel[channelId]) return;
  data.byChannel[channelId] = { ...data.byChannel[channelId], ...updates };
  writeTickets(data);
}

export function removeTicket(channelId: string) {
  const data = readTickets();
  const ticket = data.byChannel[channelId];
  if (!ticket) return;
  delete data.byChannel[channelId];
  delete data.byUser[`${ticket.guildId}:${ticket.userId}`];
  writeTickets(data);
}
