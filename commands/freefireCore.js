// Node.js - CommonJS - discord.js v14
// Sistema Free Fire Zodíaco + integração NixFF

const fs = require('node:fs');
const path = require('node:path');

const {
    ContainerBuilder,
    TextDisplayBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} = require('discord.js');

const CHANNEL_ID = '1568364484098269194';
const LOG_CHANNEL_ID = '1559889239192240128';

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'freefire.json');

const NIX_API_BASE = 'https://salas.nixbot.vip';
const NIX_CREATE_PATH = process.env.NIXFF_CREATE_PATH || '/rooms';

const partidasIniciando = new Set();
const temporizadoresResultado = new Map();

function generateRoomPassword() {
    return String(Math.floor(Math.random() * 100)).padStart(2, '0');
}

function getNixToken() {
    return process.env.NIXFF_API_KEY || process.env.NIX_API_TOKEN;
}

async function nixRequest(route, options = {}) {
    const token = getNixToken();

    if (!token) {
        const error = new Error('Token NixFF não configurado.');
        error.publicMessage = 'Configure NIXFF_API_KEY nas variáveis de ambiente.';
        throw error;
    }

    const response = await fetch(`${NIX_API_BASE}${route}`, {
        method: options.method || 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: options.body !== undefined
            ? JSON.stringify(options.body)
            : undefined,
        signal: AbortSignal.timeout(30000)
    });

    const raw = await response.text();

    let data = {};

    try {
        data = raw ? JSON.parse(raw) : {};
    } catch {
        data = { detail: raw };
    }

    if (!response.ok) {
        const error = new Error(
            data.detail || `NixFF respondeu HTTP ${response.status}`
        );

        error.status = response.status;
        error.retryAfter =
            Number(response.headers.get('retry-after')) || 0;

        if (response.status === 401) {
            error.publicMessage = 'Token NixFF inválido. Confira sua API Key.';
        } else if (response.status === 403) {
            error.publicMessage = 'Sua API Key não possui permissão para essa ação.';
        } else if (response.status === 404) {
            error.publicMessage = 'A rota ou sessão não foi encontrada na NixFF.';
        } else if (response.status === 405) {
            error.publicMessage =
                `A NixFF não aceita esse método nessa rota (HTTP 405): ${route}`;
        } else if (response.status === 409) {
            error.publicMessage =
                'A ação não pode ser realizada no estado atual da sala.';
        } else if (response.status === 422) {
            error.publicMessage =
                `Configuração rejeitada pela NixFF: ${data.detail || 'Verifique os parâmetros.'}`;
        } else if (response.status === 429) {
            error.publicMessage =
                `Limite da NixFF atingido. Aguarde ${error.retryAfter || 60} segundos.`;
        } else if (response.status === 503) {
            error.publicMessage = 'A NixFF está temporariamente indisponível.';
        } else {
            error.publicMessage = `Erro na API NixFF: HTTP ${response.status}.`;
        }

        error.data = data;
        throw error;
    }

    return data;
}

// ======================================================
// API NIXFF
// ======================================================

async function createNixRoom(body) {
    return nixRequest(NIX_CREATE_PATH, {
        method: 'POST',
        body
    });
}

async function startNixRoom(sessionId) {
    if (!sessionId) {
        throw new Error('session_id não informado.');
    }

    return nixRequest(
        `/rooms/${encodeURIComponent(sessionId)}/start`,
        {
            method: 'POST',
            body: {}
        }
    );
}

async function getNixRoom(sessionId) {
    return nixRequest(
        `/rooms/${encodeURIComponent(sessionId)}`
    );
}

async function getNixMembers(sessionId) {
    return nixRequest(
        `/rooms/${encodeURIComponent(sessionId)}/members`
    );
}

async function getNixResult(sessionId) {
    return nixRequest(
        `/rooms/${encodeURIComponent(sessionId)}/result`
    );
}

async function releaseNixRoom(sessionId) {
    return nixRequest(
        `/rooms/${encodeURIComponent(sessionId)}/release`,
        {
            method: 'POST',
            body: {}
        }
    );
}

// ======================================================
// BANCO DE DADOS
// ======================================================

fs.mkdirSync(DATA_DIR, { recursive: true });

