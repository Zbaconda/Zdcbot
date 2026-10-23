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
    AttachmentBuilder,
    MessageFlags
} = require('discord.js');

// ======================================================
// CONFIGURAÇÕES DO ZODÍACO
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
const ARQUIVO_CALLS_TEMPORARIAS = path.join(
    DATA_DIR,
    'calls_temporarias.json'
);

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function garantirArquivo(arquivo) {
    if (!fs.existsSync(arquivo)) {
        fs.writeFileSync(arquivo, '{}', 'utf8');
    }
}

garantirArquivo(ARQUIVO_PUBLICACOES);
garantirArquivo(ARQUIVO_LIMPEZA);
garantirArquivo(ARQUIVO_CALLS_TEMPORARIAS);

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
        fs.writeFileSync(
            arquivo,
            JSON.stringify(dados, null, 2),
            'utf8'
        );
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
// REGISTRO DE CALLS TEMPORÁRIAS
// ======================================================

function obterCallsTemporarias() {
    return lerJSON(ARQUIVO_CALLS_TEMPORARIAS);
}

function registrarCallTemporaria(canalId) {
    const calls = obterCallsTemporarias();

    calls[canalId] = true;

    salvarJSON(ARQUIVO_CALLS_TEMPORARIAS, calls);

    // Confirma que o registro foi salvo antes de permitir a limpeza.
    const verificacao = obterCallsTemporarias();

    return verificacao[canalId] === true;
}

function removerRegistroCall(canalId) {
    const calls = obterCallsTemporarias();

    delete calls[canalId];

    salvarJSON(ARQUIVO_CALLS_TEMPORARIAS, calls);
}

// ======================================================
// RESPOSTAS DE INTERAÇÃO
// ======================================================

async function responderErro(interaction, mensagem) {
    const resposta = {
        content: mensagem,
        flags: MessageFlags.Ephemeral
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

async function responderSucesso(interaction, mensagem) {
    const resposta = {
        content: mensagem,
        flags: MessageFlags.Ephemeral
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

// ======================================================
// CARREGAR COMANDOS SLASH
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
                console.warn(
                    `⚠️ ${arquivo} não contém data e execute.`
                );
            }
        } catch (erro) {
            console.error(`❌ Erro ao carregar ${arquivo}:`, erro);
        }
    }
}

