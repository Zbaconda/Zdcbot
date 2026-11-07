const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} = require('discord.js');

const FF = require('./freefireCore');

// ======================================================
// COMANDO
// ======================================================

const data = new SlashCommandBuilder()
    .setName('criar-sala')
    .setDescription('Cria uma partida de Free Fire contra um adversário.')
    .addUserOption(option =>
        option
            .setName('adversario')
            .setDescription('Escolha seu adversário.')
            .setRequired(true)
    );

// ======================================================
// PARTICIPANTES
// ======================================================

function participantes(match) {
    return [
        match.captain1Id,
        match.captain2Id || match.adversaryId
    ].filter(Boolean);
}

// ======================================================
// TEXTO DO PAINEL
// ======================================================

function criarTextoPainel(match) {
    const confirmacoes = Array.isArray(match.confirmations)
        ? match.confirmations
        : [];

    let status = 'Aguardando confirmação';

    if (match.status === 'starting') {
        status = 'Iniciando sala...';
    }

    if (match.status === 'playing') {
        status = 'Partida em andamento';
    }

    if (match.status === 'finished') {
        status = 'Partida finalizada';
    }

    if (match.status === 'cancelled') {
        status = 'Partida cancelada';
    }

    if (match.status === 'start_error') {
        status = 'Erro ao iniciar';
    }

    return (
        '# PARTIDA FREE FIRE\n\n' +
        `**Partida:** #${match.id}\n` +
        '**Formato:** 1v1\n\n' +
        `**Jogador 1:** <@${match.captain1Id}>\n` +
        `**Adversário:** <@${match.captain2Id || match.adversaryId}>\n\n` +
        `**ID da sala:** ${match.roomId}\n` +
        `**Senha:** ${match.password}\n` +
        '**Configuração:** AP Padrão\n\n' +
        `**Confirmações:** ${confirmacoes.length}/2\n` +
        `**Status:** ${status}\n\n` +
        (
            match.status === 'waiting'
                ? 'Somente os dois participantes podem confirmar a partida.\n\n' +
                  'Clique em **Confirmar presença** ou envie **GO** no canal.'
                : 'Acompanhe o andamento da partida por este painel.'
        )
    );
}

// ======================================================
// BOTÕES
// ======================================================

function criarBotoes(match) {
    const aguardando = match.status === 'waiting';

    const confirmar = new ButtonBuilder()
        .setCustomId(`ff_confirmar:${match.id}`)
        .setLabel('Confirmar presença')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!aguardando);

    const copiar = new ButtonBuilder()
        .setCustomId(`ff_copiar:${match.id}`)
        .setLabel('Copiar ID')
        .setEmoji('🆔')
        .setStyle(ButtonStyle.Secondary);

    const convite = new ButtonBuilder()
        .setCustomId(`ff_convite:${match.id}`)
        .setLabel('Convite da sala')
        .setEmoji('🔗')
        .setStyle(ButtonStyle.Primary);

    const cancelar = new ButtonBuilder()
        .setCustomId(`ff_cancelar:${match.id}`)
        .setLabel('Cancelar partida')
        .setEmoji('✖️')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!aguardando);

    return [
        new ActionRowBuilder().addComponents(
            confirmar,
            copiar,
            convite,
            cancelar
        )
    ];
}

// ======================================================
// EXECUTAR
// ======================================================

