
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
    StringSelectMenuBuilder,
    REST,
    Routes,
    AttachmentBuilder
} = require('discord.js');

// ======================================================
// CONFIGURAÇÕES
// ======================================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const CATEGORIA_CALL = '1560763293994323999';
const CARGO_BOOSTER = '1559367297053757551';

const CANAL_PUBLICACOES_ID = '1561569037694275584';
const CANAL_LIMPEZA_ID = '1559375230202290256';

const FUSO_HORARIO = 'America/Sao_Paulo';

const TEMPO_EXCLUSAO_CALL_VAZIA = 10_000;
const INTERVALO_ATIVIDADE = 10 * 60 * 60 * 1000;

const DATA_DIR = path.join(__dirname, 'data');
const ARQUIVO_PUBLICACOES = path.join(DATA_DIR, 'publicacoes.json');
const ARQUIVO_LIMPEZA = path.join(DATA_DIR, 'limpeza.json');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function garantirArquivo(arquivo, conteudo = {}) {
    if (!fs.existsSync(arquivo)) {
        fs.writeFileSync(
            arquivo,
            JSON.stringify(conteudo, null, 2)
        );
    }
}

garantirArquivo(ARQUIVO_PUBLICACOES, {});
garantirArquivo(ARQUIVO_LIMPEZA, {});

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

// ======================================================
// ESTADO TEMPORÁRIO
// ======================================================

const temporizadoresCall = new Map();
const cooldowns = new Map();
const comentariosTemporarios = new Map();

// ======================================================
// FUNÇÕES DE ARQUIVO
// ======================================================

function lerJSON(arquivo, padrao = {}) {
    try {
        if (!fs.existsSync(arquivo)) {
            return padrao;
        }

        return JSON.parse(
            fs.readFileSync(arquivo, 'utf8')
        );
    } catch (erro) {
        console.error(
            `Erro ao ler ${path.basename(arquivo)}:`,
            erro
        );

        return padrao;
    }
}

function salvarJSON(arquivo, dados) {
    try {
        fs.writeFileSync(
            arquivo,
            JSON.stringify(dados, null, 2)
        );
    } catch (erro) {
        console.error(
            `Erro ao salvar ${path.basename(arquivo)}:`,
            erro
        );
    }
}

// ======================================================
// CARREGAMENTO DE COMANDOS SLASH
// ======================================================

const pastaComandos = path.join(__dirname, 'commands');

if (fs.existsSync(pastaComandos)) {
    const arquivosComandos = fs
        .readdirSync(pastaComandos)
        .filter(arquivo => arquivo.endsWith('.js'));

    for (const arquivo of arquivosComandos) {
        try {
            const caminho = path.join(
                pastaComandos,
                arquivo
            );

            delete require.cache[require.resolve(caminho)];

            const comando = require(caminho);

            if (comando.data && comando.execute) {
                client.commands.set(
                    comando.data.name,
                    comando
                );

                console.log(
                    `✅ Comando carregado: ${comando.data.name}`
                );
            } else {
                console.warn(
                    `⚠️ O comando ${arquivo} não possui data ou execute.`
                );
            }
        } catch (erro) {
            console.error(
                `Erro carregando ${arquivo}:`,
                erro
            );
        }
    }
} else {
    console.warn(
        '⚠️ A pasta commands não foi encontrada.'
    );
}

// ======================================================
// PUBLICAÇÃO DE COMANDOS SLASH
// ======================================================

async function registrarComandos() {
    if (!TOKEN || !CLIENT_ID) {
        console.warn(
            '⚠️ DISCORD_TOKEN ou CLIENT_ID não configurado. Registro de comandos ignorado.'
        );

        return;
    }

    const comandos = [];

    for (const comando of client.commands.values()) {
        comandos.push(
            comando.data.toJSON()
        );
    }

    if (comandos.length === 0) {
        console.log(
            'Nenhum comando slash encontrado para registrar.'
        );

        return;
    }

    try {
        const rest = new REST({
            version: '10'
        }).setToken(TOKEN);

        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            {
                body: comandos
            }
        );

        console.log(
            `✅ ${comandos.length} comandos slash registrados.`
        );
    } catch (erro) {
        console.error(
            'Erro ao registrar comandos slash:',
            erro
        );
    }
}

// ======================================================
// ATIVIDADES DO BOT
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

    const serie = series[indiceSerie];

    client.user.setActivity(serie, {
        type: ActivityType.Watching
    });

    console.log(
        `📺 Atividade atualizada: ${serie}`
    );

    indiceSerie = (indiceSerie + 1) % series.length;
}

