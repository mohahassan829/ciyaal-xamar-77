import { EmbedBuilder } from 'discord.js';

export const config = {
    prefix: '!',
    colors: {
        success: 0x00FF00,
        error: 0xFF0000,
        info: 0x00AAFF,
        jail: 0x555555,
        economy: 0xFFD700
    },
    taxInterval: 3 * 24 * 60 * 60 * 1000, // 3 days in ms
    taxAmount: 250
};

export const parseAmount = (amountStr, currentBalance) => {
    if (amountStr.toLowerCase() === 'all') return currentBalance;
    const amount = parseInt(amountStr);
    if (isNaN(amount) || amount <= 0) return null;
    return amount;
};

export const createEmbed = (title, description, color = config.colors.info) => {
    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setTimestamp();
};

export const formatTime = (ms) => {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    
    let parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
    return parts.join(' ');
};