async function execute(interaction) {
    if (!FF.isFreeFireChannel(interaction)) {
        return interaction.reply({
            content: `Este comando só pode ser usado em <#${FF.CHANNEL_ID}>.`,
            flags: MessageFlags.Ephemeral
        });
    }

    const adversario = interaction.options.getUser('adversario');

    if (!adversario) {
        return interaction.reply({
            content: 'Você precisa escolher um adversário.',
            flags: MessageFlags.Ephemeral
        });
    }

    if (adversario.bot) {
        return interaction.reply({
            content: 'Você não pode escolher um bot como adversário.',
            flags: MessageFlags.Ephemeral
        });
    }

    if (adversario.id === interaction.user.id) {
        return interaction.reply({
            content: 'Você não pode marcar a si mesmo como adversário.',
            flags: MessageFlags.Ephemeral
        });
    }

    const membroAdversario = await interaction.guild.members
        .fetch(adversario.id)
        .catch(() => null);

    if (!membroAdversario) {
        return interaction.reply({
            content: 'Não encontrei esse adversário no servidor.',
            flags: MessageFlags.Ephemeral
        });
    }

    await interaction.deferReply({
        flags: MessageFlags.Ephemeral
    });

    let matchId = null;
    let sessionId = null;

    try {
        // ==============================================
        // CRIAR SALA NA NIXFF
        // ==============================================

        const senha = FF.generateRoomPassword();

        const resposta = await FF.createNixRoom({
            password: senha,
            config_type: 'ap_padrao',
            start_delay_minutes: 5,
            map_name: 'Bermuda'
        });

        if (!resposta || !resposta.session_id) {
            throw new Error(
                'A NixFF não retornou o session_id da sala.'
            );
        }

        if (
            resposta.room_id === undefined ||
            resposta.room_id === null
        ) {
            throw new Error(
                'A NixFF não retornou o ID da sala.'
            );
        }

        sessionId = resposta.session_id;

        // ==============================================
        // SALVAR PARTIDA
        // ==============================================

        const db = FF.readDB();

        matchId = String(db.nextId || 1);
        db.nextId = Number(matchId) + 1;

        const match = {
            id: matchId,

            creatorId: interaction.user.id,

            captain1Id: interaction.user.id,
            captain2Id: adversario.id,
            adversaryId: adversario.id,

            map: 'Bermuda',
            configType: 'ap_padrao',

            roomId: String(resposta.room_id),

            password: String(
                resposta.password || senha
            ),

            sessionId,

            inviteLink:
                resposta.invite_link ||
                resposta.invitation_link ||
                null,

            inviteCode:
                resposta.invite_code ||
                resposta.code ||
                null,

            status: 'waiting',

            confirmations: [],

            createdAt: new Date().toISOString(),

            startedAt: null,
            finishedAt: null,

            startWarningSent: false,

            apiStatus: resposta.status || 'created',

            channelId: interaction.channelId,
            messageId: null,

            result: null,
            resultPosted: false
        };

        db.matches[matchId] = match;

        if (!FF.saveDB(db)) {
            throw new Error(
                'Não consegui salvar a partida no banco de dados.'
            );
        }

        // ==============================================
        // PUBLICAR PAINEL
        // ==============================================

        const painel = await interaction.channel.send({
            components: [
                FF.makeContainer(criarTextoPainel(match)),
                ...criarBotoes(match)
            ],
            flags: MessageFlags.IsComponentsV2
        });

        // Salva o ID da mensagem do painel.
        const dbAtualizado = FF.readDB();

        if (dbAtualizado.matches[matchId]) {
            dbAtualizado.matches[matchId].messageId = painel.id;
            dbAtualizado.matches[matchId].channelId =
                interaction.channelId;

            FF.saveDB(dbAtualizado);
        }

        // ==============================================
        // LOG
        // ==============================================

        await FF.sendLog(
            interaction.guild,
            `# SALA FREE FIRE CRIADA\n\n` +
            `**Partida:** #${matchId}\n` +
            `**Criador:** <@${interaction.user.id}>\n` +
            `**Adversário:** <@${adversario.id}>\n` +
            `**ID da sala:** ${match.roomId}\n` +
            `**Mapa:** ${match.map}\n` +
            `**Configuração:** AP Padrão\n` +
            `**Status:** Aguardando confirmação`
        );

        // ==============================================
        // RESPOSTA PRIVADA
        // ==============================================

        return interaction.editReply({
            content:
                `Sua sala foi criada com sucesso!\n\n` +
                `**Partida:** #${matchId}\n` +
                `**Adversário:** ${adversario}\n` +
                `**ID da sala:** ${match.roomId}\n\n` +
                `O painel da partida foi publicado em ${interaction.channel}.`
        });
    } catch (erro) {
        console.error(
            '[FREE FIRE] Erro ao criar partida:',
            erro
        );

        // Se houve criação na API, mas falhou o restante,
        // tenta liberar a sala para não deixar uma sala abandonada.
        if (sessionId && !matchId) {
            await FF.releaseNixRoom(sessionId).catch(
                erroLiberacao => {
                    console.error(
                        '[FREE FIRE] Erro ao liberar sala:',
                        erroLiberacao
                    );
                }
            );
        }

        return interaction.editReply({
            content:
                `Não consegui criar sua sala.\n\n` +
                `**Motivo:** ${erro.publicMessage || erro.message || 'Erro desconhecido.'}`
        }).catch(() => null);
    }
}

// ======================================================
// EXPORTAÇÕES
// ======================================================

module.exports = {
    data,
    execute,

    criarTextoPainel,
    criarBotoes
};