if (!fs.existsSync(FILE)) {
    fs.writeFileSync(
        FILE,
        JSON.stringify({
            nextId: 1,
            matches: {},
            players: {}
        }, null, 2)
    );
}

function readDB() {
    try {
        const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));

        return {
            nextId: Number(data.nextId) || 1,
            matches: data.matches || {},
            players: data.players || {}
        };
    } catch (error) {
        console.error('[FREE FIRE] Erro ao ler banco:', error);

        return {
            nextId: 1,
            matches: {},
            players: {}
        };
    }
}

function saveDB(db) {
    fs.writeFileSync(FILE, JSON.stringify(db, null, 2), 'utf8');
}

// ======================================================
// PERMISSÕES E CANAIS
// ======================================================

function isAdmin(member) {
    return Boolean(
        member?.permissions?.has('Administrator')
    );
}

function isFreeFireChannel(interactionOrMessage) {
    return interactionOrMessage?.channelId === CHANNEL_ID;
}

// ======================================================
// CONTAINERS
// ======================================================

function makeContainer(content) {
    return new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(content)
        );
}

async function sendContainer(channel, content) {
    if (!channel?.send) return null;

    return channel.send({
        components: [makeContainer(content)],
        flags: MessageFlags.IsComponentsV2
    });
}

async function sendLog(guild, content) {
    if (!guild) return;

    const channel = await guild.channels
        .fetch(LOG_CHANNEL_ID)
        .catch(() => null);

    if (channel?.isTextBased()) {
        await sendContainer(channel, content);
    }
}

async function responderContainer(interaction, content) {
    const payload = {
        components: [makeContainer(content)],
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    };

    if (interaction.replied || interaction.deferred) {
        return interaction.followUp(payload);
    }

    return interaction.reply(payload);
}

// ======================================================
// PAINEL DA PARTIDA
// ======================================================

function getStatusText(match) {
    if (match.status === 'waiting') {
        return 'Aguardando confirmação';
    }

    if (match.status === 'starting') {
        return 'Iniciando sala pela NixFF';
    }

    if (match.status === 'playing') {
        return 'Partida em andamento';
    }

    if (match.status === 'finished') {
        return 'Partida finalizada';
    }

    if (match.status === 'cancelled') {
        return 'Partida cancelada';
    }

    if (match.status === 'start_error') {
        return 'Falha ao iniciar a sala';
    }

    return match.status || 'Indefinido';
}

function makeMatchPanel(match) {
    const confirmados = Array.isArray(match.confirmations)
        ? match.confirmations
        : [];

    const texto =
        `# PARTIDA FREE FIRE\n\n` +
        `**Partida:** #${match.id}\n` +
        `**Formato:** 1v1\n\n` +
        `**Jogador 1:** <@${match.captain1Id}>\n` +
        `**Adversário:** <@${match.captain2Id}>\n\n` +
        `**ID da sala:** ${match.roomId}\n` +
        `**Senha:** ${match.password}\n` +
        `**Configuração:** AP Padrão\n\n` +
        `**Confirmações:** ${confirmados.length}/2\n` +
        `**Status:** ${getStatusText(match)}\n\n` +
        (match.status === 'waiting'
            ? 'Somente os dois participantes podem confirmar presença pelo botão ou enviando **GO** no chat.'
            : match.status === 'playing'
                ? 'A partida começou. O resultado será consultado automaticamente.'
                : match.status === 'finished'
                    ? 'O resultado desta partida já foi recebido.'
                    : '');

    const container = makeContainer(texto);

    const botoes = [];

    botoes.push(
        new ButtonBuilder()
            .setCustomId(`ff_confirm:${match.id}`)
            .setLabel('Confirmar presença')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success)
            .setDisabled(
                match.status !== 'waiting' ||
                confirmados.length >= 2
            ),

        new ButtonBuilder()
            .setCustomId(`ff_copy:${match.id}`)
            .setLabel('Copiar ID')
            .setEmoji('📋')
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(`ff_invite:${match.id}`)
            .setLabel('Convite da sala')
            .setEmoji('🔗')
            .setStyle(ButtonStyle.Secondary)
    );

    if (match.status === 'waiting') {
        botoes.push(
            new ButtonBuilder()
                .setCustomId(`ff_cancel:${match.id}`)
                .setLabel('Cancelar partida')
                .setEmoji('✖️')
                .setStyle(ButtonStyle.Danger)
        );
    }

    const row = new ActionRowBuilder().addComponents(botoes);

    return [container, row];
}

