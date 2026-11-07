const fs = require('node:fs');
const path = require('node:path');

const {
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlags,
    PermissionFlagsBits
} = require('discord.js');

// ======================================================
// CONFIGURAÇÕES
// ======================================================

const CHANNEL_ID = '1568364484098269194';

const LOG_CHANNEL_ID =
    process.env.NIXFF_LOG_CHANNEL_ID || null;

const API_BASE =
    (process.env.NIXFF_API_URL || 'https://salas.nixbot.vip')
        .replace(/\/+$/, '');

const API_KEY =
    process.env.NIXFF_API_KEY ||
    process.env.NIX_API_TOKEN;

const CREATE_PATH =
    process.env.NIXFF_CREATE_PATH || '/rooms/create';

const FILE = path.join(
    __dirname,
    '..',
    'data',
    'freefire.json'
);

// ======================================================
// BANCO DE DADOS
// ======================================================

function estruturaInicial() {
    return {
        nextId: 1,
        matches: {},
        players: {}
    };
}

function readDB() {
    try {
        const pasta = path.dirname(FILE);

        if (!fs.existsSync(pasta)) {
            fs.mkdirSync(pasta, { recursive: true });
        }

        if (!fs.existsSync(FILE)) {
            fs.writeFileSync(
                FILE,
                JSON.stringify(estruturaInicial(), null, 2),
                'utf8'
            );
        }

        const dados = JSON.parse(
            fs.readFileSync(FILE, 'utf8')
        );

        return {
            nextId: Number(dados.nextId) || 1,
            matches: dados.matches || {},
            players: dados.players || {}
        };
    } catch (erro) {
        console.error('[FREE FIRE] Erro ao ler banco:', erro);

        return estruturaInicial();
    }
}

function saveDB(db) {
    try {
        const pasta = path.dirname(FILE);

        if (!fs.existsSync(pasta)) {
            fs.mkdirSync(pasta, { recursive: true });
        }

        const temporario = `${FILE}.tmp`;

        fs.writeFileSync(
            temporario,
            JSON.stringify(db, null, 2),
            'utf8'
        );

        fs.renameSync(temporario, FILE);

        return true;
    } catch (erro) {
        console.error('[FREE FIRE] Erro ao salvar banco:', erro);
        return false;
    }
}

// ======================================================
// PERMISSÕES E CANAL
// ======================================================

function isFreeFireChannel(interaction) {
    return interaction?.channelId === CHANNEL_ID;
}

function isAdmin(membro) {
    if (!membro) return false;

    return Boolean(
        membro.permissions?.has(
            PermissionFlagsBits.Administrator
        ) ||
        membro.permissions?.has(
            PermissionFlagsBits.ManageGuild
        )
    );
}

// ======================================================
// CONTAINERS V2
// ======================================================

function makeContainer(content) {
    return new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                String(content || ' ')
            )
        );
}

async function sendContainer(canal, content) {
    if (!canal?.isTextBased()) {
        throw new Error('Canal inválido para enviar mensagem.');
    }

    return canal.send({
        components: [
            makeContainer(content)
        ],
        flags: MessageFlags.IsComponentsV2
    });
}

async function sendLog(guild, content) {
    if (!guild || !LOG_CHANNEL_ID) return null;

    try {
        const canal = await guild.channels
            .fetch(LOG_CHANNEL_ID)
            .catch(() => null);

        if (!canal?.isTextBased()) return null;

        return sendContainer(canal, content);
    } catch (erro) {
        console.error('[FREE FIRE] Erro ao enviar log:', erro);
        return null;
    }
}

// ======================================================
// REQUISIÇÕES NIXFF
// ======================================================

class NixFFError extends Error {
    constructor(message, status, data) {
        super(message);

        this.name = 'NixFFError';
        this.status = status;
        this.data = data;

        this.publicMessage =
            data?.message ||
            data?.error ||
            message;
    }
}

