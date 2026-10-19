require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const cron = require('node-cron');

const {
    Client,
    Collection,
    GatewayIntentBits,
    Partials,
    ActivityType,
    ChannelType,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    UserSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    REST,
    Routes,
    AttachmentBuilder
} = require('discord.js');

// ======================================================
// CONFIGURAÇÕES DO ZDC
// ======================================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const CATEGORIA_CALL = '1560763293994323999';
const CARGO_BOOSTER = '1559367297053757551';
const CANAL_PUBLICACOES_ID = '1561569037694275584';
const CANAL_LIMPEZA_ID = '1559375230202290256';

const FUSO_HORARIO = 'America/Sao_Paulo';
const TEMPO_EXCLUSAO_CALL_VAZIA = 10000;
const INTERVALO_ATIVIDADE = 10 * 60 * 60 * 1000;

const DATA_DIR = path.join(__dirname, 'data');
const ARQUIVO_PUBLICACOES = path.join(DATA_DIR, 'publicacoes.json');
const ARQUIVO_LIMPEZA = path.join(DATA_DIR, 'limpeza.json');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function garantirArquivo(arquivo) {
    if (!fs.existsSync(arquivo)) {
        fs.writeFileSync(arquivo, '{}');
    }
}

garantirArquivo(ARQUIVO_PUBLICACOES);
garantirArquivo(ARQUIVO_LIMPEZA);

// ======================================================
// CLIENTE DISCORD
// ======================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.User,
        Partials.GuildMember
    ]
});

client.commands = new Collection();

const temporizadoresCall = new Map();

// ======================================================
// ARQUIVOS JSON
// ======================================================

function lerJSON(arquivo) {
    try {
        return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    } catch (erro) {
        console.error(`Erro ao ler ${arquivo}:`, erro);
        return {};
    }
}

function salvarJSON(arquivo, dados) {
    try {
        fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2));
    } catch (erro) {
        console.error(`Erro ao salvar ${arquivo}:`, erro);
    }
}

function obterPublicacoes() {
    return lerJSON(ARQUIVO_PUBLICACOES);
}

function salvarPublicacoes(dados) {
    salvarJSON(ARQUIVO_PUBLICACOES, dados);
}

// ======================================================
// CARREGAR COMANDOS
// ======================================================

const pastaComandos = path.join(__dirname, 'commands');

if (fs.existsSync(pastaComandos)) {
    const arquivos = fs.readdirSync(pastaComandos)
        .filter(arquivo => arquivo.endsWith('.js'));

    for (const arquivo of arquivos) {
        try {
            const caminho = path.join(pastaComandos, arquivo);
            const comando = require(caminho);

            if (comando.data && comando.execute) {
                client.commands.set(comando.data.name, comando);
                console.log(`✅ Comando carregado: ${comando.data.name}`);
            } else {
                console.warn(`⚠️ ${arquivo} não contém data e execute.`);
            }
        } catch (erro) {
            console.error(`❌ Erro ao carregar ${arquivo}:`, erro);
        }
    }
}

async function registrarComandos() {
    if (!TOKEN || !CLIENT_ID) {
        console.warn('⚠️ Configure DISCORD_TOKEN e CLIENT_ID para registrar comandos.');
        return;
    }

    const comandos = [...client.commands.values()]
        .map(comando => comando.data.toJSON());

    if (comandos.length === 0) {
        console.log('Nenhum comando slash encontrado.');
        return;
    }

    try {
        const rest = new REST({ version: '10' }).setToken(TOKEN);

        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: comandos }
        );

        console.log(`✅ ${comandos.length} comandos slash registrados.`);
    } catch (erro) {
        console.error('❌ Erro ao registrar comandos:', erro);
    }
}

// ======================================================
// ATIVIDADE DO BOT
// ======================================================

const series = [
    'The Mentalist',
    'Dexter',
    'Sex Education',
    'Breaking Bad',
    'The Walking Dead',
    'You'
];

let indiceSerie = 0;

function atualizarAtividade() {
    if (!client.user) return;

    client.user.setActivity(series[indiceSerie], {
        type: ActivityType.Watching
    });

    indiceSerie = (indiceSerie + 1) % series.length;
}

// ======================================================
// FUNÇÕES AUXILIARES
// ======================================================

async function responderErro(interaction, mensagem) {
    const resposta = {
        content: mensagem,
        ephemeral: true
    };

    try {
        if (interaction.replied || interaction.deferred) {
            return await interaction.followUp(resposta);
        }

        return await interaction.reply(resposta);
    } catch (erro) {
        console.error('Erro ao responder interação:', erro);
    }
}

function obterCall(interaction) {
    return interaction.member?.voice?.channel || null;
}

function ehBooster(membro) {
    return Boolean(membro?.roles?.cache?.has(CARGO_BOOSTER));
}

function estaNaCategoriaCall(canal) {
    return Boolean(canal && canal.parentId === CATEGORIA_CALL);
}