// ======================================================
// SISTEMA DE CHAMADAS TEMPORÁRIAS
// ======================================================

function cancelarTemporizadorCall(canalId) {
    const temporizador = temporizadoresCall.get(canalId);

    if (temporizador) {
        clearTimeout(temporizador);
        temporizadoresCall.delete(canalId);
    }
}

function programarExclusaoCall(canal) {
    if (!canal || canal.type !== ChannelType.GuildVoice) {
        return;
    }

    cancelarTemporizadorCall(canal.id);

    const temporizador = setTimeout(async () => {
        try {
            const canalAtual = await canal.guild.channels
                .fetch(canal.id)
                .catch(() => null);

            if (!canalAtual) {
                temporizadoresCall.delete(canal.id);
                return;
            }

            if (
                canalAtual.type === ChannelType.GuildVoice &&
                canalAtual.members.size === 0
            ) {
                await canalAtual.delete(
                    'Chamada temporária vazia.'
                );

                console.log(
                    `🗑️ Chamada vazia excluída: ${canalAtual.name}`
                );
            }
        } catch (erro) {
            console.error(
                'Erro ao excluir chamada temporária:',
                erro
            );
        } finally {
            temporizadoresCall.delete(canal.id);
        }
    }, TEMPO_EXCLUSAO_CALL_VAZIA);

    temporizadoresCall.set(
        canal.id,
        temporizador
    );
}

async function criarCallTemporaria(interaction) {
    const guild = interaction.guild;
    const membro = interaction.member;

    if (!guild || !membro) {
        return interaction.reply({
            content: '❌ Este recurso só funciona dentro de um servidor.',
            ephemeral: true
        });
    }

    const categoria = await guild.channels
        .fetch(CATEGORIA_CALL)
        .catch(() => null);

    if (
        !categoria ||
        categoria.type !== ChannelType.GuildCategory
    ) {
        return interaction.reply({
            content: '❌ A categoria das chamadas não foi encontrada. Confira o ID configurado.',
            ephemeral: true
        });
    }

    const canalExistente = guild.channels.cache.find(canal =>
        canal.type === ChannelType.GuildVoice &&
        canal.parentId === CATEGORIA_CALL &&
        canal.topic === `call-temporaria:${membro.id}`
    );

    if (canalExistente) {
        return interaction.reply({
            content: `❌ Você já possui uma chamada: ${canalExistente}`,
            ephemeral: true
        });
    }

    try {
        const canal = await guild.channels.create({
            name: `call-${membro.user.username}`
                .toLowerCase()
                .replace(/[^a-z0-9-_]/g, '')
                .slice(0, 90),
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

        await canal.setUserLimit(0);

        await canal.permissionOverwrites.edit(
            membro.id,
            {
                ViewChannel: true,
                Connect: true,
                Speak: true,
                ManageChannels: true,
                MoveMembers: true
            }
        );

        await interaction.reply({
            content: `✅ Sua chamada temporária foi criada: ${canal}`,
            ephemeral: true
        });

        await membro.voice.setChannel(canal).catch(() => null);

        return canal;
    } catch (erro) {
        console.error(
            'Erro ao criar chamada temporária:',
            erro
        );

        if (interaction.replied || interaction.deferred) {
            return interaction.followUp({
                content: '❌ Não consegui criar sua chamada. Verifique as permissões do bot.',
                ephemeral: true
            });
        }

        return interaction.reply({
            content: '❌ Não consegui criar sua chamada. Verifique as permissões do bot.',
            ephemeral: true
        });
    }
}

// ======================================================
// PAINEL DE CONTROLE DAS CHAMADAS
// ======================================================

function criarPainelCall() {
    const embed = new EmbedBuilder()
        .setTitle('🎙️ Controle de chamada')
        .setDescription(
            [
                'Use os botões abaixo para controlar sua chamada.',
                '',
                '🔢 **Limite:** definir o limite de pessoas.',
                '➡️ **Mover:** mover alguém para sua chamada.',
                '🔇 **Mutar:** disponível para Booster.',
                '🔊 **Desmutar:** retirar seu próprio mute de servidor.',
                '🔒 **Privar:** restringir o acesso à chamada.',
                '🔓 **Liberar:** permitir que todos entrem novamente.'
            ].join('\n')
        )
        .setColor(0x5865F2);

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
            .setLabel('Privar chamada')
            .setEmoji('🔒')
            .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId('call_publica')
            .setLabel('Liberar chamada')
            .setEmoji('🔓')
            .setStyle(ButtonStyle.Success)
    );

    return {
        embeds: [embed],
        components: [linha1, linha2]
    };
}

// ======================================================
// SISTEMA DE PUBLICAÇÕES
// ======================================================

function obterPublicacoes() {
    return lerJSON(ARQUIVO_PUBLICACOES, {});
}

function salvarPublicacoes(dados) {
    salvarJSON(ARQUIVO_PUBLICACOES, dados);
}

// Cria os quatro botões com estilo cinza.
function criarBotoesPublicacao(id) {
    const linha = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`pub_like_${id}`)
            .setLabel('Curtir')
            .setEmoji('❤️')
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(`pub_comentar_${id}`)
            .setLabel('Comentar')
            .setEmoji('💬')
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(`pub_compartilhar_${id}`)
            .setLabel('Compartilhar')
            .setEmoji('🔁')
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(`pub_detalhes_${id}`)
            .setLabel('Detalhes')
            .setEmoji('ℹ️')
            .setStyle(ButtonStyle.Secondary)
    );

    return [linha];
}