async function updateMatchPanel(client, match) {
    if (!match?.channelId || !match?.messageId) return;

    const channel = await client.channels
        .fetch(match.channelId)
        .catch(() => null);

    if (!channel?.messages) return;

    const message = await channel.messages
        .fetch(match.messageId)
        .catch(() => null);

    if (!message) return;

    await message.edit({
        components: makeMatchPanel(match)
    }).catch(error => {
        console.error('[FREE FIRE] Erro ao atualizar painel:', error);
    });
}

// ======================================================
// CRIAR PARTIDA E SALA
// ======================================================

async function createMatch({
    guild,
    channel,
    creator,
    adversary
}) {
    if (!guild || !channel || !creator || !adversary) {
        throw new Error('Dados insuficientes para criar a partida.');
    }

    if (creator.id === adversary.id || adversary.bot) {
        throw new Error('Escolha outro membro como adversário.');
    }

    if (channel.id !== CHANNEL_ID) {
        throw new Error(`Use este comando em <#${CHANNEL_ID}>.`);
    }

    const db = readDB();
    const id = String(db.nextId++);
    const password = generateRoomPassword();

    saveDB(db);

    const room = await createNixRoom({
        password,
        config_type: 'ap_padrao',
        start_delay_minutes: 5
    });

    if (
        !room ||
        !room.session_id ||
        room.room_id === undefined ||
        room.room_id === null
    ) {
        throw new Error(
            'A API NixFF não retornou os dados necessários da sala.'
        );
    }

    const match = {
        id,
        creatorId: creator.id,
        captain1Id: creator.id,
        captain2Id: adversary.id,
        adversaryId: adversary.id,

        map: 'Padrão',
        configType: 'ap_padrao',

        roomId: String(room.room_id),
        password: String(room.password || password),
        sessionId: room.session_id,

        inviteLink: room.invite_link || null,
        inviteCode: room.invite_code || null,

        status: 'waiting',
        confirmations: [],

        createdAt: new Date().toISOString(),
        startWarningSent: false,
        apiStatus: room.status || 'active',

        guildId: guild.id,
        channelId: channel.id,
        messageId: null,

        resultProcessed: false
    };

    db.matches[id] = match;
    saveDB(db);

    const message = await channel.send({
        components: makeMatchPanel(match),
        flags: MessageFlags.IsComponentsV2
    });

    match.messageId = message.id;

    const latest = readDB();
    latest.matches[id] = match;
    saveDB(latest);

    await sendLog(
        guild,
        `# SALA CRIADA\n\n` +
        `**Partida:** #${id}\n` +
        `**Criador:** <@${creator.id}>\n` +
        `**Adversário:** <@${adversary.id}>\n` +
        `**ID da sala:** ${match.roomId}\n` +
        `**Configuração:** AP Padrão\n` +
        `**Status:** Aguardando confirmação`
    );

    const timer = setTimeout(async () => {
        const currentDB = readDB();
        const current = currentDB.matches[id];

        if (
            !current ||
            current.status !== 'waiting' ||
            current.confirmations.length > 0 ||
            current.startWarningSent
        ) {
            return;
        }

        current.startWarningSent = true;
        saveDB(currentDB);

        await sendContainer(
            channel,
            `A partida #${id} ainda não recebeu confirmações. Os participantes podem usar o botão **Confirmar presença** ou enviar **GO**.`
        );
    }, 2 * 60 * 1000);

    timer.unref?.();

    console.log(
        `[FREE FIRE] Sala ${match.roomId} criada. Partida #${id}.`
    );

    return match;
}

// ======================================================
// CONFIRMAÇÃO E INÍCIO
// ======================================================