function podeControlarCall(interaction, canal) {
    if (!canal || !interaction.member) return false;

    if (canal.topic === `call-temporaria:${interaction.user.id}`) {
        return true;
    }

    return Boolean(
        interaction.memberPermissions?.has(
            PermissionFlagsBits.ManageChannels
        )
    );
}

function cancelarTemporizadorCall(canalId) {
    const temporizador = temporizadoresCall.get(canalId);

    if (temporizador) {
        clearTimeout(temporizador);
        temporizadoresCall.delete(canalId);
    }
}

// ======================================================
// EXCLUSÃO SEGURA DE CALLS TEMPORÁRIAS
// ======================================================

function programarExclusaoCall(canal) {
    if (!canal) return;
    if (canal.type !== ChannelType.GuildVoice) return;
    if (!estaNaCategoriaCall(canal)) return;

    // Só pode excluir canais identificados como temporários.
    // Calls manuais e antigas não serão apagadas.
    if (
        typeof canal.topic !== 'string' ||
        !canal.topic.startsWith('call-temporaria:')
    ) {
        return;
    }

    cancelarTemporizadorCall(canal.id);

    const temporizador = setTimeout(async () => {
        try {
            const atual = await canal.guild.channels
                .fetch(canal.id)
                .catch(() => null);

            if (!atual) return;

            if (
                atual.type === ChannelType.GuildVoice &&
                estaNaCategoriaCall(atual) &&
                typeof atual.topic === 'string' &&
                atual.topic.startsWith('call-temporaria:') &&
                atual.members.size === 0
            ) {
                await atual.delete(
                    'Call temporária vazia há 10 segundos.'
                );

                console.log(`🗑️ Call temporária excluída: ${atual.name}`);
            }
        } catch (erro) {
            console.error('Erro ao excluir call temporária:', erro);
        } finally {
            temporizadoresCall.delete(canal.id);
        }
    }, TEMPO_EXCLUSAO_CALL_VAZIA);

    temporizadoresCall.set(canal.id, temporizador);
}

// ======================================================
// CRIAR CALL TEMPORÁRIA
// ======================================================

async function criarCallTemporaria(interaction) {
    const guild = interaction.guild;
    const membro = interaction.member;

    if (!guild || !membro) {
        return responderErro(interaction, '❌ Use esta opção dentro do servidor.');
    }

    const categoria = await guild.channels
        .fetch(CATEGORIA_CALL)
        .catch(() => null);

    if (!categoria || categoria.type !== ChannelType.GuildCategory) {
        return responderErro(
            interaction,
            '❌ A categoria das calls não foi encontrada. Confira o ID configurado.'
        );
    }

    const canais = await guild.channels.fetch();

    const existente = canais.find(canal =>
        canal &&
        canal.type === ChannelType.GuildVoice &&
        canal.parentId === CATEGORIA_CALL &&
        canal.topic === `call-temporaria:${membro.id}`
    );

    if (existente) {
        return responderErro(
            interaction,
            `❌ Você já possui uma call temporária: ${existente}`
        );
    }

    try {
        const nome = `call-${membro.user.username}`
            .toLowerCase()
            .replace(/[^a-z0-9-_]/g, '')
            .slice(0, 90) || `call-${membro.id}`;

        const canal = await guild.channels.create({
            name: nome,
            type: ChannelType.GuildVoice,
            parent: CATEGORIA_CALL,
            topic: `call-temporaria:${membro.id}`,
            permissionOverwrites: [
                {
                    id: guild.roles.everyone.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.Connect,
                        PermissionFlagsBits.Speak
                    ]
                },
                {
                    id: membro.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.Connect,
                        PermissionFlagsBits.Speak,
                        PermissionFlagsBits.ManageChannels,
                        PermissionFlagsBits.MoveMembers
                    ]
                }
            ]
        });

        await interaction.reply({
            content: `✅ Sua call foi criada: ${canal}`,
            ephemeral: true
        });

        await membro.voice.setChannel(canal).catch(() => null);

        return canal;
    } catch (erro) {
        console.error('Erro ao criar call:', erro);

        return responderErro(
            interaction,
            '❌ Não consegui criar a call. Confira as permissões do bot.'
        );
    }
}

// ======================================================
// PAINEL DE CONTROLE DE CALL
// ======================================================

function criarPainelCall() {
    const embed = new EmbedBuilder()
        .setTitle('🎙️ Controle de call')
        .setDescription(
            'Use os botões abaixo para controlar sua chamada.\n\n' +
            '🔢 **Limite:** alterar a quantidade de pessoas.\n' +
            '➡️ **Mover:** mover alguém para sua call.\n' +
            '🔇 **Mutar:** recurso exclusivo para Boosters.\n' +
            '🔊 **Desmutar:** retirar seu mute de servidor.\n' +
            '🔒 **Privar:** restringir o acesso à call.\n' +
            '🔓 **Liberar:** permitir que todos entrem novamente.'
        )
        .setColor(0x000000);

    const linha1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('call_limite')
            .setLabel('Limite')
            .setEmoji('🔢')
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId('call_mover')
            .setLabel('Mover')
            .setEmoji('➡️')
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId('call_mutar')
            .setLabel('Mutar')
            .setEmoji('🔇')
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId('call_desmutar')
            .setLabel('Desmutar')
            .setEmoji('🔊')
            .setStyle(ButtonStyle.Secondary)
    );

    const linha2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('call_privada')
            .setLabel('Privar call')
            .setEmoji('🔒')
            .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId('call_publica')
            .setLabel('Liberar call')
            .setEmoji('🔓')
            .setStyle(ButtonStyle.Success)
    );

    return {
        embeds: [embed],
        components: [linha1, linha2]
    };
}