async function publicarMensagem(mensagem) {
    if (mensagem.author.bot) return;

    if (mensagem.channelId !== CANAL_PUBLICACOES_ID) {
        return;
    }

    const texto = mensagem.content?.trim() || '';

    // Identifica imagens anexadas à mensagem.
    const imagensAnexadas = [
        ...mensagem.attachments.values()
    ]
        .filter(anexo =>
            anexo.contentType?.startsWith('image/') ||
            /\.(png|jpe?g|gif|webp)$/i.test(
                anexo.name || ''
            )
        )
        .slice(0, 4);

    if (!texto && imagensAnexadas.length === 0) {
        return;
    }

    try {
        const canalPublicacoes = await mensagem.guild.channels
            .fetch(CANAL_PUBLICACOES_ID)
            .catch(() => null);

        if (!canalPublicacoes?.isTextBased()) {
            console.error(
                'Canal de publicações não encontrado ou inválido.'
            );
            return;
        }

        const publicacoes = obterPublicacoes();

        const nomeAutor =
            mensagem.member?.displayName ||
            mensagem.author.globalName ||
            mensagem.author.username;

        const avatarURL = mensagem.author.displayAvatarURL({
            extension: 'png',
            size: 256
        });

        const dataPublicacao = new Date();

        // Embed preto: a identidade do autor fica no cabeçalho,
        // com avatar, nome e data.
        const embed = new EmbedBuilder()
            .setColor(0x000000)
            .setAuthor({
                name: nomeAutor,
                iconURL: avatarURL
            })
            .setDescription(
                texto
                    ? texto.slice(0, 4096)
                    : '\u200B'
            )
            .setFooter({
                text: 'ZODÍACO • PUBLICAÇÃO'
            })
            .setTimestamp(dataPublicacao);

        const arquivos = [];

        // Sem imagem: o embed contém apenas o texto.
        // Com imagem: a primeira imagem fica dentro do embed.
        if (imagensAnexadas.length > 0) {
            const primeiraImagem = imagensAnexadas[0];

            const respostaImagem = await fetch(
                primeiraImagem.url
            );

            if (!respostaImagem.ok) {
                throw new Error(
                    `Falha ao baixar a imagem: HTTP ${respostaImagem.status}`
                );
            }

            const bufferImagem = Buffer.from(
                await respostaImagem.arrayBuffer()
            );

            const extensaoEncontrada =
                (primeiraImagem.name || '').match(
                    /\.(png|jpe?g|gif|webp)$/i
                );

            const extensao = extensaoEncontrada
                ? extensaoEncontrada[0].toLowerCase()
                : '.png';

            const nomeArquivo =
                `publicacao-${mensagem.id}${extensao}`;

            const arquivo = new AttachmentBuilder(
                bufferImagem,
                {
                    name: nomeArquivo
                }
            );

            arquivos.push(arquivo);

            embed.setImage(
                `attachment://${nomeArquivo}`
            );
        }

        publicacoes[mensagem.id] = {
            autorId: mensagem.author.id,
            autorNome: nomeAutor,
            guildId: mensagem.guild.id,
            canalId: mensagem.channelId,
            texto,
            mensagemOriginalId: mensagem.id,
            curtidas: [],
            comentarios: [],
            data: dataPublicacao.toISOString(),
            mensagemPublicadaId: null
        };

        const mensagemPublicada = await canalPublicacoes.send({
            embeds: [embed],
            files: arquivos,
            components: criarBotoesPublicacao(mensagem.id)
        });

        publicacoes[mensagem.id].mensagemPublicadaId =
            mensagemPublicada.id;

        salvarPublicacoes(publicacoes);

        // Apaga a mensagem original após publicar a versão do bot.
        await mensagem.delete().catch(erro => {
            console.warn(
                'Não foi possível apagar a mensagem original:',
                erro.message
            );
        });

        console.log(
            `📣 Publicação criada: ${mensagem.id}`
        );
    } catch (erro) {
        console.error(
            'Erro ao processar publicação:',
            erro
        );
    }
}

