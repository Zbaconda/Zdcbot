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
    getPlayer, addHistory, applyWin
};