// ======================================================
// PUBLICAÇÕES
// ======================================================

function criarBotoesPublicacao(id) {
    const linha1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`pub_like_${id}`)
            .setLabel('Curtir')
            .setEmoji('<a:a_coraopulante:1561585804286107708>')
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(`pub_comentar_${id}`)
            .setLabel('Comentar')
            .setEmoji('<a:a_morceguinho:1561585818416582716>')
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(`pub_compartilhar_${id}`)
            .setLabel('Compartilhar')
            .setEmoji('<a:a_florgirando:1561585775106199562>')
            .setStyle(ButtonStyle.Secondary)
    );

    const linha2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`pub_detalhes_${id}`)
            .setLabel('Detalhes')
            .setEmoji('<:a_cargoplug:1561585789501046924>')
            .setStyle(ButtonStyle.Secondary)
    );

    return [linha1, linha2];
}

async function publicarMensagem(mensagem) {
    if (mensagem.author.bot || !mensagem.guild) return;
    if (mensagem.channelId !== CANAL_PUBLICACOES_ID) return;

    const texto = mensagem.content?.trim() || '';

    const imagens = [...mensagem.attachments.values()].filter(anexo =>
        anexo.contentType?.startsWith('image/') ||
        /\.(png|jpe?g|gif|webp)$/i.test(anexo.name || '')
    );

    if (!texto && imagens.length === 0) return;

    try {
        const canal = await mensagem.guild.channels
            .fetch(CANAL_PUBLICACOES_ID)
            .catch(() => null);

        if (!canal?.isTextBased()) return;

        const data = new Date();
        const autor = mensagem.member?.displayName ||
            mensagem.author.globalName ||
            mensagem.author.username;

        const embed = new EmbedBuilder()
            .setColor(0x000000)
            .setAuthor({
                name: autor,
                iconURL: mensagem.author.displayAvatarURL({
                    extension: 'png',
                    size: 256
                })
            })
            .setDescription(texto.slice(0, 4096) || '\u200B')
            .setFooter({ text: 'ZODÍACO • PUBLICAÇÃO' })
            .setTimestamp(data);

        const arquivos = [];

        if (imagens.length > 0) {
            const imagem = imagens[0];
            const resposta = await fetch(imagem.url);

            if (resposta.ok) {
                const buffer = Buffer.from(await resposta.arrayBuffer());
                const extensao = (imagem.name || '').match(/\.(png|jpe?g|gif|webp)$/i);
                const nomeArquivo = `publicacao-${mensagem.id}${extensao?.[0] || '.png'}`;

                arquivos.push(
                    new AttachmentBuilder(buffer, { name: nomeArquivo })
                );

                embed.setImage(`attachment://${nomeArquivo}`);
            }
        }

        const publicacoes = obterPublicacoes();

        publicacoes[mensagem.id] = {
            autorId: mensagem.author.id,
            autorNome: autor,
            guildId: mensagem.guild.id,
            canalId: mensagem.channelId,
            mensagemOriginalId: mensagem.id,
            mensagemPublicadaId: null,
            texto,
            curtidas: [],
            comentarios: [],
            data: data.toISOString()
        };

        const publicada = await canal.send({
            embeds: [embed],
            files: arquivos,
            components: criarBotoesPublicacao(mensagem.id)
        });

        publicacoes[mensagem.id].mensagemPublicadaId = publicada.id;
        salvarPublicacoes(publicacoes);

        await mensagem.delete().catch(erro => {
            console.warn('Não consegui apagar a mensagem original:', erro.message);
        });

        console.log(`📣 Publicação criada: ${mensagem.id}`);
    } catch (erro) {
        console.error('Erro ao publicar mensagem:', erro);
    }
}

// ======================================================
// LIMPEZA SEMANAL
// ======================================================

async function limparCanalSemanal() {
    try {
        const canal = await client.channels
            .fetch(CANAL_LIMPEZA_ID)
            .catch(() => null);

        if (!canal?.isTextBased() || !canal.messages) {
            console.error('❌ Canal de limpeza não encontrado.');
            return;
        }

        let total = 0;

        while (true) {
            const mensagens = await canal.messages.fetch({ limit: 100 });

            if (mensagens.size === 0) break;

            const recentes = mensagens.filter(m =>
                Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000
            );

            const antigas = mensagens.filter(m =>
                Date.now() - m.createdTimestamp >= 14 * 24 * 60 * 60 * 1000
            );

            if (recentes.size > 0) {
                const excluidas = await canal.bulkDelete(recentes, true)
                    .catch(() => null);

                if (excluidas) total += excluidas.size;
            }

            for (const mensagem of antigas.values()) {
                await mensagem.delete()
                    .then(() => total++)
                    .catch(() => null);

                await new Promise(resolve => setTimeout(resolve, 350));
            }

            if (mensagens.size < 100) break;
        }

        const estado = lerJSON(ARQUIVO_LIMPEZA);
        estado.ultimaLimpeza = new Date().toISOString();
        estado.totalExcluidas = total;
        salvarJSON(ARQUIVO_LIMPEZA, estado);

        console.log(`✅ Limpeza concluída. Total excluído: ${total}`);
    } catch (erro) {
        console.error('Erro na limpeza semanal:', erro);
    }
}