// ======================================================
// LIMPEZA SEMANAL DO CANAL
// ======================================================

// Todo domingo às 00:00 no horário de Brasília.

async function limparCanalSemanal() {
    try {
        const canal = await client.channels
            .fetch(CANAL_LIMPEZA_ID)
            .catch(() => null);

        if (!canal || !canal.isTextBased()) {
            console.error(
                '❌ Canal de limpeza não encontrado ou não é textual.'
            );
            return;
        }

        console.log(
            `🧹 Iniciando limpeza semanal em ${CANAL_LIMPEZA_ID}`
        );

        let totalExcluidas = 0;

        while (true) {
            const mensagens = await canal.messages
                .fetch({ limit: 100 })
                .catch(erro => {
                    console.error(
                        'Erro ao buscar mensagens para limpeza:',
                        erro
                    );

                    return null;
                });

            if (!mensagens || mensagens.size === 0) {
                break;
            }

            const recentes = mensagens.filter(
                mensagem =>
                    Date.now() - mensagem.createdTimestamp <
                    14 * 24 * 60 * 60 * 1000
            );

            const antigas = mensagens.filter(
                mensagem =>
                    Date.now() - mensagem.createdTimestamp >=
                    14 * 24 * 60 * 60 * 1000
            );

            if (recentes.size > 0) {
                const excluidas = await canal.bulkDelete(
                    recentes,
                    true
                ).catch(erro => {
                    console.error(
                        'Erro ao excluir mensagens recentes:',
                        erro
                    );

                    return null;
                });

                if (excluidas) {
                    totalExcluidas += excluidas.size;
                }
            }

            for (const mensagem of antigas.values()) {
                await mensagem.delete().catch(erro => {
                    console.error(
                        `Não foi possível excluir a mensagem ${mensagem.id}:`,
                        erro.message
                    );
                });

                totalExcluidas++;

                await new Promise(resolve =>
                    setTimeout(resolve, 350)
                );
            }

            if (mensagens.size < 100) {
                break;
            }
        }

        console.log(
            `✅ Limpeza concluída. Mensagens excluídas: ${totalExcluidas}`
        );
    } catch (erro) {
        console.error(
            '❌ Erro durante a limpeza semanal:',
            erro
        );
    }
}

cron.schedule(
    '0 0 * * 0',
    async () => {
        await limparCanalSemanal();
    },
    {
        timezone: FUSO_HORARIO
    }
);

// ======================================================
// EVENTO: BOT ONLINE
// ======================================================

client.once('clientReady', async () => {
    console.log(
        `✅ Bot conectado como ${client.user.tag}`
    );

    atualizarAtividade();

    setInterval(
        atualizarAtividade,
        INTERVALO_ATIVIDADE
    );

    await registrarComandos();

    console.log(
        '🤖 Todos os sistemas principais foram iniciados.'
    );
});

// ======================================================
// EVENTO: ESTADO DE VOZ
// ======================================================

client.on('voiceStateUpdate', async (estadoAnterior, estadoAtual) => {
    try {
        const canalAnterior = estadoAnterior.channel;
        const canalAtual = estadoAtual.channel;

        if (canalAtual) {
            cancelarTemporizadorCall(canalAtual.id);
        }

        if (
            canalAnterior &&
            canalAnterior.parentId === CATEGORIA_CALL &&
            canalAnterior.members.size === 0
        ) {
            programarExclusaoCall(canalAnterior);
        }

        if (
            canalAtual &&
            canalAtual.parentId === CATEGORIA_CALL
        ) {
            cancelarTemporizadorCall(canalAtual.id);
        }
    } catch (erro) {
        console.error(
            'Erro no evento de voz:',
            erro
        );
    }
});

// ======================================================
// EVENTO: NOVA MENSAGEM
// ======================================================