async function registrarComandos() {
    if (!TOKEN || !CLIENT_ID) {
        console.warn(
            '⚠️ Configure DISCORD_TOKEN e CLIENT_ID nas variáveis de ambiente.'
        );
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

        console.log(
            `✅ ${comandos.length} comandos slash registrados.`
        );
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
let intervaloAtividade = null;

function atualizarAtividade() {
    if (!client.user || series.length === 0) return;

    client.user.setActivity(series[indiceSerie], {
        type: ActivityType.Watching
    });

    indiceSerie = (indiceSerie + 1) % series.length;
}

// ======================================================
// FUNÇÕES AUXILIARES DE CALL
// ======================================================

function obterCall(interaction) {
    return interaction.member?.voice?.channel || null;
}

function ehBooster(membro) {
    return Boolean(
        membro?.roles?.cache?.has(CARGO_BOOSTER)
    );
}

function estaNaCategoriaCall(canal) {
    return Boolean(
        canal &&
        canal.parentId === CATEGORIA_CALL
    );
}

// Um canal só é temporário se tiver sido registrado
// no momento em que o bot o criou.
// Estar na categoria não é suficiente.
function ehCallTemporaria(canal) {
    if (
        !canal ||
        canal.type !== ChannelType.GuildVoice ||
        !estaNaCategoriaCall(canal)
    ) {
        return false;
    }

    const calls = obterCallsTemporarias();

    return calls[canal.id] === true;
}

// Controles comuns das calls temporárias.
function podeControlarCall(interaction, canal) {
    if (!canal || !interaction.member) {
        return false;
    }

    if (
        ehCallTemporaria(canal) &&
        interaction.member.voice?.channelId === canal.id
    ) {
        return true;
    }

    return Boolean(
        interaction.memberPermissions?.has(
            PermissionFlagsBits.ManageChannels
        )
    );
}

// PRIVACIDADE PARA QUALQUER CALL DE VOZ.
function podeAlterarPrivacidade(interaction, canal) {
    if (
        !canal ||
        ![
            ChannelType.GuildVoice,
            ChannelType.GuildStageVoice
        ].includes(canal.type)
    ) {
        return false;
    }

    if (
        interaction.memberPermissions?.has(
            PermissionFlagsBits.ManageChannels
        )
    ) {
        return true;
    }

    return (
        interaction.member?.voice?.channelId === canal.id
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
// EXCLUSÃO DE CALLS TEMPORÁRIAS VAZIAS
// ======================================================

function programarExclusaoCall(canal) {
    // Proteção principal: sem registro, não agenda exclusão.
    if (!ehCallTemporaria(canal)) return;

    cancelarTemporizadorCall(canal.id);

    const temporizador = setTimeout(async () => {
        try {
            const atual = await canal.guild.channels
                .fetch(canal.id)
                .catch(() => null);

            // Confere novamente o registro antes de apagar.
            if (
                ehCallTemporaria(atual) &&
                atual.members.size === 0
            ) {
                await atual.delete(
                    'Call temporária criada pelo bot e vazia há 10 segundos.'
                );

                removerRegistroCall(atual.id);

                console.log(
                    `🗑️ Call temporária criada pelo bot e excluída: ${atual.name}`
                );
            }
        } catch (erro) {
            console.error(
                'Erro ao excluir call temporária:',
                erro
            );
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

    if (!guild || !membro || !membro.user) {
        return responderErro(
            interaction,
            '❌ Use esta opção dentro do servidor.'
        );
    }

    try {
        const categoria = await guild.channels
            .fetch(CATEGORIA_CALL)
            .catch(() => null);

        if (
            !categoria ||
            categoria.type !== ChannelType.GuildCategory
        ) {
            return responderErro(
                interaction,
                '❌ A categoria das calls não foi encontrada. Confira o ID configurado.'
            );
        }

        const canais = await guild.channels.fetch();

        // Usa somente o nome de usuário, sem ID.
        const nomeSeguro = (
            membro.user.username || 'membro'
        )
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 100) || 'membro';

        // Evita nomes duplicados.
        let nome = nomeSeguro;
        let numero = 2;

        while (
            canais.some(canal =>
                canal &&
                canal.type === ChannelType.GuildVoice &&
                canal.parentId === CATEGORIA_CALL &&
                canal.name === nome
            )
        ) {
            const sufixo = `-${numero}`;
            nome = `${nomeSeguro.slice(0, 100 - sufixo.length)}${sufixo}`;
            numero++;
        }

        const canal = await guild.channels.create({
            name: nome,
            type: ChannelType.GuildVoice,
            parent: CATEGORIA_CALL,
            permissionOverwrites: [
                {
                    id: guild.roles.everyone.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.Connect,
                        PermissionFlagsBits.Speak
                    ]
                }
            ]
        });

        // Registra imediatamente o ID do canal criado pelo bot.
        // Se não conseguir confirmar o registro, não deixa o canal
        // sem proteção: tenta removê-lo e informa o erro.
        const registrado = registrarCallTemporaria(canal.id);

        if (!registrado) {
            await canal.delete(
                'Não foi possível registrar a call temporária.'
            ).catch(() => null);

            return responderErro(
                interaction,
                '❌ Não consegui registrar a call com segurança. Tente novamente.'
            );
        }

        await interaction.reply({
            content:
                `✅ **Call criada com sucesso!**\n` +
                `🎙️ **Vá para a call:** ${canal}`,
            flags: MessageFlags.Ephemeral
        });

        if (membro.voice?.channel) {
            try {
                await membro.voice.setChannel(canal);
            } catch (erro) {
                console.error(
                    'Não consegui mover o criador para a call:',
                    erro
                );

                await interaction.followUp({
                    content:
                        '⚠️ A call foi criada, mas não consegui mover você. Entre pelo canal criado.',
                    flags: MessageFlags.Ephemeral
                }).catch(() => null);
            }
        }

        console.log(
            `🎙️ Call temporária registrada: ${canal.name} (${canal.id})`
        );

        return canal;
    } catch (erro) {
        console.error('Erro ao criar call:', erro);

        return responderErro(
            interaction,
            '❌ Não consegui criar a call. Confira as permissões do bot e a categoria.'
        );
    }
}

// ======================================================
// PRIVACIDADE DE QUALQUER CALL DE VOZ
// ======================================================

async function privarCall(canal) {
    if (
        !canal ||
        ![
            ChannelType.GuildVoice,
            ChannelType.GuildStageVoice
        ].includes(canal.type)
    ) {
        throw new Error('Canal de voz inválido.');
    }

    await canal.permissionOverwrites.edit(
        canal.guild.roles.everyone.id,
        {
            ViewChannel: false,
            Connect: false
        }
    );

    for (const membro of canal.members.values()) {
        await canal.permissionOverwrites.edit(membro.id, {
            ViewChannel: true,
            Connect: true,
            Speak: true
        });
    }
}

async function liberarCall(canal) {
    if (
        !canal ||
        ![
            ChannelType.GuildVoice,
            ChannelType.GuildStageVoice
        ].includes(canal.type)
    ) {
        throw new Error('Canal de voz inválido.');
    }

    await canal.permissionOverwrites.edit(
        canal.guild.roles.everyone.id,
        {
            ViewChannel: true,
            Connect: true
        }
    );
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
// BOTÕES DAS PUBLICAÇÕES
// ======================================================

function criarBotoesPublicacao(id) {
    const linha1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`pub_like_${id}`)
            .setLabel('Curtir')
            .setEmoji('<a:pureza_h:1562608729336320093> ')
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(`pub_comentar_${id}`)
            .setLabel('Comentar')
            .setEmoji('<:kxv:1561583471841906791> ')
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(`pub_compartilhar_${id}`)
            .setLabel('Compartilhar')
            .setEmoji('<a:pureza_h:1562608731521286205> ')
            .setStyle(ButtonStyle.Secondary)
    );

    const linha2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`pub_detalhes_${id}`)
            .setLabel('Detalhes')
            .setEmoji('<a:pureza_h:1562211568719110316> ')
            .setStyle(ButtonStyle.Secondary)
    );

    return [linha1, linha2];
}
// ======================================================
// PUBLICAÇÕES
// ======================================================

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

        if (!canal?.isTextBased() || !canal.send) return;

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
                const buffer = Buffer.from(
                    await resposta.arrayBuffer()
                );

                const extensao = (imagem.name || '')
                    .match(/\.(png|jpe?g|gif|webp)$/i);

                const nomeArquivo =
                    `publicacao-${mensagem.id}${extensao?.[0] || '.png'}`;

                arquivos.push(
                    new AttachmentBuilder(buffer, {
                        name: nomeArquivo
                    })
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
            console.warn(
                'Não consegui apagar a mensagem original:',
                erro.message
            );
        });

        console.log(`📣 Publicação criada: ${mensagem.id}`);
    } catch (erro) {
        console.error('Erro ao publicar mensagem:', erro);
    }
}