async function confirmMatch(client, channel, userId, matchId) {
    const db = readDB();

    let match;

    if (matchId) {
        match = db.matches[String(matchId)];
    } else {
        const pendentes = Object.values(db.matches).filter(item =>
            item.status === 'waiting' &&
            [item.captain1Id, item.captain2Id].includes(userId)
        );

        if (pendentes.length > 1) {
            return {
                ok: false,
                message:
                    'Você possui mais de uma partida aguardando confirmação. Use **GO #ID** ou responda à mensagem da partida com **GO**.'
            };
        }

        match = pendentes[0];
    }

    if (!match) {
        return {
            ok: false,
            message: 'Não encontrei uma partida aguardando sua confirmação.'
        };
    }

    if (![match.captain1Id, match.captain2Id].includes(userId)) {
        return {
            ok: false,
            message: 'Você não participa desta partida.'
        };
    }

    if (match.status !== 'waiting') {
        return {
            ok: false,
            message: `Esta partida não está aguardando confirmação. Status: ${getStatusText(match)}.`
        };
    }

    if (!Array.isArray(match.confirmations)) {
        match.confirmations = [];
    }

    if (match.confirmations.includes(userId)) {
    if (match.confirmations.length >= 2) {
        await startConfirmedMatch(client, match.id);
    }

    return {
        ok: true,
        duplicate: true,
        match,
        message: 'Sua presença já foi confirmada.'
    };
    }

    match.confirmations.push(userId);
    saveDB(db);

    await updateMatchPanel(client, match);

    if (match.confirmations.length >= 2) {
        await sendContainer(
            channel,
            `# CONFIRMAÇÕES COMPLETAS\n\n` +
            `Os dois participantes confirmaram a partida **#${match.id}**.\n` +
            `A NixFF está sendo acionada para iniciar a sala.`
        );

        await startConfirmedMatch(client, match.id);

        return {
            ok: true,
            started: true,
            match,
            message: 'Presença confirmada. Os dois jogadores confirmaram.'
        };
    }

    const outroId = match.captain1Id === userId
        ? match.captain2Id
        : match.captain1Id;

    await sendContainer(
        channel,
        `${`<@${userId}>`} confirmou presença na partida **#${match.id}**.\n` +
        `Agora falta somente <@${outroId}> confirmar.\n\n` +
        `**Confirmações: 1/2**`
    );

    return {
        ok: true,
        match,
        message: 'Presença confirmada. Falta o outro participante.'
    };
}

async function startConfirmedMatch(client, matchId) {
    const id = String(matchId);

    if (partidasIniciando.has(id)) return;

    const db = readDB();
    const match = db.matches[id];

    if (
        !match ||
        match.status !== 'waiting' ||
        !Array.isArray(match.confirmations) ||
        match.confirmations.length < 2
    ) {
        return;
    }

    partidasIniciando.add(id);

    match.status = 'starting';
    match.startingAt = new Date().toISOString();
    saveDB(db);

    await updateMatchPanel(client, match);

    try {
        const response = await startNixRoom(match.sessionId);

        const latest = readDB();
        const current = latest.matches[id];

        if (!current) return;

        current.status = 'playing';
        current.startedAt = new Date().toISOString();
        current.startResponse = response || null;
        current.lastPollAt = null;

        saveDB(latest);

        await updateMatchPanel(client, current);

        const channel = await client.channels
            .fetch(current.channelId || CHANNEL_ID)
            .catch(() => null);

        await sendContainer(
            channel,
            `# PARTIDA INICIADA\n\n` +
            `A NixFF confirmou o início da partida **#${id}**.\n` +
            `**ID da sala:** ${current.roomId}\n` +
            `**Jogadores:** <@${current.captain1Id}> e <@${current.captain2Id}>\n\n` +
            `O bot acompanhará o resultado automaticamente.`
        );

        await sendLog(
            channel?.guild,
            `# PARTIDA INICIADA\n\n` +
            `**Partida:** #${id}\n` +
            `**Sala:** ${current.roomId}\n` +
            `**Session:** ${current.sessionId}`
        );

        scheduleResultPoll(client, id, 10000);
    } catch (error) {
        console.error('[FREE FIRE] Erro ao iniciar sala:', error);

        const latest = readDB();
        const current = latest.matches[id];

        if (current) {
            current.status = 'waiting';
            current.startError = error.message;
            current.startingAt = null;
            saveDB(latest);

            await updateMatchPanel(client, current);

            const channel = await client.channels
                .fetch(current.channelId || CHANNEL_ID)
                .catch(() => null);

            await sendContainer(
                channel,
                `# NÃO FOI POSSÍVEL INICIAR\n\n` +
                `A NixFF não confirmou o início da partida **#${id}**.\n` +
                `${error.publicMessage || 'Verifique a integração com a NixFF.'}\n\n` +
                `As confirmações foram preservadas. O início poderá ser tentado novamente.`
            );
        }
    } finally {
        partidasIniciando.delete(id);
    }
}