cron.schedule('0 0 * * 0', limparCanalSemanal, {
    timezone: FUSO_HORARIO
});

// ======================================================
// BOT ONLINE
// ======================================================

client.once('clientReady', async () => {
    console.log(`🤖 Bot online: ${client.user.tag}`);

    atualizarAtividade();
    setInterval(atualizarAtividade, INTERVALO_ATIVIDADE);

    await registrarComandos();
});

// ======================================================
// ATUALIZAÇÃO DE VOZ
// ======================================================

client.on('voiceStateUpdate', async (anterior, atual) => {
    try {
        if (atual.channel) {
            cancelarTemporizadorCall(atual.channel.id);
        }

        const canalAnterior = anterior.channel;

        if (
            canalAnterior &&
            canalAnterior.id !== atual.channelId &&
            canalAnterior.type === ChannelType.GuildVoice &&
            canalAnterior.parentId === CATEGORIA_CALL &&
            canalAnterior.members.size === 0 &&
            typeof canalAnterior.topic === 'string' &&
            canalAnterior.topic.startsWith('call-temporaria:')
        ) {
            programarExclusaoCall(canalAnterior);
        }
    } catch (erro) {
        console.error('Erro ao atualizar estado de voz:', erro);
    }
});

// ======================================================
// MENSAGENS
// ======================================================

client.on('messageCreate', async mensagem => {
    try {
        await publicarMensagem(mensagem);
    } catch (erro) {
        console.error('Erro em messageCreate:', erro);
    }
});

// ======================================================
// INTERAÇÕES
// ======================================================