// ======================================================
// LIMPEZA SEMANAL DE MENSAGENS
// ======================================================

async function limparCanalSemanal() {
    try {
        const canal = await client.channels
            .fetch(CANAL_LIMPEZA_ID)
            .catch(() => null);

        if (!canal?.isTextBased() || !canal.messages) {
            console.error(
                '❌ Canal de limpeza não encontrado ou inválido.'
            );
            return;
        }

        let total = 0;

        while (true) {
            const mensagens = await canal.messages.fetch({
                limit: 100
            });

            if (mensagens.size === 0) break;

            const recentes = mensagens.filter(m =>
                Date.now() - m.createdTimestamp <
                14 * 24 * 60 * 60 * 1000
            );

            const antigas = mensagens.filter(m =>
                Date.now() - m.createdTimestamp >=
                14 * 24 * 60 * 60 * 1000
            );

            if (recentes.size > 0) {
                const excluidas = await canal.bulkDelete(
                    recentes,
                    true
                ).catch(() => null);

                if (excluidas) total += excluidas.size;
            }

            for (const mensagem of antigas.values()) {
                await mensagem.delete()
                    .then(() => total++)
                    .catch(() => null);

                await new Promise(resolve =>
                    setTimeout(resolve, 350)
                );
            }

            if (mensagens.size < 100) break;
        }

        const estado = lerJSON(ARQUIVO_LIMPEZA);
        estado.ultimaLimpeza = new Date().toISOString();
        estado.totalExcluidas = total;
        salvarJSON(ARQUIVO_LIMPEZA, estado);

        console.log(
            `✅ Limpeza concluída. Total excluído: ${total}`
        );
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

    if (intervaloAtividade) {
        clearInterval(intervaloAtividade);
    }

    intervaloAtividade = setInterval(
        atualizarAtividade,
        INTERVALO_ATIVIDADE
    );

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
            ehCallTemporaria(canalAnterior) &&
            canalAnterior.members.size === 0
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
        // COMANDOS SLASH
        if (interaction.isChatInputCommand()) {
            const comando = client.commands.get(
                interaction.commandName
            );

            if (!comando) {
                return responderErro(
                    interaction,
                    '❌ Comando não encontrado.'
                );
            }

            try {
                await comando.execute(interaction, client);
            } catch (erro) {
                console.error(
                    `Erro no comando ${interaction.commandName}:`,
                    erro
                );

                await responderErro(
                    interaction,
                    '❌ Erro ao executar o comando.'
                );
            }

            return;
        }

        // MENUS DE SELEÇÃO
        if (interaction.isStringSelectMenu()) {
            const id = interaction.customId;

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

            if (id === 'controle_call') {
                const opcao = interaction.values[0];
                const canal = obterCall(interaction);

                if (opcao === 'criar_call') {
                    return criarCallTemporaria(interaction);
                }

                if (opcao === 'desmutar') {
                    if (!interaction.member?.voice?.channel) {
                        return responderErro(
                            interaction,
                            '❌ Entre em uma chamada primeiro.'
                        );
                    }

                    try {
                        await interaction.member.voice.setMute(false);

                        return responderSucesso(
                            interaction,
                            '🔊 Seu mute de servidor foi removido.'
                        );
                    } catch (erro) {
                        console.error('Erro ao desmutar:', erro);

                        return responderErro(
                            interaction,
                            '❌ Não consegui retirar seu mute. Verifique as permissões do bot.'
                        );
                    }
                }

                if (!canal) {
                    return responderErro(
                        interaction,
                        '❌ Entre em uma chamada antes de usar esta ferramenta.'
                    );
                }

                if (
                    opcao === 'privar_call' ||
                    opcao === 'desprivar_call'
                ) {
                    if (!podeAlterarPrivacidade(interaction, canal)) {
                        return responderErro(
                            interaction,
                            '❌ Você precisa estar na chamada que deseja controlar.'
                        );
                    }

                    try {
                        if (opcao === 'privar_call') {
                            await privarCall(canal);

                            return responderSucesso(
                                interaction,
                                '🔒 A chamada foi privatizada. Os membros que já estão nela continuam com acesso.'
                            );
                        }

                        await liberarCall(canal);

                        return responderSucesso(
                            interaction,
                            '🔓 A chamada voltou a ser pública.'
                        );
                    } catch (erro) {
                        console.error(
                            'Erro ao alterar privacidade pelo menu:',
                            erro
                        );

                        return responderErro(
                            interaction,
                            '❌ Não consegui alterar a privacidade. Confira se o bot tem Gerenciar canais.'
                        );
                    }
                }

                if (
                    !ehCallTemporaria(canal) ||
                    !podeControlarCall(interaction, canal)
                ) {
                    return responderErro(
                        interaction,
                        '❌ Você precisa estar dentro de uma call temporária para usar este controle.'
                    );
                }

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

                if (opcao === 'mover') {
                    const seletor = new UserSelectMenuBuilder()
                        .setCustomId('call_selecionar_membro')
                        .setPlaceholder('Escolha quem deseja mover')
                        .setMinValues(1)
                        .setMaxValues(1);

                    return interaction.reply({
                        content:
                            '➡️ Selecione o membro que deseja mover para sua chamada.',
                        components: [
                            new ActionRowBuilder().addComponents(seletor)
                        ],
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (opcao === 'mutar') {
                    if (!ehBooster(interaction.member)) {
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
                        content: '🔇 Selecione quem deseja mutar.',
                        components: [
                            new ActionRowBuilder().addComponents(seletor)
                        ],
                        flags: MessageFlags.Ephemeral
                    });
                }

                return responderErro(
                    interaction,
                    '❌ Esta ferramenta não é reconhecida.'
                );
            }

            return;
        }

        // BOTÕES
        if (interaction.isButton()) {
            const id = interaction.customId;

            if (id === 'criar_call') {
                return criarCallTemporaria(interaction);
            }

            if (id === 'abrir_controle_call') {
                return interaction.reply({
                    ...criarPainelCall(),
                    flags: MessageFlags.Ephemeral
                });
            }

            if (id === 'call_limite') {
                const canal = obterCall(interaction);

                if (
                    !canal ||
                    !ehCallTemporaria(canal) ||
                    !podeControlarCall(interaction, canal)
                ) {
                    return responderErro(
                        interaction,
                        '❌ Entre em uma call temporária para usar esse controle.'
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

            if (id === 'call_mover') {
                const canal = obterCall(interaction);

                if (
                    !canal ||
                    !ehCallTemporaria(canal) ||
                    !podeControlarCall(interaction, canal)
                ) {
                    return responderErro(
                        interaction,
                        '❌ Entre em uma call temporária para usar esse controle.'
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
                    flags: MessageFlags.Ephemeral
                });
            }

            if (id === 'call_mutar') {
                if (!ehBooster(interaction.member)) {
                    return responderErro(
                        interaction,
                        '❌ Este recurso é exclusivo para Boosters.'
                    );
                }

                const canal = obterCall(interaction);

                if (
                    !canal ||
                    !ehCallTemporaria(canal) ||
                    !podeControlarCall(interaction, canal)
                ) {
                    return responderErro(
                        interaction,
                        '❌ Entre em uma call temporária para usar esse controle.'
                    );
                }

                const seletor = new UserSelectMenuBuilder()
                    .setCustomId('call_selecionar_mutar')
                    .setPlaceholder('Escolha quem deseja mutar')
                    .setMinValues(1)
                    .setMaxValues(1);

                return interaction.reply({
                    content: '🔇 Selecione quem deseja mutar.',
                    components: [
                        new ActionRowBuilder().addComponents(seletor)
                    ],
                    flags: MessageFlags.Ephemeral
                });
            }

            if (id === 'call_desmutar') {
                if (!interaction.member?.voice?.channel) {
                    return responderErro(
                        interaction,
                        '❌ Entre em uma call primeiro.'
                    );
                }

                try {
                    await interaction.member.voice.setMute(false);

                    return responderSucesso(
                        interaction,
                        '🔊 Seu mute de servidor foi removido.'
                    );
                } catch (erro) {
                    console.error('Erro ao desmutar:', erro);

                    return responderErro(
                        interaction,
                        '❌ Não consegui retirar seu mute. Confira as permissões do bot.'
                    );
                }
            }

            if (id === 'call_privada' || id === 'call_publica') {
                const canal = obterCall(interaction);

                if (!canal) {
                    return responderErro(
                        interaction,
                        '❌ Entre em uma chamada primeiro.'
                    );
                }

                if (!podeAlterarPrivacidade(interaction, canal)) {
                    return responderErro(
                        interaction,
                        '❌ Você precisa estar na chamada que deseja controlar.'
                    );
                }

                try {
                    if (id === 'call_privada') {
                        await privarCall(canal);

                        return responderSucesso(
                            interaction,
                            '🔒 Sua call foi privatizada. Os membros que já estão nela continuam com acesso.'
                        );
                    }

                    await liberarCall(canal);

                    return responderSucesso(
                        interaction,
                        '🔓 Sua call voltou a ser pública.'
                    );
                } catch (erro) {
                    console.error(
                        'Erro ao alterar privacidade da call:',
                        erro
                    );

                    return responderErro(
                        interaction,
                        '❌ Não consegui alterar a privacidade. Confira se o bot tem Gerenciar canais.'
                    );
                }
            }

            // CURTIDAS
            if (id.startsWith('pub_like_')) {
                const publicacaoId = id.slice('pub_like_'.length);
                const publicacoes = obterPublicacoes();
                const publicacao = publicacoes[publicacaoId];

                if (!publicacao) {
                    return responderErro(
                        interaction,
                        '❌ Publicação não encontrada.'
                    );
                }

                if (!Array.isArray(publicacao.curtidas)) {
                    publicacao.curtidas = [];
                }

                const indice = publicacao.curtidas.indexOf(
                    interaction.user.id
                );

                if (indice !== -1) {
                    publicacao.curtidas.splice(indice, 1);
                    salvarPublicacoes(publicacoes);

                    return responderSucesso(
                        interaction,
                        '❤️ Você removeu sua curtida.'
                    );
                }

                publicacao.curtidas.push(interaction.user.id);
                salvarPublicacoes(publicacoes);

                return responderSucesso(
                    interaction,
                    `❤️ Você curtiu a publicação! Total: ${publicacao.curtidas.length}`
                );
            }

            // COMENTÁRIOS
            if (id.startsWith('pub_comentar_')) {
                const publicacaoId = id.slice('pub_comentar_'.length);
                const publicacoes = obterPublicacoes();

                if (!publicacoes[publicacaoId]) {
                    return responderErro(
                        interaction,
                        '❌ Publicação não encontrada.'
                    );
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
                    return responderErro(
                        interaction,
                        '❌ Publicação não encontrada.'
                    );
                }

                const mensagemId = publicacao.mensagemPublicadaId;

                const link = mensagemId
                    ? `https://discord.com/channels/${publicacao.guildId}/${CANAL_PUBLICACOES_ID}/${mensagemId}`
                    : null;

                return responderSucesso(
                    interaction,
                    link
                        ? `🔁 Compartilhe esta publicação:\n${link}`
                        : '❌ Não consegui gerar o link.'
                );
            }

            // DETALHES
            if (id.startsWith('pub_detalhes_')) {
                const publicacaoId = id.slice('pub_detalhes_'.length);
                const publicacoes = obterPublicacoes();
                const publicacao = publicacoes[publicacaoId];

                if (!publicacao) {
                    return responderErro(
                        interaction,
                        '❌ Publicação não encontrada.'
                    );
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
                    flags: MessageFlags.Ephemeral
                });
            }

            return;
        }

        // MENUS DE USUÁRIOS
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

            if (
                !canal ||
                !ehCallTemporaria(canal) ||
                !podeControlarCall(interaction, canal)
            ) {
                return responderErro(
                    interaction,
                    '❌ Entre em uma call temporária para usar esse controle.'
                );
            }

            const alvo = await interaction.guild.members
                .fetch(interaction.values[0])
                .catch(() => null);

            if (!alvo) {
                return responderErro(
                    interaction,
                    '❌ Não encontrei esse membro.'
                );
            }

            // MUTAR MEMBRO
            if (id === 'call_selecionar_mutar') {
                if (!ehBooster(interaction.member)) {
                    return responderErro(
                        interaction,
                        '❌ Opção exclusiva para Boosters.'
                    );
                }

                if (alvo.id === interaction.user.id) {
                    return responderErro(
                        interaction,
                        '❌ Selecione outro membro.'
                    );
                }

                if (alvo.voice.channelId !== canal.id) {
                    return responderErro(
                        interaction,
                        '❌ O membro precisa estar na sua call.'
                    );
                }

                try {
                    await alvo.voice.setMute(true);

                    return interaction.update({
                        content: `🔇 ${alvo} foi mutado no servidor.`,
                        components: []
                    });
                } catch (erro) {
                    console.error('Erro ao mutar membro:', erro);

                    return responderErro(
                        interaction,
                        '❌ Não consegui mutar esse membro. Confira as permissões do bot.'
                    );
                }
            }

            if (!alvo.voice.channel) {
                return responderErro(
                    interaction,
                    '❌ Esse membro não está em uma call.'
                );
            }

            if (alvo.id === interaction.user.id) {
                return responderErro(
                    interaction,
                    '❌ Selecione outro membro.'
                );
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
                    content:
                        `👤 Membro selecionado: **${alvo.user.username}**\nEscolha a call de destino:`,
                    components: [
                        new ActionRowBuilder().addComponents(seletor)
                    ]
                });
            }

            const botMembro = await interaction.guild.members.fetchMe();

            if (!botMembro.permissions.has(PermissionFlagsBits.MoveMembers)) {
                return responderErro(
                    interaction,
                    '❌ Preciso da permissão Mover membros.'
                );
            }

            try {
                await alvo.voice.setChannel(canal);

                return interaction.update({
                    content: `✅ ${alvo} foi movido para ${canal}.`,
                    components: []
                });
            } catch (erro) {
                console.error('Erro ao mover membro:', erro);

                return responderErro(
                    interaction,
                    '❌ Não consegui mover esse membro. Confira as permissões do bot.'
                );
            }
        }

        // MENU DE CANAL DE DESTINO
        if (
            interaction.isChannelSelectMenu() &&
            interaction.customId.startsWith('mover_canal:')
        ) {
            const canalAtual = obterCall(interaction);

            if (
                !canalAtual ||
                !ehCallTemporaria(canalAtual) ||
                !podeControlarCall(interaction, canalAtual)
            ) {
                return responderErro(
                    interaction,
                    '❌ Entre em uma call temporária para usar esse controle.'
                );
            }

            const alvoId = interaction.customId.split(':')[1];

            const alvo = await interaction.guild.members
                .fetch(alvoId)
                .catch(() => null);

            if (!alvo || !alvo.voice.channel) {
                return responderErro(
                    interaction,
                    '❌ Esse membro não está mais em uma call.'
                );
            }

            const destino = await interaction.guild.channels
                .fetch(interaction.values[0])
                .catch(() => null);

            if (
                !destino ||
                ![
                    ChannelType.GuildVoice,
                    ChannelType.GuildStageVoice
                ].includes(destino.type)
            ) {
                return responderErro(
                    interaction,
                    '❌ Canal de destino inválido.'
                );
            }

            const botMembro = await interaction.guild.members.fetchMe();

            if (!botMembro.permissions.has(PermissionFlagsBits.MoveMembers)) {
                return responderErro(
                    interaction,
                    '❌ Preciso da permissão Mover membros.'
                );
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

        // FORMULÁRIOS / MODAIS
        if (interaction.isModalSubmit()) {
            // LIMITE DE PESSOAS
            if (interaction.customId === 'modal_limite_call') {
                const canal = obterCall(interaction);

                if (
                    !canal ||
                    !ehCallTemporaria(canal) ||
                    !podeControlarCall(interaction, canal)
                ) {
                    return responderErro(
                        interaction,
                        '❌ Entre em uma call temporária para usar esse controle.'
                    );
                }

                const campoId = interaction.fields.fields.has('limite')
                    ? 'limite'
                    : 'limite_pessoas';

                const valor = interaction.fields
                    .getTextInputValue(campoId)
                    .trim();

                if (!/^\d{1,2}$/.test(valor) || Number(valor) > 99) {
                    return responderErro(
                        interaction,
                        '❌ Digite um número de 0 a 99. Use 0 para remover o limite.'
                    );
                }

                try {
                    await canal.setUserLimit(Number(valor));

                    return responderSucesso(
                        interaction,
                        Number(valor) === 0
                            ? '✅ Limite removido.'
                            : `✅ Limite definido para ${valor} pessoas.`
                    );
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
                    return responderErro(
                        interaction,
                        '❌ Opção exclusiva para Boosters.'
                    );
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

                    return responderSucesso(
                        interaction,
                        '✅ Membro mutado com sucesso.'
                    );
                } catch (erro) {
                    console.error('Erro ao mutar membro pelo modal:', erro);

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
                    return responderErro(
                        interaction,
                        '❌ Publicação não encontrada.'
                    );
                }

                const comentario = interaction.fields
                    .getTextInputValue('comentario')
                    .trim();

                if (!comentario) {
                    return responderErro(
                        interaction,
                        '❌ Escreva um comentário.'
                    );
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

                return responderSucesso(
                    interaction,
                    '✅ Seu comentário foi registrado.'
                );
            }

            return;
        }
    } catch (erro) {
        console.error(
            '❌ Erro geral em interactionCreate:',
            erro
        );

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
    console.error(
        '❌ DISCORD_TOKEN não foi encontrado nas variáveis de ambiente.'
    );
} else {
    client.login(TOKEN).catch(erro => {
        console.error(
            '❌ Não foi possível conectar o bot:',
            erro
        );
    });
}