// ======================================================
// CONSULTA AUTOMÁTICA DO RESULTADO
// ======================================================

function scheduleResultPoll(client, matchId, delay = 15000) {
    const id = String(matchId);

    if (temporizadoresResultado.has(id)) {
        clearTimeout(temporizadoresResultado.get(id));
    }

    const timer = setTimeout(() => {
        temporizadoresResultado.delete(id);
        pollMatchResult(client, id).catch(error => {
            console.error(`[FREE FIRE] Erro ao consultar partida #${id}:`, error);
            scheduleResultPoll(client, id, 30000);
        });
    }, Math.max(5000, Math.min(delay, 120000)));

    timer.unref?.();
    temporizadoresResultado.set(id, timer);
}

function unwrapResult(data) {
    if (!data || typeof data !== 'object') return {};

    if (data.result && typeof data.result === 'object') {
        return data.result;
    }

    if (data.data && typeof data.data === 'object') {
        return data.data;
    }

    return data;
}

function resultStatus(data) {
    const result = unwrapResult(data);

    return String(
        result.status ||
        result.state ||
        data?.status ||
        data?.state ||
        ''
    ).toLowerCase();
}

function isFinalResult(data) {
    const status = resultStatus(data);

    return [
        'finalizada',
        'finalizado',
        'finished',
        'completed',
        'complete',
        'ended',
        'concluida',
        'concluído'
    ].includes(status);
}

function isStillPlaying(data) {
    const status = resultStatus(data);

    return [
        'jogando',
        'playing',
        'in_progress',
        'running',
        'active'
    ].includes(status);
}

function getPollDelay(data) {
    const result = unwrapResult(data);

    const seconds = Number(
        result.poll_after_seconds ??
        data?.poll_after_seconds ??
        15
    );

    return Number.isFinite(seconds)
        ? Math.max(5, Math.min(seconds, 120)) * 1000
        : 15000;
}

async function pollMatchResult(client, matchId) {
    const db = readDB();
    const match = db.matches[String(matchId)];

    if (
        !match ||
        match.status !== 'playing' ||
        match.resultProcessed
    ) {
        return;
    }

    let result;

    try {
        result = await getNixResult(match.sessionId);
    } catch (error) {
        if (error.status === 404) {
            console.warn(
                `[FREE FIRE] Resultado ainda não disponível para #${matchId}.`
            );

            scheduleResultPoll(client, matchId, 20000);
            return;
        }

        if (error.status === 429) {
            scheduleResultPoll(
                client,
                matchId,
                Math.max(30000, (error.retryAfter || 30) * 1000)
            );
            return;
        }

        throw error;
    }

    const status = resultStatus(result);

    const latest = readDB();
    const current = latest.matches[String(matchId)];

    if (!current || current.status !== 'playing') return;

    current.lastPollAt = new Date().toISOString();
    current.lastResultStatus = status;
    saveDB(latest);

    if (isFinalResult(result)) {
        await finishMatch(client, current, result);
        return;
    }

    if (
        status === 'no_match' ||
        status === 'sem_partida' ||
        status === 'not_found'
    ) {
        const channel = await client.channels
            .fetch(current.channelId || CHANNEL_ID)
            .catch(() => null);

        await sendContainer(
            channel,
            `# RESULTADO INDISPONÍVEL\n\n` +
            `A NixFF informou que não há resultado disponível para a partida **#${matchId}**.`
        );

        return;
    }

    if (isStillPlaying(result) || !status) {
        scheduleResultPoll(
            client,
            matchId,
            getPollDelay(result)
        );

        return;
    }

    // Estado desconhecido: não declara vencedor nem encerra a partida.
    scheduleResultPoll(client, matchId, getPollDelay(result));
}

// ======================================================
// FORMATAR RESULTADO
// ======================================================

function getArrayFromResult(result, keys) {
    for (const key of keys) {
        if (Array.isArray(result?.[key])) {
            return result[key];
        }
    }

    return [];
}