client.on('messageCreate', async mensagem => {
    try {
        if (mensagem.author.bot || !mensagem.guild) {
            return;
        }

        await publicarMensagem(mensagem);
    } catch (erro) {
        console.error(
            'Erro no evento messageCreate:',
            erro
        );
    }
});

// ======================================================
// FUNÇÕES AUXILIARES DE INTERAÇÃO
// ======================================================

async function responderErro(interaction, mensagem) {
    const resposta = {
        content: mensagem,
        ephemeral: true
    };

    if (interaction.replied || interaction.deferred) {
        return interaction.followUp(resposta).catch(() => null);
    }

    return interaction.reply(resposta).catch(() => null);
}

function obterCanalDeVozDoMembro(interaction) {
    const membro = interaction.member;

    if (!membro?.voice?.channel) {
        return null;
    }

    return membro.voice.channel;
}

function membroEhBooster(membro) {
    return Boolean(
        membro?.roles?.cache?.has(CARGO_BOOSTER)
    );
}

function verificarPermissaoGerenciarCanal(interaction, canal) {
    if (!canal || !interaction.member) {
        return false;
    }

    const membro = interaction.member;

    if (
        canal.topic === `call-temporaria:${membro.id}`
    ) {
        return true;
    }

    return Boolean(
        membro.permissions?.has(
            PermissionFlagsBits.ManageChannels
        )
    );
}

// ======================================================
// INTERAÇÕES
// ======================================================