async function nixRequest(endpoint, options = {}) {
    if (!API_KEY) {
        throw new Error(
            'Configure NIXFF_API_KEY ou NIX_API_TOKEN nas variáveis de ambiente.'
        );
    }

    const rota = endpoint.startsWith('/')
        ? endpoint
        : `/${endpoint}`;

    const url = `${API_BASE}${rota}`;

    const controller = new AbortController();

    const timeout = setTimeout(
        () => controller.abort(),
        30000
    );

    try {
        const resposta = await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: {
                Authorization: `Bearer ${API_KEY}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
                ...options.headers
            }
        });

        const texto = await resposta.text();

        let dados = {};

        try {
            dados = texto ? JSON.parse(texto) : {};
        } catch {
            dados = {
                message: texto
            };
        }

        if (!resposta.ok) {
            const mensagens = {
                401: 'A chave de acesso da NixFF é inválida.',
                403: 'A NixFF recusou a autorização.',
                404: 'A sala ou sessão não foi encontrada na NixFF.',
                405: 'A rota ou o método da API NixFF não é permitido.',
                409: 'A operação não pode ser realizada no estado atual da sala.',
                422: 'A NixFF recusou os dados enviados.',
                429: 'Limite de requisições da NixFF atingido.',
                503: 'A NixFF está temporariamente indisponível.'
            };

            throw new NixFFError(
                mensagens[resposta.status] ||
                dados.message ||
                dados.error ||
                `Erro HTTP ${resposta.status} na NixFF.`,
                resposta.status,
                dados
            );
        }

        return dados;
    } catch (erro) {
        if (erro.name === 'AbortError') {
            throw new Error('A NixFF demorou demais para responder.');
        }

        throw erro;
    } finally {
        clearTimeout(timeout);
    }
}

// ======================================================
// GERAÇÃO DA SENHA NUMÉRICA
// ======================================================

function generateRoomPassword() {
    return String(
        Math.floor(Math.random() * 100)
    ).padStart(2, '0');
}

// ======================================================
// CRIAÇÃO DE SALA
// ======================================================

async function createNixRoom(config = {}) {
    const password =
        config.password || generateRoomPassword();

    const payload = {
        password,
        config_type: 'ap_padrao',
        start_delay_minutes: 5
    };

    if (config.map_name) {
        payload.map_name = config.map_name;
    }

    return nixRequest(CREATE_PATH, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}

// ======================================================
// INICIAR SALA
// ======================================================

async function startNixRoom(sessionId) {
    if (!sessionId) {
        throw new Error('session_id não informado.');
    }

    return nixRequest(
        `/rooms/${encodeURIComponent(sessionId)}/start`,
        {
            method: 'POST',
            body: JSON.stringify({})
        }
    );
}

// ======================================================
// CONSULTAR SALA
// ======================================================

async function getNixRoom(sessionId) {
    if (!sessionId) {
        throw new Error('session_id não informado.');
    }

    return nixRequest(
        `/rooms/${encodeURIComponent(sessionId)}`,
        {
            method: 'GET'
        }
    );
}

// ======================================================
// CONSULTAR JOGADORES
// ======================================================

async function getNixMembers(sessionId) {
    if (!sessionId) {
        throw new Error('session_id não informado.');
    }

    return nixRequest(
        `/rooms/${encodeURIComponent(sessionId)}/members`,
        {
            method: 'GET'
        }
    );
}

// ======================================================
// CONSULTAR RESULTADO
// ======================================================

async function getNixResult(sessionId) {
    if (!sessionId) {
        throw new Error('session_id não informado.');
    }

    return nixRequest(
        `/rooms/${encodeURIComponent(sessionId)}/result`,
        {
            method: 'GET'
        }
    );
}

// ======================================================
// LIBERAR SALA
// ======================================================

async function releaseNixRoom(sessionId) {
    if (!sessionId) {
        throw new Error('session_id não informado.');
    }

    return nixRequest(
        `/rooms/${encodeURIComponent(sessionId)}/release`,
        {
            method: 'POST',
            body: JSON.stringify({})
        }
    );
}

// ======================================================
// PERFIL DOS JOGADORES
// ======================================================

function getPlayer(userId) {
    const db = readDB();

    if (!db.players[userId]) {
        db.players[userId] = {
            userId,
            wins: 0,
            losses: 0,
            draws: 0,
            points: 0,
            kills: 0,
            matches: 0,
            winStreak: 0,
            bestWinStreak: 0,
            history: [],
            createdAt: new Date().toISOString()
        };

        saveDB(db);
    }

    return db.players[userId];
}

function addHistory(userId, registro) {
    const db = readDB();

    if (!db.players[userId]) {
        db.players[userId] = {
            userId,
            wins: 0,
            losses: 0,
            draws: 0,
            points: 0,
            kills: 0,
            matches: 0,
            winStreak: 0,
            bestWinStreak: 0,
            history: []
        };
    }

    const jogador = db.players[userId];

    if (!Array.isArray(jogador.history)) {
        jogador.history = [];
    }

    jogador.history.unshift({
        ...registro,
        date: new Date().toISOString()
    });

    jogador.history = jogador.history.slice(0, 50);

    saveDB(db);

    return jogador;
}

// ======================================================
// REGISTRAR VITÓRIA
// ======================================================

function applyWin(userId, matchId, detalhes = {}) {
    const db = readDB();

    if (!db.players[userId]) {
        db.players[userId] = {
            userId,
            wins: 0,
            losses: 0,
            draws: 0,
            points: 0,
            kills: 0,
            matches: 0,
            winStreak: 0,
            bestWinStreak: 0,
            history: []
        };
    }

    const jogador = db.players[userId];

    if (!Array.isArray(jogador.history)) {
        jogador.history = [];
    }

    const jaRegistrada = jogador.history.some(
        registro => String(registro.matchId) === String(matchId)
    );

    if (jaRegistrada) {
        return jogador;
    }

    jogador.wins = (jogador.wins || 0) + 1;
    jogador.matches = (jogador.matches || 0) + 1;
    jogador.points = (jogador.points || 0) + 3;

    jogador.winStreak = (jogador.winStreak || 0) + 1;

    jogador.bestWinStreak = Math.max(
        jogador.bestWinStreak || 0,
        jogador.winStreak
    );

    jogador.history.unshift({
        matchId,
        result: 'win',
        points: 3,
        details: detalhes,
        date: new Date().toISOString()
    });

    jogador.history = jogador.history.slice(0, 50);

    saveDB(db);

    return jogador;
}

// ======================================================
// REGISTRAR DERROTA
// ======================================================

function applyLoss(userId, matchId, detalhes = {}) {
    const db = readDB();

    if (!db.players[userId]) {
        db.players[userId] = {
            userId,
            wins: 0,
            losses: 0,
            draws: 0,
            points: 0,
            kills: 0,
            matches: 0,
            winStreak: 0,
            bestWinStreak: 0,
            history: []
        };
    }

    const jogador = db.players[userId];

    if (!Array.isArray(jogador.history)) {
        jogador.history = [];
    }

    const jaRegistrada = jogador.history.some(
        registro => String(registro.matchId) === String(matchId)
    );

    if (jaRegistrada) {
        return jogador;
    }

    jogador.losses = (jogador.losses || 0) + 1;
    jogador.matches = (jogador.matches || 0) + 1;
    jogador.winStreak = 0;

    jogador.history.unshift({
        matchId,
        result: 'loss',
        points: 0,
        details: detalhes,
        date: new Date().toISOString()
    });

    jogador.history = jogador.history.slice(0, 50);

    saveDB(db);

    return jogador;
}

// ======================================================
// REGISTRAR EMPATE
// ======================================================

function applyDraw(userId, matchId, detalhes = {}) {
    const db = readDB();

    if (!db.players[userId]) {
        db.players[userId] = {
            userId,
            wins: 0,
            losses: 0,
            draws: 0,
            points: 0,
            kills: 0,
            matches: 0,
            winStreak: 0,
            bestWinStreak: 0,
            history: []
        };
    }

    const jogador = db.players[userId];

    if (!Array.isArray(jogador.history)) {
        jogador.history = [];
    }

    const jaRegistrada = jogador.history.some(
        registro => String(registro.matchId) === String(matchId)
    );

    if (jaRegistrada) {
        return jogador;
    }

    jogador.draws = (jogador.draws || 0) + 1;
    jogador.matches = (jogador.matches || 0) + 1;
    jogador.points = (jogador.points || 0) + 1;
    jogador.winStreak = 0;

    jogador.history.unshift({
        matchId,
        result: 'draw',
        points: 1,
        details: detalhes,
        date: new Date().toISOString()
    });

    jogador.history = jogador.history.slice(0, 50);

    saveDB(db);

    return jogador;
}

// ======================================================
// EXPORTAÇÕES
// ======================================================

module.exports = {
    CHANNEL_ID,
    LOG_CHANNEL_ID,
    FILE,

    readDB,
    saveDB,

    isAdmin,
    isFreeFireChannel,

    makeContainer,
    sendContainer,
    sendLog,

    getPlayer,
    addHistory,

    applyWin,
    applyLoss,
    applyDraw,

    generateRoomPassword,

    createNixRoom,
    startNixRoom,
    getNixRoom,
    getNixMembers,
    getNixResult,
    releaseNixRoom
};