function getPlayerName(player) {
    return (
        player.nickname ||
        player.name ||
        player.username ||
        player.player_name ||
        player.account_name ||
        `Jogador ${player.account_id || player.uid || ''}`
    );
}

function getPlayerKills(player) {
    const value = Number(
        player.kills ??
        player.kill ??
        player.total_kills ??
        player.eliminations ??
        0
    );

    return Number.isFinite(value) ? value : 0;
}

function formatTeam(team, index) {
    const players = Array.isArray(team.players)
        ? team.players
        : Array.isArray(team.members)
            ? team.members
            : [];

    const name =
        team.name ||
        team.team_name ||
        team.label ||
        `Time ${index + 1}`;

    const lines = players.map(player => {
        const mvp = player.mvp || player.is_mvp
            ? ' ⭐ **MVP**'
            : '';

        return `• ${getPlayerName(player)} — **${getPlayerKills(player)} abates**${mvp}`;
    });

    return `**${name}**\n${lines.length ? lines.join('\n') : 'Jogadores não informados.'}`;
}

function findMvp(result, teams) {
    if (result.mvp && typeof result.mvp === 'object') {
        return result.mvp;
    }

    if (result.mvp_player && typeof result.mvp_player === 'object') {
        return result.mvp_player;
    }

    for (const team of teams) {
        const players = Array.isArray(team.players)
            ? team.players
            : Array.isArray(team.members)
                ? team.members
                : [];

        const player = players.find(item => item.mvp || item.is_mvp);

        if (player) return player;
    }

    const players = getArrayFromResult(result, [
        'players',
        'members',
        'player_results'
    ]);

    return players.find(item => item.mvp || item.is_mvp) || null;
}

function findWinner(result, teams) {
    const winner =
        result.winner_team ||
        result.winner ||
        result.winning_team ||
        result.champion ||
        null;

    if (winner && typeof winner === 'object') {
        return (
            winner.name ||
            winner.team_name ||
            winner.id ||
            'Time vencedor'
        );
    }

    if (winner !== null) return String(winner);

    const winningTeam = teams.find(team =>
        team.winner === true ||
        team.is_winner === true ||
        team.placement === 1 ||
        team.position === 1 ||
        team.rank === 1
    );

    return winningTeam
        ? winningTeam.name || winningTeam.team_name || 'Time vencedor'
        : 'Não informado pela NixFF';
}

function formatDuration(result, match) {
    const seconds = Number(
        result.duration_seconds ??
        result.duration ??
        result.elapsed_seconds
    );

    if (Number.isFinite(seconds) && seconds > 0) {
        const minutes = Math.floor(seconds / 60);
        const remaining = Math.floor(seconds % 60);
        return `${minutes}min ${remaining}s`;
    }

    if (match.startedAt && match.finishedAt) {
        const total = Math.max(
            0,
            Math.floor(
                (new Date(match.finishedAt) - new Date(match.startedAt)) / 1000
            )
        );

        return `${Math.floor(total / 60)}min ${total % 60}s`;
    }

    return 'Não informada';
}

// ======================================================
// FINALIZAR PARTIDA
// ======================================================

async function finishMatch(client, match, rawResult) {
    const id = String(match.id);
    const db = readDB();
    const current = db.matches[id];

    if (!current || current.resultProcessed) return;

    const result = unwrapResult(rawResult);

    const teams = getArrayFromResult(result, [
        'teams',
        'team_results',
        'squads'
    ]);

    const mvp = findMvp(result, teams);
    const winner = findWinner(result, teams);

    current.status = 'finished';
    current.finishedAt = new Date().toISOString();
    current.resultProcessed = true;
    current.rawResult = result;

    saveDB(db);

    const teamTexts = teams.length
        ? teams.map((team, index) => formatTeam(team, index)).join('\n\n')
        : 'A NixFF não retornou a lista de jogadores por equipe.';

    const mvpText = mvp
        ? `${getPlayerName(mvp)} — **${getPlayerKills(mvp)} abates**`
        : 'Não informado pela NixFF.';

    const duration = formatDuration(result, current);

    const channel = await client.channels
        .fetch(current.channelId || CHANNEL_ID)
        .catch(() => null);

    await sendContainer(
        channel,
        `# RESULTADO DA PARTIDA\n\n` +
        `**Partida:** #${id}\n` +
        `**Sala:** ${current.roomId}\n` +
        `**Modo:** ${result.mode || result.game_mode || 'AP Padrão'}\n` +
        `**Duração:** ${duration}\n\n` +
        `## 🏆 Time vencedor\n${winner}\n\n` +
        `## Jogadores e abates\n${teamTexts}\n\n` +
        `## ⭐ MVP da partida\n${mvpText}\n\n` +
        `**Status:** Resultado final recebido da NixFF.`
    );

    await updateMatchPanel(client, current);

    await sendLog(
        channel?.guild,
        `# PARTIDA FINALIZADA\n\n` +
        `**Partida:** #${id}\n` +
        `**Vencedor:** ${winner}\n` +
        `**MVP:** ${mvpText}\n` +
        `**Sala:** ${current.roomId}\n` +
        `**Duração:** ${duration}`
    );

    console.log(`[FREE FIRE] Partida #${id} finalizada.`);
}

