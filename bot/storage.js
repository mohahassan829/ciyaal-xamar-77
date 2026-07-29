import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const CONFIG_FILE = path.join(DATA_DIR, "guild-configs.json");
const TICKETS_FILE = path.join(DATA_DIR, "tickets.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJSON(file, defaultVal) {
  ensureDir();
  if (!fs.existsSync(file)) return defaultVal;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return defaultVal;
  }
}

function writeJSON(file, data) {
  ensureDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

// ─── Guild Config ─────────────────────────────────────────────────────────────

export function getGuildConfig(guildId) {
  const all = readJSON(CONFIG_FILE, {});
  return all[guildId] ?? null;
}

export function saveGuildConfig(guildId, config) {
  const all = readJSON(CONFIG_FILE, {});
  all[guildId] = config;
  writeJSON(CONFIG_FILE, all);
}

// ─── Tickets ──────────────────────────────────────────────────────────────────

function readTickets() {
  return readJSON(TICKETS_FILE, { byChannel: {}, byUser: {} });
}

function writeTickets(data) {
  writeJSON(TICKETS_FILE, data);
}

export function getUserOpenTicket(guildId, userId) {
  const data = readTickets();
  const channelId = data.byUser[`${guildId}:${userId}`];
  if (!channelId) return null;
  return data.byChannel[channelId] ?? null;
}

export function saveTicket(ticket) {
  const data = readTickets();
  data.byChannel[ticket.channelId] = ticket;
  data.byUser[`${ticket.guildId}:${ticket.userId}`] = ticket.channelId;
  writeTickets(data);
}

export function getTicketByChannel(channelId) {
  const data = readTickets();
  return data.byChannel[channelId] ?? null;
}

export function updateTicket(channelId, updates) {
  const data = readTickets();
  if (!data.byChannel[channelId]) return;
  data.byChannel[channelId] = { ...data.byChannel[channelId], ...updates };
  writeTickets(data);
}

export function removeTicket(channelId) {
  const data = readTickets();
  const ticket = data.byChannel[channelId];
  if (!ticket) return;
  delete data.byChannel[channelId];
  delete data.byUser[`${ticket.guildId}:${ticket.userId}`];
  writeTickets(data);
}