client.on('interactionCreate', async interaction => {
    try {
        // --------------------------------------------------
        // COMANDOS SLASH
        // --------------------------------------------------

        if (interaction.isChatInputCommand()) {
            const comando = client.commands.get(interaction.commandName);

            if (!comando) {
                return responderErro(interaction, '❌ Comando não encontrado.');
            }

            try {
                await comando.execute(interaction, client);
            } catch (erro) {
                console.error(`Erro no comando ${interaction.commandName}:`, erro);
                await responderErro(interaction, '❌ Erro ao executar o comando.');
            }

            return;
        }

        
      // ======================================================
// MENUS DE SELEÇÃO: CARGOS E CONTROLE DE CALL
// ======================================================

if (interaction.isStringSelectMenu()) {
    const id = interaction.customId;

    // PAINEL DE CARGOS
    if (id === 'selecionar_cargo') {
        const comandoCargos = client.commands.get('cargos');

        if (!comandoCargos?.handleSelect) {
            return responderErro(
                interaction,
                '❌ O sistema de cargos não está carregado.'
            );
        }

        return comandoCargos.handleSelect(interaction);
    }

    // PAINEL DE FERRAMENTAS DE CALL
    if (id === 'controle_call') {
        const opcao = interaction.values[0];
const canal = obterCall(interaction);

        // CRIAR CALL
        if (opcao === 'criar_call') {
            return criarCallTemporaria(interaction);
        }

        // DESMUTAR A SI MESMO
        if (opcao === 'desmutar') {
            if (!interaction.member?.voice?.channel) {
                return responderErro(
                    interaction,
                    '❌ Entre em uma chamada primeiro.'
                );
            }

            try {
                await interaction.member.voice.setMute(false);

                return interaction.reply({
                    content: '🔊 Seu mute de servidor foi removido.',
                    ephemeral: true
                });
            } catch (erro) {
                console.error('Erro ao desmutar:', erro);

                return responderErro(
                    interaction,
                    '❌ Não consegui retirar seu mute. Verifique as permissões do bot.'
                );
            }
        }

        // AS OUTRAS OPÇÕES EXIGEM UMA CALL CONTROLÁVEL
        if (!canal) {
            return responderErro(
                interaction,
                '❌ Entre em uma chamada antes de usar esta ferramenta.'
            );
        }

        if (
            canal.parentId !== CATEGORIA_CALL ||
            !podeControlarCall(interaction, canal)
        ) {
            return responderErro(
                interaction,
                '❌ Você não pode controlar esta chamada.'
            );
        }

        // PRIVAR CALL
        if (opcao === 'privar_call') {
            try {
                await canal.permissionOverwrites.edit(
                    interaction.guild.roles.everyone.id,
                    {
                        ViewChannel: false,
                        Connect: false
                    }
                );

                await canal.permissionOverwrites.edit(interaction.user.id, {
                    ViewChannel: true,
                    Connect: true,
                    Speak: true,
                    ManageChannels: true,
                    MoveMembers: true
                });

                return interaction.reply({
                    content: '🔒 Sua chamada agora está privada.',
                    ephemeral: true
                });
            } catch (erro) {
                console.error('Erro ao privar call:', erro);

                return responderErro(
                    interaction,
                    '❌ Não consegui privar a chamada.'
                );
            }
        }

        // LIBERAR CALL
        if (opcao === 'desprivar_call') {
            try {
                await canal.permissionOverwrites.edit(
                    interaction.guild.roles.everyone.id,
                    {
                        ViewChannel: true,
                        Connect: true,
                        Speak: true
                    }
                );

                return interaction.reply({
                    content: '🔓 Sua chamada voltou a ser pública.',
                    ephemeral: true
                });
            } catch (erro) {
                console.error('Erro ao liberar call:', erro);

                return responderErro(
                    interaction,
                    '❌ Não consegui liberar a chamada.'
                );
            }
        }

        // DEFINIR LIMITE
        if (opcao === 'quantidade') {
            const modal = new ModalBuilder()
                .setCustomId('modal_limite_call')
                .setTitle('Limite da chamada');

            const campo = new TextInputBuilder()
                .setCustomId('limite')
                .setLabel('Limite de pessoas (0 a 99)')
                .setPlaceholder('Digite 0 para remover o limite')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMinLength(1)
                .setMaxLength(2);

            modal.addComponents(
                new ActionRowBuilder().addComponents(campo)
            );

            return interaction.showModal(modal);
        }

        // MOVER MEMBRO
        if (opcao === 'mover') {
            const seletor = new UserSelectMenuBuilder()
                .setCustomId('call_selecionar_membro')
                .setPlaceholder('Escolha quem deseja mover')
                .setMinValues(1)
                .setMaxValues(1);

            return interaction.reply({
                content: '➡️ Selecione o membro que deseja mover para sua chamada.',
                components: [
                    new ActionRowBuilder().addComponents(seletor)
                ],
                ephemeral: true
            });
        }

        // MUTAR — EXCLUSIVO PARA BOOSTERS
        if (opcao === 'mutar') {
            if (!membroEhBooster(interaction.member)) {
                return responderErro(
                    interaction,
                    '❌ Este recurso é exclusivo para Boosters.'
                );
            }

            const seletor = new UserSelectMenuBuilder()
                .setCustomId('call_selecionar_mutar')
                .setPlaceholder('Escolha quem deseja mutar')
                .setMinValues(1)
                .setMaxValues(1);

            return interaction.reply({
                content: '🔇 Selecione o membro que deseja mutar.',
                components: [
                    new ActionRowBuilder().addComponents(seletor)
                ],
                ephemeral: true
            });
        }

        return responderErro(
            interaction,
            '❌ Esta ferramenta não é reconhecida.'
        );
    }

    return;
}

        // --------------------------------------------------
        // BOTÕES
        // --------------------------------------------------

        if (interaction.isButton()) {
            const id = interaction.customId;

            if (id === 'criar_call') {
                return criarCallTemporaria(interaction);
            }

            if (id === 'abrir_controle_call') {
                return interaction.reply({
                    ...criarPainelCall(),
                    ephemeral: true
                });
            }

            // LIMITE DA CALL
            if (id === 'call_limite') {
                const canal = obterCall(interaction);

                if (!canal || !estaNaCategoriaCall(canal) ||
                    !podeControlarCall(interaction, canal)) {
                    return responderErro(
                        interaction,
                        '❌ Entre em uma call que você possa controlar.'
                    );
                }

                const modal = new ModalBuilder()
                    .setCustomId('modal_limite_call')
                    .setTitle('Limite da chamada');

                const campo = new TextInputBuilder()
                    .setCustomId('limite')
                    .setLabel('Limite entre 0 e 99')
                    .setPlaceholder('Digite 0 para remover o limite')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMinLength(1)
                    .setMaxLength(2);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(campo)
                );

                return interaction.showModal(modal);
            }

            // MOVER MEMBRO
            if (id === 'call_mover') {
                const canal = obterCall(interaction);

                if (!canal || !estaNaCategoriaCall(canal) ||
                    !podeControlarCall(interaction, canal)) {
                    return responderErro(
                        interaction,
                        '❌ Entre em uma call que você possa controlar.'
                    );
                }

                const seletor = new UserSelectMenuBuilder()
                    .setCustomId('call_selecionar_membro')
                    .setPlaceholder('Escolha quem deseja mover')
                    .setMinValues(1)
                    .setMaxValues(1);

                return interaction.reply({
                    content: '➡️ Selecione quem deseja mover para sua call.',
                    components: [
                        new ActionRowBuilder().addComponents(seletor)
                    ],
                    ephemeral: true
                });
            }

            // MUTAR MEMBRO
            if (id === 'call_mutar') {
                if (!ehBooster(interaction.member)) {
                    return responderErro(
                        interaction,
                        '❌ Este recurso é exclusivo para Boosters.'
                    );
                }

                const canal = obterCall(interaction);

                if (!canal || !estaNaCategoriaCall(canal) ||
                    !podeControlarCall(interaction, canal)) {
                    return responderErro(
                        interaction,
                        '❌ Entre em uma call que você possa controlar.'
                    );
                }

                const seletor = new UserSelectMenuBuilder()
                    .setCustomId('call_selecionar_mutar')
                    .setPlaceholder('Escolha quem deseja mutar')
                    .setMinValues(1)
                    .setMaxValues(1);

                return interaction.reply({
                    content: '🔇 Selecione o membro que deseja mutar.',
                    components: [
                        new ActionRowBuilder().addComponents(seletor)
                    ],
                    ephemeral: true
                });
            }

            // DESMUTAR
            if (id === 'call_desmutar') {
                if (!interaction.member.voice.channel) {
                    return responderErro(interaction, '❌ Entre em uma call primeiro.');
                }

                try {
                    await interaction.member.voice.setMute(false);

                    return interaction.reply({
                        content: '🔊 Seu mute de servidor foi removido.',
                        ephemeral: true
                    });
                } catch (erro) {
                    return responderErro(
                        interaction,
                        '❌ Não consegui retirar seu mute. Confira as permissões do bot.'
                    );
                }
            }

            // PRIVAR OU LIBERAR
            if (id === 'call_privada' || id === 'call_publica') {
                const canal = obterCall(interaction);

                if (!canal || !estaNaCategoriaCall(canal) ||
                    !podeControlarCall(interaction, canal)) {
                    return responderErro(
                        interaction,
                        '❌ Entre em uma call que você possa controlar.'
                    );
                }

                const publica = id === 'call_publica';

                await canal.permissionOverwrites.edit(
                    interaction.guild.roles.everyone.id,
                    {
                        ViewChannel: publica,
                        Connect: publica
                    }
                );

                if (!publica) {
                    await canal.permissionOverwrites.edit(interaction.user.id, {
                        ViewChannel: true,
                        Connect: true,
                        ManageChannels: true,
                        MoveMembers: true
                    });
                }

                return interaction.reply({
                    content: publica
                        ? '🔓 Sua call voltou a ser pública.'
                        : '🔒 Sua call foi privada.',
                    ephemeral: true
                });
            }

            // CURTIDAS
            if (id.startsWith('pub_like_')) {
                const publicacaoId = id.slice('pub_like_'.length);
                const publicacoes = obterPublicacoes();
                const publicacao = publicacoes[publicacaoId];

                if (!publicacao) {
                    return responderErro(interaction, '❌ Publicação não encontrada.');
                }

                if (!Array.isArray(publicacao.curtidas)) {
                    publicacao.curtidas = [];
                }

                const indice = publicacao.curtidas.indexOf(interaction.user.id);

                if (indice !== -1) {
                    publicacao.curtidas.splice(indice, 1);
                    salvarPublicacoes(publicacoes);

                    return interaction.reply({
                        content: '❤️ Você removeu sua curtida.',
                        ephemeral: true
                    });
                }

                publicacao.curtidas.push(interaction.user.id);
                salvarPublicacoes(publicacoes);

                return interaction.reply({
                    content: `❤️ Você curtiu a publicação! Total: ${publicacao.curtidas.length}`,
                    ephemeral: true
                });
            }

            // COMENTÁRIOS
            if (id.startsWith('pub_comentar_')) {
                const publicacaoId = id.slice('pub_comentar_'.length);
                const publicacoes = obterPublicacoes();

                if (!publicacoes[publicacaoId]) {
                    return responderErro(interaction, '❌ Publicação não encontrada.');
                }

                const modal = new ModalBuilder()
                    .setCustomId(`modal_comentario_${publicacaoId}`)
                    .setTitle('Comentar publicação');

                const campo = new TextInputBuilder()
                    .setCustomId('comentario')
                    .setLabel('Escreva seu comentário')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMaxLength(1000);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(campo)
                );

                return interaction.showModal(modal);
            }

            // COMPARTILHAR
            if (id.startsWith('pub_compartilhar_')) {
                const publicacaoId = id.slice('pub_compartilhar_'.length);
                const publicacoes = obterPublicacoes();
                const publicacao = publicacoes[publicacaoId];

                if (!publicacao) {
                    return responderErro(interaction, '❌ Publicação não encontrada.');
                }

                const mensagemId = publicacao.mensagemPublicadaId;

                const link = mensagemId
                    ? `https://discord.com/channels/${publicacao.guildId}/${CANAL_PUBLICACOES_ID}/${mensagemId}`
                    : null;

                return interaction.reply({
                    content: link
                        ? `🔁 Compartilhe esta publicação:\n${link}`
                        : '❌ Não consegui gerar o link.',
                    ephemeral: true
                });
            }

            // DETALHES
            if (id.startsWith('pub_detalhes_')) {
                const publicacaoId = id.slice('pub_detalhes_'.length);
                const publicacoes = obterPublicacoes();
                const publicacao = publicacoes[publicacaoId];

                if (!publicacao) {
                    return responderErro(interaction, '❌ Publicação não encontrada.');
                }

                const embed = new EmbedBuilder()
                    .setTitle('ℹ️ Detalhes da publicação')
                    .setColor(0x000000)
                    .addFields(
                        {
                            name: 'Autor',
                            value: `<@${publicacao.autorId}>`,
                            inline: true
                        },
                        {
                            name: 'Curtidas',
                            value: String(publicacao.curtidas?.length || 0),
                            inline: true
                        },
                        {
                            name: 'Comentários',
                            value: String(publicacao.comentarios?.length || 0),
                            inline: true
                        },
                        {
                            name: 'Texto',
                            value: publicacao.texto?.slice(0, 1024) || 'Sem texto.'
                        }
                    );

                return interaction.reply({
                    embeds: [embed],
                    ephemeral: true
                });
            }

            return;
        }

        // --------------------------------------------------
        // MENUS DE USUÁRIOS
        // --------------------------------------------------

        if (interaction.isUserSelectMenu()) {
            const id = interaction.customId;

            if (![
                'mover_membro',
                'call_selecionar_membro',
                'call_selecionar_mutar'
            ].includes(id)) {
                return;
            }

            const canal = obterCall(interaction);

            if (!canal || !estaNaCategoriaCall(canal) ||
                !podeControlarCall(interaction, canal)) {
                return responderErro(
                    interaction,
                    '❌ Entre em uma call que você possa controlar.'
                );
            }

            const alvo = await interaction.guild.members
                .fetch(interaction.values[0])
                .catch(() => null);

            if (!alvo) {
                return responderErro(interaction, '❌ Não encontrei esse membro.');
            }

            if (id === 'call_selecionar_mutar') {
                if (!ehBooster(interaction.member)) {
                    return responderErro(interaction, '❌ Opção exclusiva para Boosters.');
                }

                if (alvo.id === interaction.user.id) {
                    return responderErro(interaction, '❌ Selecione outro membro.');
                }

                if (alvo.voice.channelId !== canal.id) {
                    return responderErro(interaction, '❌ O membro precisa estar na sua call.');
                }

                try {
                    await alvo.voice.setMute(true);

                    return interaction.update({
                        content: `🔇 ${alvo} foi mutado no servidor.`,
                        components: []
                    });
                } catch (erro) {
                    return responderErro(
                        interaction,
                        '❌ Não consegui mutar esse membro. Confira as permissões do bot.'
                    );
                }
            }

            if (!alvo.voice.channel) {
                return responderErro(interaction, '❌ Esse membro não está em uma call.');
            }

            if (alvo.id === interaction.user.id) {
                return responderErro(interaction, '❌ Selecione outro membro.');
            }

            if (id === 'mover_membro') {
                const seletor = new ChannelSelectMenuBuilder()
                    .setCustomId(`mover_canal:${alvo.id}`)
                    .setPlaceholder('Escolha a call de destino')
                    .setChannelTypes(
                        ChannelType.GuildVoice,
                        ChannelType.GuildStageVoice
                    )
                    .setMinValues(1)
                    .setMaxValues(1);

                return interaction.update({
                    content: `👤 Membro selecionado: **${alvo.user.username}**\nEscolha a call de destino:`,
                    components: [
                        new ActionRowBuilder().addComponents(seletor)
                    ]
                });
            }

            const botMembro = await interaction.guild.members.fetchMe();

            if (!botMembro.permissions.has(PermissionFlagsBits.MoveMembers)) {
                return responderErro(interaction, '❌ Preciso da permissão Mover membros.');
            }

            try {
                await alvo.voice.setChannel(canal);

                return interaction.update({
                    content: `✅ ${alvo} foi movido para ${canal}.`,
                    components: []
                });
            } catch (erro) {
                return responderErro(
                    interaction,
                    '❌ Não consegui mover esse membro. Confira as permissões do bot.'
                );
            }
        }

        // --------------------------------------------------
        // MENU DE CANAL DE DESTINO
        // --------------------------------------------------

        if (
            interaction.isChannelSelectMenu() &&
            interaction.customId.startsWith('mover_canal:')
        ) {
            const canalAtual = obterCall(interaction);

            if (!canalAtual || !estaNaCategoriaCall(canalAtual) ||
                !podeControlarCall(interaction, canalAtual)) {
                return responderErro(
                    interaction,
                    '❌ Entre em uma call que você possa controlar.'
                );
            }

            const alvoId = interaction.customId.split(':')[1];

            const alvo = await interaction.guild.members
                .fetch(alvoId)
                .catch(() => null);

            if (!alvo || !alvo.voice.channel) {
                return responderErro(interaction, '❌ Esse membro não está mais em uma call.');
            }

            const destino = await interaction.guild.channels
                .fetch(interaction.values[0])
                .catch(() => null);

            if (!destino || ![
                ChannelType.GuildVoice,
                ChannelType.GuildStageVoice
            ].includes(destino.type)) {
                return responderErro(interaction, '❌ Canal de destino inválido.');
            }

            const botMembro = await interaction.guild.members.fetchMe();

            if (!botMembro.permissions.has(PermissionFlagsBits.MoveMembers)) {
                return responderErro(interaction, '❌ Preciso da permissão Mover membros.');
            }

            try {
                await alvo.voice.setChannel(destino);

                return interaction.update({
                    content: `✅ ${alvo} foi movido para ${destino}.`,
                    components: []
                });
            } catch (erro) {
                console.error('Erro ao mover membro:', erro);

                return responderErro(
                    interaction,
                    '❌ Não consegui mover o membro para essa call.'
                );
            }
        }

        // --------------------------------------------------
        // FORMULÁRIOS / MODAIS
        // --------------------------------------------------

        if (interaction.isModalSubmit()) {
            // LIMITE DE PESSOAS
            if (interaction.customId === 'modal_limite_call') {
                const canal = obterCall(interaction);

                if (!canal || !estaNaCategoriaCall(canal) ||
                    !podeControlarCall(interaction, canal)) {
                    return responderErro(
                        interaction,
                        '❌ Entre em uma call que você possa controlar.'
                    );
                }

                // Compatível com os dois IDs de campo usados anteriormente.
                const campoId = interaction.fields.fields.has('limite')
                    ? 'limite'
                    : 'limite_pessoas';

                const valor = interaction.fields.getTextInputValue(campoId).trim();

                if (!/^\d{1,2}$/.test(valor) || Number(valor) > 99) {
                    return responderErro(
                        interaction,
                        '❌ Digite um número de 0 a 99. Use 0 para remover o limite.'
                    );
                }

                try {
                    await canal.setUserLimit(Number(valor));

                    return interaction.reply({
                        content: Number(valor) === 0
                            ? '✅ Limite removido.'
                            : `✅ Limite definido para ${valor} pessoas.`,
                        ephemeral: true
                    });
                } catch (erro) {
                    console.error('Erro ao definir limite:', erro);

                    return responderErro(
                        interaction,
                        '❌ Não consegui alterar o limite da call.'
                    );
                }
            }

            // MUTAR MEMBRO POR ID
            if (interaction.customId === 'modal_mutar_membro') {
                const membro = await interaction.guild.members
                    .fetch(interaction.user.id);

                if (!ehBooster(membro)) {
                    return responderErro(interaction, '❌ Opção exclusiva para Boosters.');
                }

                const idMembro = interaction.fields
                    .getTextInputValue('id_membro')
                    .trim();

                const alvo = await interaction.guild.members
                    .fetch(idMembro)
                    .catch(() => null);

                if (!alvo || !alvo.voice.channel) {
                    return responderErro(
                        interaction,
                        '❌ Não encontrei esse membro em uma call.'
                    );
                }

                try {
                    await alvo.voice.setMute(true);

                    return interaction.reply({
                        content: '✅ Membro mutado com sucesso.',
                        ephemeral: true
                    });
                } catch (erro) {
                    return responderErro(
                        interaction,
                        '❌ Não consegui mutar esse membro. Confira as permissões do bot.'
                    );
                }
            }

            // COMENTÁRIO DE PUBLICAÇÃO
            if (interaction.customId.startsWith('modal_comentario_')) {
                const publicacaoId = interaction.customId
                    .slice('modal_comentario_'.length);

                const publicacoes = obterPublicacoes();
                const publicacao = publicacoes[publicacaoId];

                if (!publicacao) {
                    return responderErro(interaction, '❌ Publicação não encontrada.');
                }

                const comentario = interaction.fields
                    .getTextInputValue('comentario')
                    .trim();

                if (!comentario) {
                    return responderErro(interaction, '❌ Escreva um comentário.');
                }

                if (!Array.isArray(publicacao.comentarios)) {
                    publicacao.comentarios = [];
                }

                publicacao.comentarios.push({
                    autorId: interaction.user.id,
                    autorNome: interaction.user.username,
                    texto: comentario.slice(0, 1000),
                    data: new Date().toISOString()
                });

                salvarPublicacoes(publicacoes);

                return interaction.reply({
                    content: '✅ Seu comentário foi registrado.',
                    ephemeral: true
                });
            }

            return;
        }
    } catch (erro) {
        console.error('❌ Erro geral em interactionCreate:', erro);
        await responderErro(
            interaction,
            '❌ Ocorreu um erro ao processar essa interação.'
        );
    }
});

// ======================================================
// TRATAMENTO DE ERROS
// ======================================================

process.on('unhandledRejection', erro => {
    console.error('Erro não tratado (Promise):', erro);
});

process.on('uncaughtException', erro => {
    console.error('Erro não tratado:', erro);
});

// ======================================================
// LOGIN
// ======================================================

if (!TOKEN) {
    console.error('❌ DISCORD_TOKEN não foi encontrado nas variáveis de ambiente.');
} else {
    client.login(TOKEN).catch(erro => {
        console.error('❌ Não foi possível conectar o bot:', erro);
    });
        }