// ======================================================
// BOTÕES
// ======================================================

async function handleButton(interaction, client) {
    const [action, matchId] = interaction.customId.split(':');

    if (!matchId || !action.startsWith('ff_')) return false;

    const db = readDB();
    const match = db.matches[String(matchId)];

    if (!match) {
        await responderContainer(
            interaction,
            'Esta partida não foi encontrada no banco de dados.'
        );
        return true;
    }

    if (action === 'ff_confirm') {
        if (!isFreeFireChannel(interaction)) {
            await responderContainer(
                interaction,
                `Use esta confirmação em <#${CHANNEL_ID}>.`
            );
            return true;
        }

        const result = await confirmMatch(
            client,
            interaction.channel,
            interaction.user.id,
            matchId
        );

        await responderContainer(interaction, result.message);
        return true;
    }

    if (action === 'ff_copy') {
        await responderContainer(
            interaction,
            `# ID DA SALA\n\n\`${match.roomId}\``
        );
        return true;
    }

    if (action === 'ff_invite') {
        const invite = match.inviteLink
            ? `[Entrar na sala](${match.inviteLink})`
            : match.inviteCode
                ? `**Código de convite:** \`${match.inviteCode}\``
                : 'A NixFF não forneceu um link ou código de convite.';

        await responderContainer(
            interaction,
            `# CONVITE DA SALA\n\n${invite}`
        );
        return true;
    }

    if (action === 'ff_cancel') {
        if (![match.captain1Id, match.captain2Id].includes(interaction.user.id)) {
            await responderContainer(
                interaction,
                'Somente os participantes podem cancelar esta partida.'
            );
            return true;
        }

        if (match.status !== 'waiting') {
            await responderContainer(
                interaction,
                'Esta partida não pode mais ser cancelada pelo painel.'
            );
            return true;
        }

        await interaction.deferReply({
            flags: MessageFlags.Ephemeral
        });

        try {
            await releaseNixRoom(match.sessionId);

            const latest = readDB();
            const current = latest.matches[String(matchId)];

            if (current && current.status === 'waiting') {
                current.status = 'cancelled';
                current.cancelledAt = new Date().toISOString();
                saveDB(latest);

                await updateMatchPanel(client, current);
            }

            await responderContainer(
                interaction,
                `A partida **#${matchId}** foi cancelada e a sala foi liberada na NixFF.`
            );
        } catch (error) {
            await responderContainer(
                interaction,
                error.publicMessage || 'Não consegui cancelar a sala na NixFF.'
            );
        }

        return true;
    }

    return false;
}

// ======================================================
// MENSAGENS: GO E z?cs
// ======================================================