client.on('interactionCreate', async interaction => {
    try {
        // --------------------------------------------------
        // COMANDOS SLASH
        // --------------------------------------------------

        if (interaction.isChatInputCommand()) {
            const comando = client.commands.get(
                interaction.commandName
            );

            if (!comando) {
                return responderErro(
                    interaction,
                    '❌ Este comando não foi encontrado.'
                );
            }

            try {
                await comando.execute(
                    interaction,
                    client
                );
            } catch (erro) {
                console.error(
                    `Erro no comando /${interaction.commandName}:`,
                    erro
                );

                await responderErro(
                    interaction,
                    '❌ Ocorreu um erro ao executar este comando.'
                );
            }

            return;
        }

        // --------------------------------------------------
        // MODAIS
        // --------------------------------------------------

        if (interaction.isModalSubmit()) {
            if (
                interaction.customId === 'modal_limite_call'
            ) {
                const canal = obterCanalDeVozDoMembro(
                    interaction
                );

                if (!canal) {
                    return responderErro(
                        interaction,
                        '❌ Entre em uma chamada antes de usar este recurso.'
                    );
                }

                if (
                    canal.parentId !== CATEGORIA_CALL ||
                    !verificarPermissaoGerenciarCanal(
                        interaction,
                        canal
                    )
                ) {
                    return responderErro(
                        interaction,
                        '❌ Você não pode alterar o limite desta chamada.'
                    );
                }

                const valor = interaction.fields
                    .getTextInputValue('limite')
                    .trim();

                const limite = Number(valor);

                if (
                    !Number.isInteger(limite) ||
                    limite < 0 ||
                    limite > 99
                ) {
                    return responderErro(
                        interaction,
                        '❌ Informe um número inteiro entre 0 e 99. Use 0 para remover o limite.'
                    );
                }

                await canal.setUserLimit(limite);

                return interaction.reply({
                    content: limite === 0
                        ? '✅ Limite removido.'
                        : `✅ Limite definido para ${limite} pessoas.`,
                    ephemeral: true
                });
            }

            // Comentário em uma publicação.
            if (
                interaction.customId.startsWith(
                    'modal_comentario_'
                )
            ) {
                const publicacaoId =
                    interaction.customId.replace(
                        'modal_comentario_',
                        ''
                    );

                const publicacoes = obterPublicacoes();
                const publicacao = publicacoes[publicacaoId];

                if (!publicacao) {
                    return responderErro(
                        interaction,
                        '❌ Esta publicação não foi encontrada.'
                    );
                }

                const comentario = interaction.fields
                    .getTextInputValue('comentario')
                    .trim();

                if (!comentario) {
                    return responderErro(
                        interaction,
                        '❌ Escreva um comentário antes de enviar.'
                    );
                }

                if (comentario.length > 1000) {
                    return responderErro(
                        interaction,
                        '❌ O comentário pode ter no máximo 1000 caracteres.'
                    );
                }

                if (!Array.isArray(publicacao.comentarios)) {
                    publicacao.comentarios = [];
                }

                publicacao.comentarios.push({
                    autorId: interaction.user.id,
                    autorNome: interaction.user.username,
                    texto: comentario,
                    data: new Date().toISOString()
                });

                salvarPublicacoes(publicacoes);

                return interaction.reply({
                    content: '✅ Seu comentário foi registrado!',
                    ephemeral: true
                });
            }

            return;
        }

        // --------------------------------------------------
        // BOTÕES
        // --------------------------------------------------

        if (interaction.isButton()) {
            const id = interaction.customId;

            // Criar chamada temporária.
            if (id === 'criar_call') {
                return criarCallTemporaria(interaction);
            }

            // Abrir painel de controle da call.
            if (id === 'abrir_controle_call') {
                return interaction.reply({
                    ...criarPainelCall(),
                    ephemeral: true
                });
            }

            // Limite da chamada.
            if (id === 'call_limite') {
                const canal = obterCanalDeVozDoMembro(
                    interaction
                );

                if (!canal) {
                    return responderErro(
                        interaction,
                        '❌ Entre em uma chamada antes de alterar o limite.'
                    );
                }

                if (
                    canal.parentId !== CATEGORIA_CALL ||
                    !verificarPermissaoGerenciarCanal(
                        interaction,
                        canal
                    )
                ) {
                    return responderErro(
                        interaction,
                        '❌ Você não tem permissão para controlar esta chamada.'
                    );
                }

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

            // Mover um membro.
            if (id === 'call_mover') {
                const canal = obterCanalDeVozDoMembro(
                    interaction
                );

                if (!canal) {
                    return responderErro(
                        interaction,
                        '❌ Você precisa estar em uma chamada para mover alguém.'
                    );
                }

                if (
                    canal.parentId !== CATEGORIA_CALL ||
                    !verificarPermissaoGerenciarCanal(
                        interaction,
                        canal
                    )
                ) {
                    return responderErro(
                        interaction,
                        '❌ Você não pode controlar esta chamada.'
                    );
                }

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

            // Mutar membro: somente Booster.
            if (id === 'call_mutar') {
                const membro = interaction.member;

                if (!membroEhBooster(membro)) {
                    return responderErro(
                        interaction,
                        '❌ Este recurso é exclusivo para Boosters do servidor.'
                    );
                }

                const canal = obterCanalDeVozDoMembro(
                    interaction
                );

                if (!canal) {
                    return responderErro(
                        interaction,
                        '❌ Entre em uma chamada primeiro.'
                    );
                }

                if (
                    canal.parentId !== CATEGORIA_CALL ||
                    !verificarPermissaoGerenciarCanal(
                        interaction,
                        canal
                    )
                ) {
                    return responderErro(
                        interaction,
                        '❌ Você não pode controlar esta chamada.'
                    );
                }

                const seletor = new UserSelectMenuBuilder()
                    .setCustomId('call_selecionar_mutar')
                    .setPlaceholder('Escolha quem deseja mutar')
                    .setMinValues(1)
                    .setMaxValues(1);

                return interaction.reply({
                    content: '🔇 Selecione um membro da chamada.',
                    components: [
                        new ActionRowBuilder().addComponents(seletor)
                    ],
                    ephemeral: true
                });
            }

            // Desmutar a si mesmo.
            if (id === 'call_desmutar') {
                const membro = interaction.member;

                if (!membro?.voice?.channel) {
                    return responderErro(
                        interaction,
                        '❌ Entre em uma chamada primeiro.'
                    );
                }

                try {
                    await membro.voice.setMute(false);

                    return interaction.reply({
                        content: '🔊 Seu mute de servidor foi removido.',
                        ephemeral: true
                    });
                } catch (erro) {
                    console.error(
                        'Erro ao desmutar membro:',
                        erro
                    );

                    return responderErro(
                        interaction,
                        '❌ Não consegui retirar seu mute. Verifique as permissões do bot.'
                    );
                }
            }

            // Tornar chamada privada.
            if (id === 'call_privada') {
                const canal = obterCanalDeVozDoMembro(
                    interaction
                );

                if (!canal) {
                    return responderErro(
                        interaction,
                        '❌ Entre em uma chamada primeiro.'
                    );
                }

                if (
                    canal.parentId !== CATEGORIA_CALL ||
                    !verificarPermissaoGerenciarCanal(
                        interaction,
                        canal
                    )
                ) {
                    return responderErro(
                        interaction,
                        '❌ Você não pode alterar a privacidade desta chamada.'
                    );
                }

                await canal.permissionOverwrites.edit(
                    interaction.guild.roles.everyone.id,
                    {
                        ViewChannel: false,
                        Connect: false
                    }
                );

                await canal.permissionOverwrites.edit(
                    interaction.user.id,
                    {
                        ViewChannel: true,
                        Connect: true,
                        Speak: true,
                        ManageChannels: true,
                        MoveMembers: true
                    }
                );

                return interaction.reply({
                    content: '🔒 Sua chamada agora está privada.',
                    ephemeral: true
                });
            }

            // Tornar chamada pública.
            if (id === 'call_publica') {
                const canal = obterCanalDeVozDoMembro(
                    interaction
                );

                if (!canal) {
                    return responderErro(
                        interaction,
                        '❌ Entre em uma chamada primeiro.'
                    );
                }

                if (
                    canal.parentId !== CATEGORIA_CALL ||
                    !verificarPermissaoGerenciarCanal(
                        interaction,
                        canal
                    )
                ) {
                    return responderErro(
                        interaction,
                        '❌ Você não pode alterar a privacidade desta chamada.'
                    );
                }

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
            }

            // Curtidas em publicações.
            if (id.startsWith('pub_like_')) {
                const publicacaoId = id.replace(
                    'pub_like_',
                    ''
                );

                const publicacoes = obterPublicacoes();
                const publicacao = publicacoes[publicacaoId];

                if (!publicacao) {
                    return responderErro(
                        interaction,
                        '❌ Esta publicação não foi encontrada.'
                    );
                }

                if (!Array.isArray(publicacao.curtidas)) {
                    publicacao.curtidas = [];
                }

                const indice = publicacao.curtidas.indexOf(
                    interaction.user.id
                );

                if (indice >= 0) {
                    publicacao.curtidas.splice(indice, 1);

                    salvarPublicacoes(publicacoes);

                    return interaction.reply({
                        content: '❤️ Você removeu sua curtida.',
                        ephemeral: true
                    });
                }

                publicacao.curtidas.push(
                    interaction.user.id
                );

                salvarPublicacoes(publicacoes);

                return interaction.reply({
                    content: `❤️ Você curtiu a publicação! Total de curtidas: ${publicacao.curtidas.length}`,
                    ephemeral: true
                });
            }

            // Abrir formulário de comentário.
            if (id.startsWith('pub_comentar_')) {
                const publicacaoId = id.replace(
                    'pub_comentar_',
                    ''
                );

                const publicacoes = obterPublicacoes();

                if (!publicacoes[publicacaoId]) {
                    return responderErro(
                        interaction,
                        '❌ Esta publicação não foi encontrada.'
                    );
                }

                const modal = new ModalBuilder()
                    .setCustomId(
                        `modal_comentario_${publicacaoId}`
                    )
                    .setTitle('Comentar publicação');

                const campo = new TextInputBuilder()
                    .setCustomId('comentario')
                    .setLabel('Escreva seu comentário')
                    .setPlaceholder('Digite seu comentário aqui...')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMaxLength(1000);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(campo)
                );

                return interaction.showModal(modal);
            }

            // Compartilhar publicação.
            if (id.startsWith('pub_compartilhar_')) {
                const publicacaoId = id.replace(
                    'pub_compartilhar_',
                    ''
                );

                const publicacoes = obterPublicacoes();
                const publicacao = publicacoes[publicacaoId];

                if (!publicacao) {
                    return responderErro(
                        interaction,
                        '❌ Esta publicação não foi encontrada.'
                    );
                }

                const mensagemId =
                    publicacao.mensagemPublicadaId;

                const link = mensagemId
                    ? `https://discord.com/channels/${publicacao.guildId}/${publicacao.canalId}/${mensagemId}`
                    : null;

                return interaction.reply({
                    content: link
                        ? `🔁 Compartilhe esta publicação:\n${link}`
                        : '❌ Não foi possível gerar o link da publicação.',
                    ephemeral: true
                });
            }

            // Detalhes da publicação.
            if (id.startsWith('pub_detalhes_')) {
                const publicacaoId = id.replace(
                    'pub_detalhes_',
                    ''
                );

                const publicacoes = obterPublicacoes();
                const publicacao = publicacoes[publicacaoId];

                if (!publicacao) {
                    return responderErro(
                        interaction,
                        '❌ Esta publicação não foi encontrada.'
                    );
                }

                const data = new Date(publicacao.data);
                const timestamp = Math.floor(
                    data.getTime() / 1000
                );

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
                            value: String(
                                publicacao.curtidas?.length || 0
                            ),
                            inline: true
                        },
                        {
                            name: 'Comentários',
                            value: String(
                                publicacao.comentarios?.length || 0
                            ),
                            inline: true
                        },
                        {
                            name: 'Publicado em',
                            value: `<t:${timestamp}:F>`
                        },
                        {
                            name: 'Texto',
                            value: publicacao.texto
                                ? publicacao.texto.slice(0, 1024)
                                : 'Sem texto.'
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
        // SELETORES DE MEMBROS
        // --------------------------------------------------

        if (interaction.isUserSelectMenu()) {
            const id = interaction.customId;

            if (
                id === 'call_selecionar_membro' ||
                id === 'call_selecionar_mutar'
            ) {
                const canal = obterCanalDeVozDoMembro(
                    interaction
                );

                if (!canal) {
                    return responderErro(
                        interaction,
                        '❌ Você saiu da chamada. Entre novamente e tente outra vez.'
                    );
                }

                if (
                    canal.parentId !== CATEGORIA_CALL ||
                    !verificarPermissaoGerenciarCanal(
                        interaction,
                        canal
                    )
                ) {
                    return responderErro(
                        interaction,
                        '❌ Você não pode controlar esta chamada.'
                    );
                }

                const membroId = interaction.values[0];

                const membroAlvo = await interaction.guild.members
                    .fetch(membroId)
                    .catch(() => null);

                if (!membroAlvo) {
                    return responderErro(
                        interaction,
                        '❌ Não consegui encontrar esse membro.'
                    );
                }

                if (id === 'call_selecionar_membro') {
                    if (!membroAlvo.voice.channel) {
                        return responderErro(
                            interaction,
                            '❌ Esse membro não está em uma chamada de voz.'
                        );
                    }

                    try {
                        await membroAlvo.voice.setChannel(canal);

                        return interaction.update({
                            content: `✅ ${membroAlvo} foi movido para ${canal}.`,
                            components: []
                        });
                    } catch (erro) {
                        console.error(
                            'Erro ao mover membro:',
                            erro
                        );

                        return responderErro(
                            interaction,
                            '❌ Não consegui mover esse membro. Confira as permissões do bot.'
                        );
                    }
                }

                if (id === 'call_selecionar_mutar') {
                    if (!membroEhBooster(interaction.member)) {
                        return responderErro(
                            interaction,
                            '❌ Este recurso é exclusivo para Boosters.'
                        );
                    }

                    if (membroAlvo.id === interaction.user.id) {
                        return responderErro(
                            interaction,
                            '❌ Use o controle de desmutar para controlar seu próprio mute.'
                        );
                    }

                    if (membroAlvo.voice.channelId !== canal.id) {
                        return responderErro(
                            interaction,
                            '❌ Esse membro não está na sua chamada.'
                        );
                    }

                    try {
                        await membroAlvo.voice.setMute(true);

                        return interaction.update({
                            content: `🔇 ${membroAlvo} foi mutado no servidor.`,
                            components: []
                        });
                    } catch (erro) {
                        console.error(
                            'Erro ao mutar membro:',
                            erro
                        );

                        return responderErro(
                            interaction,
                            '❌ Não consegui mutar esse membro. Confira as permissões do bot.'
                        );
                    }
                }
            }

            return;
        }

        // --------------------------------------------------
        // SELETORES DE CANAIS
        // --------------------------------------------------

        if (interaction.isChannelSelectMenu()) {
            const canalDestinoId = interaction.values[0];

            const canalDestino = await interaction.guild.channels
                .fetch(canalDestinoId)
                .catch(() => null);

            if (!canalDestino) {
                return responderErro(
                    interaction,
                    '❌ Não consegui encontrar o canal selecionado.'
                );
            }

            return;
        }
    } catch (erro) {
        console.error(
            'Erro geral em interactionCreate:',
            erro
        );

        await responderErro(
            interaction,
            '❌ Ocorreu um erro ao processar esta interação.'
        );
    }
});

// ======================================================
// TRATAMENTO DE ERROS
// ======================================================

process.on('unhandledRejection', erro => {
    console.error(
        'Erro não tratado (Promise):',
        erro
    );
});

process.on('uncaughtException', erro => {
    console.error(
        'Erro não tratado:',
        erro
    );
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
            '❌ Não foi possível conectar o bot ao Discord:',
            erro
        );
    });
}
