const fs = require('node:fs');
const path = require('node:path');
const {
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlags
} = require('discord.js');

const CHANNEL_ID = '1568364484098269194';
const LOG_CHANNEL_ID = '1559889239192240128';
const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'freefire.json');
const ADMIN_PERMISSION = 'Administrator';

const NIX_API_BASE = 'https://salas.nixbot.vip';

function generateRoomPassword() {
    return String(Math.floor(Math.random() * 100)).padStart(2, '0');
}

async function nixRequest(route, options = {}) {
    const token = process.env.NIX_API_TOKEN;
    if (!token) {
        const error = new Error('A variável NIX_API_TOKEN não está configurada.');
        error.publicMessage = 'A integração NixFF ainda não está configurada. A equipe precisa adicionar NIX_API_TOKEN nas variáveis de ambiente da hospedagem.';
        throw error;
    }

    const response = await fetch(`${NIX_API_BASE}${route}`, {
        method: options.method || 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: options.body ? JSON.stringify(options.body) : undefined
    });

    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { detail: raw }; }

    if (!response.ok) {
        const error = new Error(data.detail || `NixFF respondeu HTTP ${response.status}`);
        error.status = response.status;
        error.retryAfter = Number(response.headers.get('retry-after')) || 0;
        error.publicMessage = response.status === 401 || response.status === 403
            ? 'O token NixFF foi recusado. Confira a variável NIX_API_TOKEN na hospedagem.'
            : response.status === 429
                ? `A API NixFF está temporariamente limitada. Aguarde ${error.retryAfter || 60} segundos e tente novamente.`
                : `A API NixFF não conseguiu criar a sala (HTTP ${response.status}). Tente novamente mais tarde.`;
        throw error;
    }

    return data;
}

async function createNixRoom(body) {
    return nixRequest('/rooms', { method: 'POST', body });
}

async function startNixRoom(sessionId) {
    return nixRequest(`/rooms/${encodeURIComponent(sessionId)}/start`, { method: 'POST', body: {} });
}

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({
    nextId: 1, matches: {}, players: {}
}, null, 2));

function readDB() {
    try {
        const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        return {
            nextId: Number(data.nextId) || 1,
            matches: data.matches || {},
            players: data.players || {}
        };
    } catch {
        return { nextId: 1, matches: {}, players: {} };
    }
}
function saveDB(db) {
    fs.writeFileSync(FILE, JSON.stringify(db, null, 2), 'utf8');
}
function isAdmin(member) {
    return Boolean(member?.permissions?.has(ADMIN_PERMISSION));
}
function isFreeFireChannel(interactionOrMessage) {
    return interactionOrMessage.channelId === CHANNEL_ID;
}
function makeContainer(content) {
    return new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(content)
    );
}
async function sendContainer(channel, content) {
    return channel.send({
        components: [makeContainer(content)],
        flags: MessageFlags.IsComponentsV2
    });
}
async function sendLog(guild, content) {
    const channel = await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (channel?.isTextBased()) await sendContainer(channel, content);
}
function getPlayer(db, id) {
    if (!db.players[id]) {
        db.players[id] = {
            wins: 0, losses: 0, wo: 0, points: 0,
            streak: 0, bestStreak: 0, matches: 0, history: []
        };
    }
    return db.players[id];
}
function addHistory(player, item) {
    player.history.unshift(item);
    player.history = player.history.slice(0, 30);
}
function applyWin(db, winnerId, loserId, match, guild) {
    const winner = getPlayer(db, winnerId);
    const loser = getPlayer(db, loserId);
    winner.wins++;
    winner.matches++;
    winner.points++;
    winner.streak++;
    winner.bestStreak = Math.max(winner.bestStreak, winner.streak);
    let bonus = 0;
    if (winner.streak >= 5 && winner.streak % 5 === 0) {
        bonus = winner.streak;
        winner.points += bonus;
    }
    loser.losses++;
    loser.matches++;
    loser.streak = 0;
    const timestamp = new Date().toISOString();
    addHistory(winner, {
        matchId: match.id, result: 'Vitória', points: 1 + bonus,
        bonus, opponentId: loserId, date: timestamp
    });
    addHistory(loser, {
        matchId: match.id, result: 'Derrota', points: 0,
        opponentId: winnerId, date: timestamp
    });
    match.status = 'finished';
    match.winnerId = winnerId;
    match.loserId = loserId;
    match.finishedAt = timestamp;
    match.pointsAwarded = true;
    saveDB(db);
    return { bonus, winner, loser };
}
module.exports = {
    CHANNEL_ID, LOG_CHANNEL_ID, FILE, readDB, saveDB, isAdmin,
    isFreeFireChannel, makeContainer, sendContainer, sendLog,
    getPlayer, addHistory, applyWin,
    generateRoomPassword, createNixRoom, startNixRoom
};