async function handleMessage(message, client) {
    if (
        !message ||
        message.author?.bot ||
        !message.guild ||
        message.channelId !== CHANNEL_ID
    ) {
        return false;
    }

    const text = message.content.trim();

    // Criar sala por prefixo: z?cs @adversário
    if (/^z\?cs(?:\s|$)/i.test(text)) {
        const mention = message.mentions.users.first();

        if (!mention) {
            await sendContainer(
                message.channel,
                `Para criar uma partida, use:\n\`z?cs @adversário\``
            );
            return true;
        }

        if (
            mention.bot ||
            mention.id === message.author.id
        ) {
            await sendContainer(
                message.channel,
                'Escolha outro membro como adversário.'
            );
            return true;
        }

        try {
            await sendContainer(
                message.channel,
                'Criando a sala pela NixFF...'
            );

            await createMatch({
                guild: message.guild,
                channel: message.channel,
                creator: message.author,
                adversary: mention
            });
        } catch (error) {
            console.error('[FREE FIRE] Erro no comando z?cs:', error);

            await sendContainer(
                message.channel,
                error.publicMessage ||
                error.message ||
                'Não consegui criar a sala.'
            );
        }

        return true;
    }

    // GO ou GO #ID
    const goMatch = text.match(/^go(?:\s+#?(\d+))?$/i);

    if (!goMatch) return false;

    let matchId = goMatch[1] || null;

    // Responder ao painel da partida com GO também identifica a partida.
    if (!matchId && message.reference?.messageId) {
        const db = readDB();

        const referenced = Object.values(db.matches).find(item =>
            item.messageId === message.reference.messageId
        );

        if (referenced) {
            matchId = referenced.id;
        }
    }

    const result = await confirmMatch(
        client,
        message.channel,
        message.author.id,
        matchId
    );

    if (!result.ok) {
        await sendContainer(
            message.channel,
            `<@${message.author.id}> ${result.message}`
        );
    } else if (result.duplicate) {
        await sendContainer(
            message.channel,
            `<@${message.author.id}> ${result.message}`
        );
    }

    return true;
}

// ======================================================
// RECUPERAR PARTIDAS APÓS REINÍCIO
// ======================================================

async function recoverMatches(client) {
    const db = readDB();

    for (const match of Object.values(db.matches)) {
        if (
            match.status === 'playing' &&
            !match.resultProcessed
        ) {
            scheduleResultPoll(client, match.id, 5000);
        }

        if (
            match.status === 'starting' &&
            Array.isArray(match.confirmations) &&
            match.confirmations.length >= 2
        ) {
            // Não repete automaticamente uma chamada de start
            // que pode ter sido recebida pela API antes do reinício.
            // Volta para waiting para permitir nova tentativa controlada.
            const latest = readDB();
            const current = latest.matches[String(match.id)];

            if (current) {
                current.status = 'waiting';
                current.startError =
                    'O bot reiniciou durante a inicialização. Confirme novamente.';
                saveDB(latest);
                await updateMatchPanel(client, current);
            }
        }
    }
}

// ======================================================
// JOGADORES
// ======================================================

function getPlayer(db, id) {
    if (!db.players[id]) {
        db.players[id] = {
            wins: 0,
            losses: 0,
            wo: 0,
            points: 0,
            streak: 0,
            bestStreak: 0,
            matches: 0,
            history: []
        };
    }

    return db.players[id];
}

function addHistory(player, item) {
    player.history.unshift(item);
    player.history = player.history.slice(0, 30);
}

// Mantida para compatibilidade com outras partes do projeto.
function applyWin(db, winnerId, loserId, match) {
    const winner = getPlayer(db, winnerId);
    const loser = getPlayer(db, loserId);

    winner.wins++;
    winner.matches++;
    winner.points++;
    winner.streak++;

    winner.bestStreak = Math.max(
        winner.bestStreak,
        winner.streak
    );

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
        matchId: match.id,
        result: 'Vitória',
        points: 1 + bonus,
        bonus,
        opponentId: loserId,
        date: timestamp
    });

    addHistory(loser, {
        matchId: match.id,
        result: 'Derrota',
        points: 0,
        opponentId: winnerId,
        date: timestamp
    });

    match.status = 'finished';
    match.winnerId = winnerId;
    match.loserId = loserId;
    match.finishedAt = timestamp;
    match.pointsAwarded = true;

    saveDB(db);

    return { bonus, winner, loser };
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
    responderContainer,

    getPlayer,
    addHistory,
    applyWin,

    generateRoomPassword,

    createNixRoom,
    startNixRoom,
    getNixRoom,
    getNixMembers,
    getNixResult,
    releaseNixRoom,

    createMatch,
    confirmMatch,
    startConfirmedMatch,
    updateMatchPanel,
    handleButton,
    handleMessage,
    recoverMatches
};
