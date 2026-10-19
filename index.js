
require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const {
    Client,
    Collection,
    GatewayIntentBits,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ChannelType,
    PermissionFlagsBits,
    UserSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    ActivityType,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    AttachmentBuilder
} = require('discord.js');

const { createCanvas, loadImage } = require('@napi-rs/canvas');

// ==================================================
// CONFIGURAÇÕES
// ==================================================

const CATEGORIA_CALL = '1560763293994323999';
const CARGO_BOOSTER = '1559367297053757551';

const CANAL_PUBLICACOES_ID = '1561569037694275584';
const CANAL_LIMPEZA_ID = '1561569037694275584';
const FUSO_HORARIO = 'America/Sao_Paulo';

const PASTA_DADOS = path.join(__dirname, 'data');
const ARQUIVO_PUBLICACOES = path.join(PASTA_DADOS, 'publicacoes.json');
const ARQUIVO_LIMPEZA = path.join(PASTA_DADOS, 'limpeza.json');

if (!fs.existsSync(PASTA_DADOS)) {
    fs.mkdirSync(PASTA_DADOS, { recursive: true });
}

function lerJSON(arquivo, padrao) {
    try {
        if (!fs.existsSync(arquivo)) {
            fs.writeFileSync(arquivo, JSON.stringify(padrao, null, 2));
            return padrao;
        }

        return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    } catch (error) {
        console.error(`Erro lendo ${arquivo}:`, error);
        return padrao;
    }
}

function salvarJSON(arquivo, dados) {
    const temporario = `${arquivo}.tmp`;

    fs.writeFileSync(temporario, JSON.stringify(dados, null, 2));
    fs.renameSync(temporario, arquivo);
}

let publicacoes = lerJSON(ARQUIVO_PUBLICACOES, {});
let dadosLimpeza = lerJSON(ARQUIVO_LIMPEZA, {
    ultimaLimpezaDomingo: ''
});

const SERIES = [
    'The Mentalist',
    'Dexter',
    'Sex Education',
    'Breaking Bad',
    'The Walking Dead',
    'You'
];

const INTERVALO_SERIE = 10 * 60 * 60 * 1000;

let indiceSerie = 0;
let temporizadorSeries = null;

const cooldowns = new Map();

// ==================================================
// CLIENTE
// ==================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

client.commands = new Collection();

// ==================================================
// CALLS TEMPORÁRIAS
// ==================================================

const callsTemporarias = new Set();
const temporizadoresCall = new Map();
const TEMPO_EXCLUSAO_CALL = 10000;

function cancelarExclusaoCall(canalId) {
    const temporizador = temporizadoresCall.get(canalId);

    if (temporizador) {
        clearTimeout(temporizador);
        temporizadoresCall.delete(canalId);
    }
}

function agendarExclusaoCall(canal) {
    if (!callsTemporarias.has(canal.id)) return;

    cancelarExclusaoCall(canal.id);

    const temporizador = setTimeout(async () => {
        try {
            const canalAtual = await canal.guild.channels
                .fetch(canal.id)
                .catch(() => null);

            if (!canalAtual) {
                callsTemporarias.delete(canal.id);
                return;
            }

            if (canalAtual.members.size === 0) {
                await canalAtual.delete(
                    'Call temporária vazia por 10 segundos'
                );

                console.log(`Call temporária excluída: ${canalAtual.name}`);
                callsTemporarias.delete(canal.id);
            }
        } catch (error) {
            console.error('Erro ao excluir call:', error);
        } finally {
            temporizadoresCall.delete(canal.id);
        }
    }, TEMPO_EXCLUSAO_CALL);

    temporizadoresCall.set(canal.id, temporizador);
}

// ==================================================
// CARREGAR COMANDOS SLASH
// ==================================================

const commandsPath = path.join(__dirname, 'commands');

if (fs.existsSync(commandsPath)) {
    const files = fs.readdirSync(commandsPath)
        .filter(file => file.endsWith('.js'));

    for (const file of files) {
        try {
            const command = require(path.join(commandsPath, file));

            if (command.data && command.execute) {
                client.commands.set(command.data.name, command);
                console.log(`Comando carregado: ${command.data.name}`);
            } else {
                console.log(`⚠️ ${file} precisa de data e execute.`);
            }
        } catch (error) {
            console.error(`Erro ao carregar ${file}:`, error);
        }
    }
}

// ==================================================
// ATIVIDADE AUTOMÁTICA
// ==================================================

client.once('clientReady', readyClient => {
    console.log(`Bot online como ${readyClient.user.tag}`);

    function trocarSerie() {
        const serieAtual = SERIES[indiceSerie];

        readyClient.user.setActivity(serieAtual, {
            type: ActivityType.Watching
        });

        console.log(`Atividade atualizada: Assistindo ${serieAtual}`);

        indiceSerie = (indiceSerie + 1) % SERIES.length;
    }

    trocarSerie();

    temporizadorSeries = setInterval(
        trocarSerie,
        INTERVALO_SERIE
    );

    verificarHorarioLimpeza().catch(console.error);

    setInterval(() => {
        verificarHorarioLimpeza().catch(console.error);
    }, 15000);
});

// ==================================================
// MONITORAR CALLS
// ==================================================

client.on('voiceStateUpdate', async (estadoAnterior, estadoNovo) => {
    try {
        const canalAnterior = estadoAnterior.channel;
        const canalNovo = estadoNovo.channel;

        if (canalNovo && callsTemporarias.has(canalNovo.id)) {
            cancelarExclusaoCall(canalNovo.id);
        }

        if (
            canalAnterior &&
            canalAnterior.id !== canalNovo?.id &&
            callsTemporarias.has(canalAnterior.id)
        ) {
            const canalAtualizado = await estadoAnterior.guild.channels
                .fetch(canalAnterior.id)
                .catch(() => null);

            if (
                canalAtualizado &&
                canalAtualizado.members.size === 0
            ) {
                agendarExclusaoCall(canalAtualizado);
            }
        }
    } catch (error) {
        console.error('Erro ao monitorar calls:', error);
    }
});

// ==================================================
// FUNÇÕES AUXILIARES EXISTENTES
// ==================================================

function estaEmVoz(membro) {
    return Boolean(membro.voice.channel);
}

function eBooster(membro) {
    return membro.roles.cache.has(CARGO_BOOSTER);
}

function tempoCooldown(membro, ferramenta) {
    if ([
        'criar_call',
        'privar_call',
        'desprivar_call'
    ].includes(ferramenta)) {
        return 0;
    }

    return eBooster(membro) ? 40 : 60;
}

async function responderErro(interaction, mensagem) {
    const resposta = {
        content: mensagem,
        ephemeral: true
    };

    if (interaction.replied || interaction.deferred) {
        await interaction.followUp(resposta).catch(() => {});
    } else {
        await interaction.reply(resposta).catch(() => {});
    }
}

async function verificarCooldown(interaction, membro, ferramenta) {
    const segundos = tempoCooldown(membro, ferramenta);

    if (segundos === 0) return true;

    const chave =
        `${interaction.guildId}:${interaction.user.id}:${ferramenta}`;

    const agora = Date.now();
    const expiracao = cooldowns.get(chave) || 0;

    if (agora < expiracao) {
        const restante = Math.ceil((expiracao - agora) / 1000);

        await responderErro(
            interaction,
            `⏳ Aguarde **${restante} segundo(s)** antes de usar essa ferramenta novamente.`
        );

        return false;
    }

    cooldowns.set(chave, agora + segundos * 1000);
    return true;
}

function criarModal(id, titulo, campoId, rotulo, exemplo) {
    const modal = new ModalBuilder()
        .setCustomId(id)
        .setTitle(titulo);

    const campo = new TextInputBuilder()
        .setCustomId(campoId)
        .setLabel(rotulo)
        .setPlaceholder(exemplo)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(25);

    modal.addComponents(
        new ActionRowBuilder().addComponents(campo)
    );

    return modal;
}

async function buscarMembro(guild, id) {
    if (!/^\d{17,20}$/.test(id)) return null;
    return guild.members.fetch(id).catch(() => null);
}

async function buscarCanalVoz(guild, id) {
    if (!/^\d{17,20}$/.test(id)) return null;

    const canal = await guild.channels.fetch(id).catch(() => null);

    if (
        !canal ||
        (
            canal.type !== ChannelType.GuildVoice &&
            canal.type !== ChannelType.GuildStageVoice
        )
    ) {
        return null;
    }

    return canal;
}

// ==================================================
// SISTEMA DE PUBLICAÇÕES EM IMAGENS
// ==================================================

function quebrarTexto(ctx, texto, largura) {
    const linhas = [];

    for (const paragrafo of texto.split('\n')) {
        if (!paragrafo.trim()) {
            linhas.push('');
            continue;
        }

        let linha = '';

        for (const palavra of paragrafo.split(/\s+/)) {
            const tentativa = linha
                ? `${linha} ${palavra}`
                : palavra;

            if (ctx.measureText(tentativa).width > largura && linha) {
                linhas.push(linha);
                linha = palavra;
            } else {
                linha = tentativa;
            }
        }

        if (linha) linhas.push(linha);
    }

    return linhas;
}

async function criarImagemPublicacao(mensagem) {
    const largura = 1000;
    const margem = 48;
    const larguraTexto = largura - margem * 2;

    const imagensAnexadas = mensagem.attachments
        .filter(anexo =>
            anexo.contentType?.startsWith('image/') ||
            /\.(png|jpe?g|gif|webp)$/i.test(anexo.name || '')
        )
        .slice(0, 4);

    const medidor = createCanvas(largura, 100);
    const ctxMedida = medidor.getContext('2d');

    ctxMedida.font = '30px sans-serif';

    const texto = mensagem.content?.trim() || '';
    const linhas = texto
        ? quebrarTexto(ctxMedida, texto, larguraTexto)
        : [];

    const imagens = [];

    for (const anexo of imagensAnexadas) {
        try {
            const imagem = await loadImage(anexo.url);
            imagens.push(imagem);
        } catch (error) {
            console.error(
                `Erro carregando imagem ${anexo.name}:`,
                error.message
            );
        }
    }

    const alturaLinha = 42;
    const alturaTexto = linhas.length * alturaLinha;

    let alturaImagens = 0;

    if (imagens.length === 1) {
        const img = imagens[0];
        const escala = Math.min(
            larguraTexto / img.width,
            560 / img.height,
            1
        );

        alturaImagens = img.height * escala + 24;
    } else if (imagens.length > 1) {
        alturaImagens =
            Math.ceil(imagens.length / 2) * 212 + 12;
    }

    const altura = Math.max(
        340,
        48 + 120 + alturaTexto + alturaImagens + 65 + 48
    );

    const canvas = createCanvas(largura, altura);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#17191f';
    ctx.fillRect(0, 0, largura, altura);

    ctx.fillStyle = '#20232b';
    ctx.beginPath();
    ctx.roundRect(20, 20, largura - 40, altura - 40, 28);
    ctx.fill();

    // Avatar
    try {
        const avatar = await loadImage(
            mensagem.author.displayAvatarURL({
                extension: 'png',
                size: 128
            })
        );

        ctx.save();
        ctx.beginPath();
        ctx.arc(94, 94, 34, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(avatar, 60, 60, 68, 68);
        ctx.restore();
    } catch {
        ctx.fillStyle = '#5865f2';
        ctx.beginPath();
        ctx.arc(94, 94, 34, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';

    ctx.fillText(
        mensagem.member?.displayName || mensagem.author.username,
        150,
        83,
        700
    );

    ctx.fillStyle = '#aeb4c0';
    ctx.font = '20px sans-serif';

    const dataFormatada = new Intl.DateTimeFormat('pt-BR', {
        timeZone: FUSO_HORARIO,
        dateStyle: 'short',
        timeStyle: 'short'
    }).format(new Date(mensagem.createdTimestamp));

    ctx.fillText(dataFormatada, 150, 116);

    let y = 168;

    ctx.fillStyle = '#f1f2f5';
    ctx.font = '30px sans-serif';

    for (const linha of linhas) {
        ctx.fillText(linha, margem, y, larguraTexto);
        y += alturaLinha;
    }

    if (linhas.length) y += 16;

    if (imagens.length === 1) {
        const img = imagens[0];

        const escala = Math.min(
            larguraTexto / img.width,
            560 / img.height,
            1
        );

        const w = img.width * escala;
        const h = img.height * escala;

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(margem, y, w, h, 18);
        ctx.clip();
        ctx.drawImage(img, margem, y, w, h);
        ctx.restore();
    } else if (imagens.length > 1) {
        const espacamento = 12;
        const colunas = 2;
        const larguraCelula = (larguraTexto - espacamento) / 2;
        const alturaCelula = 200;

        imagens.forEach((img, indice) => {
            const coluna = indice % colunas;
            const linha = Math.floor(indice / colunas);

            const x = margem +
                coluna * (larguraCelula + espacamento);

            const posY = y +
                linha * (alturaCelula + espacamento);

            const escala = Math.max(
                larguraCelula / img.width,
                alturaCelula / img.height
            );

            const w = img.width * escala;
            const h = img.height * escala;
            const dx = x + (larguraCelula - w) / 2;
            const dy = posY + (alturaCelula - h) / 2;

            ctx.save();
            ctx.beginPath();
            ctx.roundRect(
                x,
                posY,
                larguraCelula,
                alturaCelula,
                14
            );
            ctx.clip();
            ctx.drawImage(img, dx, dy, w, h);
            ctx.restore();
        });
    }

    ctx.fillStyle = '#9299a8';
    ctx.font = 'bold 19px sans-serif';
    ctx.fillText('ZODÍACO • PUBLICAÇÃO', margem, altura - 48);

    return canvas.toBuffer('image/png');
}

function criarBotoesPublicacao(id) {
    const p = publicacoes[id];

    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`post_like:${id}`)
                .setLabel(`❤️ ${p.likes.length}`)
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId(`post_comment:${id}`)
                .setLabel(`💬 ${p.comments.length}`)
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId(`post_repost:${id}`)
                .setLabel(`🔁 ${p.reposts}`)
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId(`post_details:${id}`)
                .setLabel('Detalhes ⋯')
                .setStyle(ButtonStyle.Primary)
        )
    ];
}

async function atualizarBotoesPublicacao(id) {
    const p = publicacoes[id];
    if (!p) return;

    const canal = await client.channels
        .fetch(p.channelId)
        .catch(() => null);

    if (!canal?.isTextBased()) return;

    const mensagem = await canal.messages
        .fetch(p.messageId)
        .catch(() => null);

    if (!mensagem) return;

    await mensagem.edit({
        components: criarBotoesPublicacao(id)
    });
}

// Mensagens humanas no canal configurado viram publicações.
client.on('messageCreate', async mensagem => {
    try {
        if (!mensagem.guild) return;
        if (mensagem.author.bot) return;
        if (mensagem.channelId !== CANAL_PUBLICACOES_ID) return;

        if (
            !mensagem.content.trim() &&
            mensagem.attachments.size === 0
        ) {
            return;
        }

        const buffer = await criarImagemPublicacao(mensagem);
        const id = randomUUID().replace(/-/g, '').slice(0, 16);

        const arquivo = new AttachmentBuilder(buffer, {
            name: `publicacao-${id}.png`
        });

        // Envia a imagem antes de apagar a mensagem original.
        const enviada = await mensagem.channel.send({
            files: [arquivo]
        });

        publicacoes[id] = {
            id,
            authorId: mensagem.author.id,
            authorName:
                mensagem.member?.displayName ||
                mensagem.author.username,
            text: mensagem.content || '',
            createdAt: mensagem.createdTimestamp,
            channelId: mensagem.channelId,
            messageId: enviada.id,
            likes: [],
            comments: [],
            reposts: 0
        };

        salvarJSON(ARQUIVO_PUBLICACOES, publicacoes);

        await enviada.edit({
            components: criarBotoesPublicacao(id)
        });

        await mensagem.delete().catch(error => {
            console.error(
                'Publicação enviada, mas a mensagem original não foi apagada:',
                error.message
            );
        });

        console.log(`Publicação criada: ${id}`);
    } catch (error) {
        console.error('Erro no sistema de publicações:', error);
    }
});

// ==================================================
// LIMPEZA AUTOMÁTICA SEMANAL
// ==================================================

function obterDataHoraBrasilia() {
    const partes = new Intl.DateTimeFormat('en-US', {
        timeZone: FUSO_HORARIO,
        weekday: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(new Date());

    const dados = {};

    for (const parte of partes) {
        dados[parte.type] = parte.value;
    }

    return dados;
}

let limpezaEmAndamento = false;

async function limparCanalSemanal() {
    const canal = await client.channels
        .fetch(CANAL_LIMPEZA_ID)
        .catch(() => null);

    if (!canal?.isTextBased() || !canal.messages) {
        console.error('Limpeza: canal não encontrado ou não é textual.');
        return false;
    }

    const botMembro = await canal.guild.members.fetchMe();
    const permissoes = canal.permissionsFor(botMembro);

    if (!permissoes?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages
    ])) {
        console.error('Limpeza: faltam permissões no canal.');
        return false;
    }

    let apagadas = 0;

    try {
        let antesDe;

        while (true) {
            const opcoes = { limit: 100 };

            if (antesDe) opcoes.before = antesDe;

            const mensagens = await canal.messages.fetch(opcoes);

            if (mensagens.size === 0) break;

            antesDe = mensagens.last().id;

            const recentes = mensagens.filter(
                msg => Date.now() - msg.createdTimestamp <
                    14 * 24 * 60 * 60 * 1000
            );

            const antigas = mensagens.filter(
                msg => Date.now() - msg.createdTimestamp >=
                    14 * 24 * 60 * 60 * 1000
            );

            if (recentes.size > 0) {
                const resultado = await canal.bulkDelete(recentes, true);
                apagadas += resultado.size;
            }

            for (const msg of antigas.values()) {
                try {
                    await msg.delete();
                    apagadas++;
                } catch (error) {
                    console.error(
                        'Erro apagando mensagem antiga:',
                        error.message
                    );
                }
            }

            if (mensagens.size < 100) break;
        }

        console.log(`Limpeza concluída: ${apagadas} mensagens apagadas.`);
        return true;
    } catch (error) {
        console.error('Erro na limpeza semanal:', error);
        return false;
    }
}

async function verificarHorarioLimpeza() {
    if (limpezaEmAndamento) return;

    const agora = obterDataHoraBrasilia();

    if (
        agora.weekday !== 'Sun' ||
        agora.hour !== '00' ||
        agora.minute !== '00'
    ) {
        return;
    }

    const dataAtual = `${agora.year}-${agora.month}-${agora.day}`;

    if (dadosLimpeza.ultimaLimpezaDomingo === dataAtual) return;

    limpezaEmAndamento = true;

    try {
        const sucesso = await limparCanalSemanal();

        if (sucesso) {
            dadosLimpeza.ultimaLimpezaDomingo = dataAtual;
            salvarJSON(ARQUIVO_LIMPEZA, dadosLimpeza);
        }
    } finally {
        limpezaEmAndamento = false;
    }
}

// ==================================================
// EVENTOS DE INTERAÇÃO
// ==================================================

client.on('interactionCreate', async interaction => {
    try {
        if (!interaction.inGuild()) return;

        // BOTÕES DAS PUBLICAÇÕES
        if (interaction.isButton()) {
            const [acao, id] = interaction.customId.split(':');

            if (!acao.startsWith('post_')) return;

            const p = publicacoes[id];

            if (!p) {
                return responderErro(
                    interaction,
                    '❌ Esta publicação não foi encontrada.'
                );
            }

            if (acao === 'post_like') {
                const indice = p.likes.indexOf(interaction.user.id);

                if (indice >= 0) {
                    p.likes.splice(indice, 1);
                } else {
                    p.likes.push(interaction.user.id);
                }

                salvarJSON(ARQUIVO_PUBLICACOES, publicacoes);

                await interaction.deferUpdate();
                await atualizarBotoesPublicacao(id);
                return;
            }

            if (acao === 'post_comment') {
                const modal = new ModalBuilder()
                    .setCustomId(`post_comment_submit:${id}`)
                    .setTitle('Comentar publicação');

                const campo = new TextInputBuilder()
                    .setCustomId('post_comment_text')
                    .setLabel('Seu comentário')
                    .setPlaceholder('Escreva seu comentário...')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMaxLength(1000);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(campo)
                );

                return interaction.showModal(modal);
            }

            if (acao === 'post_repost') {
                const canal = await client.channels
                    .fetch(p.channelId)
                    .catch(() => null);

                if (!canal?.isTextBased()) {
                    return responderErro(
                        interaction,
                        '❌ Não encontrei o canal da publicação.'
                    );
                }

                const original = await canal.messages
                    .fetch(p.messageId)
                    .catch(() => null);

                const imagem = original?.attachments.first();

                if (!imagem) {
                    return responderErro(
                        interaction,
                        '❌ Não encontrei a imagem para repostar.'
                    );
                }

                await canal.send({
                    content:
                        `🔁 **Repostagem da publicação de <@${p.authorId}>**\n` +
                        `Repostada por ${interaction.user}`,
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x5865F2)
                            .setImage(imagem.url)
                            .setFooter({ text: `Publicação ${id}` })
                    ]
                });

                p.reposts++;
                salvarJSON(ARQUIVO_PUBLICACOES, publicacoes);

                await interaction.deferUpdate();
                await atualizarBotoesPublicacao(id);
                return;
            }

            if (acao === 'post_details') {
                const embed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle('Detalhes da publicação')
                    .setDescription(
                        `**Autor:** <@${p.authorId}>\n` +
                        `**Curtidas:** ${p.likes.length}\n` +
                        `**Comentários:** ${p.comments.length}\n` +
                        `**Repostagens:** ${p.reposts}\n` +
                        `**Publicado em:** <t:${Math.floor(p.createdAt / 1000)}:F>`
                    );

                return interaction.reply({
                    embeds: [embed],
                    ephemeral: true
                });
            }

            return;
        }

        // RECEBER COMENTÁRIOS ANTES DAS VALIDAÇÕES DE CALL
        if (
            interaction.isModalSubmit() &&
            interaction.customId.startsWith('post_comment_submit:')
        ) {
            const id = interaction.customId.split(':')[1];
            const p = publicacoes[id];

            if (!p) {
                return responderErro(
                    interaction,
                    '❌ Esta publicação não foi encontrada.'
                );
            }

            const texto = interaction.fields
                .getTextInputValue('post_comment_text')
                .trim();

            if (!texto) {
                return responderErro(
                    interaction,
                    '❌ O comentário não pode ficar vazio.'
                );
            }

            p.comments.push({
                userId: interaction.user.id,
                text: texto,
                createdAt: Date.now()
            });

            salvarJSON(ARQUIVO_PUBLICACOES, publicacoes);

            await interaction.reply({
                content: '✅ Seu comentário foi registrado!',
                ephemeral: true
            });

            await atualizarBotoesPublicacao(id);
            return;
        }

        // SELECIONAR MEMBRO PARA MOVER
        if (
            interaction.isUserSelectMenu() &&
            interaction.customId === 'mover_membro'
        ) {
            const membro = await interaction.guild.members.fetch(
                interaction.user.id
            );

            if (!estaEmVoz(membro)) {
                return interaction.update({
                    content: '❌ Entre em uma call antes de usar esta ferramenta.',
                    components: []
                });
            }

            const alvo = await buscarMembro(
                interaction.guild,
                interaction.values[0]
            );

            if (!alvo) {
                return interaction.update({
                    content: '❌ Não encontrei esse membro no servidor.',
                    components: []
                });
            }

            if (alvo.id === interaction.user.id) {
                return interaction.update({
                    content: '❌ Selecione outro membro para mover.',
                    components: []
                });
            }

            if (!estaEmVoz(alvo)) {
                return interaction.update({
                    content: '❌ Esse membro não está conectado a uma call.',
                    components: []
                });
            }

            const seletorCanal = new ChannelSelectMenuBuilder()
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
                    `👤 Membro selecionado: **${alvo.user.username}**\n\n` +
                    '🔊 Agora escolha a call de destino:',
                components: [
                    new ActionRowBuilder().addComponents(seletorCanal)
                ]
            });
        }

        // ESCOLHER CANAL DE DESTINO
        if (
            interaction.isChannelSelectMenu() &&
            interaction.customId.startsWith('mover_canal:')
        ) {
            const membro = await interaction.guild.members.fetch(
                interaction.user.id
            );

            if (!estaEmVoz(membro)) {
                return interaction.update({
                    content: '❌ Você precisa estar em uma call para usar esta ferramenta.',
                    components: []
                });
            }

            const alvoId = interaction.customId.split(':')[1];
            const alvo = await buscarMembro(interaction.guild, alvoId);

            if (!alvo || !estaEmVoz(alvo)) {
                return interaction.update({
                    content: '❌ Esse membro não está mais conectado a uma call.',
                    components: []
                });
            }

            const destino = await buscarCanalVoz(
                interaction.guild,
                interaction.values[0]
            );

            if (!destino) {
                return interaction.update({
                    content: '❌ O canal selecionado não é uma call válida.',
                    components: []
                });
            }

            if (alvo.voice.channelId === destino.id) {
                return interaction.update({
                    content: 'ℹ️ Esse membro já está nessa call.',
                    components: []
                });
            }

            const botMembro = await interaction.guild.members.fetchMe();

            if (!botMembro.permissions.has(PermissionFlagsBits.MoveMembers)) {
                return interaction.update({
                    content: '❌ Preciso da permissão Mover membros.',
                    components: []
                });
            }

            if (!destino.permissionsFor(botMembro)
                ?.has(PermissionFlagsBits.Connect)) {
                return interaction.update({
                    content: '❌ Não tenho permissão para entrar na call de destino.',
                    components: []
                });
            }

            if (!await verificarCooldown(interaction, membro, 'mover')) {
                return;
            }

            try {
                await alvo.voice.setChannel(destino);

                return interaction.update({
                    content: '✅ Usuário movido para a call com sucesso!',
                    components: []
                });
            } catch (error) {
                console.error('Erro ao mover membro:', error);

                return interaction.update({
                    content: '❌ Não consegui mover esse membro. Confira as permissões e a hierarquia do bot.',
                    components: []
                });
            }
        }

        // FORMULÁRIOS DE CALL
        if (interaction.isModalSubmit()) {
            const membro = await interaction.guild.members.fetch(
                interaction.user.id
            );

            if (!estaEmVoz(membro)) {
                return responderErro(
                    interaction,
                    '❌ Entre em uma call antes de utilizar esta ferramenta.'
                );
            }

            const canalAtual = membro.voice.channel;

            if (interaction.customId === 'modal_limite_call') {
                const valor = interaction.fields
                    .getTextInputValue('limite_pessoas')
                    .trim();

                if (!/^\d{1,2}$/.test(valor) || Number(valor) > 99) {
                    return responderErro(
                        interaction,
                        '❌ Digite um número entre 0 e 99.'
                    );
                }

                const botMembro = await interaction.guild.members.fetchMe();

                if (!canalAtual.permissionsFor(botMembro)
                    ?.has(PermissionFlagsBits.ManageChannels)) {
                    return responderErro(
                        interaction,
                        '❌ Preciso da permissão Gerenciar canais.'
                    );
                }

                if (!await verificarCooldown(
                    interaction,
                    membro,
                    'quantidade'
                )) {
                    return;
                }

                const limite = Number(valor);
                await canalAtual.setUserLimit(limite);

                return interaction.reply({
                    content: limite === 0
                        ? '✅ Limite da call removido com sucesso!'
                        : `✅ Limite da call atualizado para **${limite} pessoa(s)**!`,
                    ephemeral: true
                });
            }

            if (interaction.customId === 'modal_mutar_membro') {
                if (!eBooster(membro)) {
                    return responderErro(
                        interaction,
                        '❌ A opção Mutar é exclusiva para Boosters.'
                    );
                }

                const idMembro = interaction.fields
                    .getTextInputValue('id_membro')
                    .trim();

                const alvo = await buscarMembro(
                    interaction.guild,
                    idMembro
                );

                if (!alvo || !estaEmVoz(alvo)) {
                    return responderErro(
                        interaction,
                        '❌ Não encontrei esse membro em uma call.'
                    );
                }

                if (alvo.voice.serverMute) {
                    return responderErro(
                        interaction,
                        'ℹ️ Esse membro já está mutado pelo servidor.'
                    );
                }

                const botMembro = await interaction.guild.members.fetchMe();

                if (!botMembro.permissions.has(PermissionFlagsBits.MuteMembers)) {
                    return responderErro(
                        interaction,
                        '❌ Preciso da permissão Silenciar membros.'
                    );
                }

                if (!await verificarCooldown(interaction, membro, 'mutar')) {
                    return;
                }

                await alvo.voice.setMute(true);

                return interaction.reply({
                    content: '✅ Usuário mutado com sucesso!',
                    ephemeral: true
                });
            }

            return;
        }

        // MENU DE CARGOS
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'selecionar_cargo') {
                const comando = client.commands.get('cargos');

                if (!comando ||
                    typeof comando.handleSelect !== 'function') {
                    return responderErro(
                        interaction,
                        '❌ A função de seleção de cargos não foi encontrada.'
                    );
                }

                await comando.handleSelect(interaction);
                return;
            }

            // PAINEL DE CALL
            if (interaction.customId === 'controle_call') {
                const ferramenta = interaction.values[0];

                const membro = await interaction.guild.members.fetch(
                    interaction.user.id
                );

                // CRIAR CALL
                if (ferramenta === 'criar_call') {
                    const categoria = await interaction.guild.channels
                        .fetch(CATEGORIA_CALL)
                        .catch(() => null);

                    if (!categoria ||
                        categoria.type !== ChannelType.GuildCategory) {
                        return responderErro(
                            interaction,
                            '❌ A categoria configurada não foi encontrada. Verifique o ID.'
                        );
                    }

                    const botMembro = await interaction.guild.members.fetchMe();

                    if (!botMembro.permissions.has(
                        PermissionFlagsBits.ManageChannels
                    )) {
                        return responderErro(
                            interaction,
                            '❌ Preciso da permissão Gerenciar canais.'
                        );
                    }

                    if (!await verificarCooldown(
                        interaction,
                        membro,
                        'criar_call'
                    )) {
                        return;
                    }

                    const nome = (
                        membro.nickname || interaction.user.username
                    ).trim().slice(0, 100) || 'Nova call';

                    const novoCanal = await interaction.guild.channels.create({
                        name: nome,
                        type: ChannelType.GuildVoice,
                        parent: categoria.id,
                        permissionOverwrites: [
                            {
                                id: interaction.guild.roles.everyone.id,
                                allow: [
                                    PermissionFlagsBits.ViewChannel,
                                    PermissionFlagsBits.Connect
                                ]
                            },
                            {
                                id: interaction.user.id,
                                allow: [
                                    PermissionFlagsBits.ViewChannel,
                                    PermissionFlagsBits.Connect
                                ]
                            }
                        ]
                    });

                    callsTemporarias.add(novoCanal.id);

                    if (
                        botMembro.permissions.has(PermissionFlagsBits.MoveMembers) &&
                        novoCanal.permissionsFor(botMembro)
                            ?.has(PermissionFlagsBits.Connect)
                    ) {
                        try {
                            await membro.voice.setChannel(novoCanal);
                        } catch (error) {
                            console.error(
                                'Call criada, mas não consegui mover o usuário:',
                                error
                            );
                        }
                    }

                    if (novoCanal.members.size === 0) {
                        agendarExclusaoCall(novoCanal);
                    }

                    return interaction.reply({
                        content: `✅ Sua call **${nome}** foi criada!`,
                        ephemeral: true
                    });
                }

                if (!estaEmVoz(membro)) {
                    return responderErro(
                        interaction,
                        '❌ Entre em uma call antes de utilizar esta ferramenta.'
                    );
                }

                // ALTERAR LIMITE
                if (ferramenta === 'quantidade') {
                    return interaction.showModal(
                        criarModal(
                            'modal_limite_call',
                            'Limite de pessoas',
                            'limite_pessoas',
                            'Digite o limite (0 a 99)',
                            'Exemplo: 5. Use 0 para remover.'
                        )
                    );
                }

                // MOVER MEMBRO
                if (ferramenta === 'mover') {
                    const seletorMembro = new UserSelectMenuBuilder()
                        .setCustomId('mover_membro')
                        .setPlaceholder('Selecione o membro que deseja mover')
                        .setMinValues(1)
                        .setMaxValues(1);

                    return interaction.reply({
                        content: '👥 **Selecione o membro que deseja mover:**',
                        components: [
                            new ActionRowBuilder().addComponents(seletorMembro)
                        ],
                        ephemeral: true
                    });
                }

                // MUTAR MEMBRO
                if (ferramenta === 'mutar') {
                    if (!eBooster(membro)) {
                        return responderErro(
                            interaction,
                            '❌ A opção Mutar é exclusiva para Boosters.'
                        );
                    }

                    return interaction.showModal(
                        criarModal(
                            'modal_mutar_membro',
                            'Mutar membro',
                            'id_membro',
                            'ID do membro que deseja mutar',
                            'Cole o ID do membro'
                        )
                    );
                }

                // DESMUTAR A SI MESMO
                if (ferramenta === 'desmutar') {
                    if (!membro.voice.serverMute) {
                        return responderErro(
                            interaction,
                            'ℹ️ Você não está mutado pelo servidor. O mute local precisa ser desativado no próprio Discord.'
                        );
                    }

                    const botMembro = await interaction.guild.members.fetchMe();

                    if (!botMembro.permissions.has(PermissionFlagsBits.MuteMembers)) {
                        return responderErro(
                            interaction,
                            '❌ Preciso da permissão Silenciar membros.'
                        );
                    }

                    if (!await verificarCooldown(
                        interaction,
                        membro,
                        'desmutar'
                    )) {
                        return;
                    }

                    await membro.voice.setMute(false);

                    return interaction.reply({
                        content: '✅ Seu mute de servidor foi removido com sucesso!',
                        ephemeral: true
                    });
                }

                // PRIVAR CALL
                if (ferramenta === 'privar_call') {
                    const canal = membro.voice.channel;
                    const botMembro = await interaction.guild.members.fetchMe();

                    if (!canal.permissionsFor(botMembro)
                        ?.has(PermissionFlagsBits.ManageChannels)) {
                        return responderErro(
                            interaction,
                            '❌ Preciso da permissão Gerenciar canais.'
                        );
                    }

                    if (!await verificarCooldown(
                        interaction,
                        membro,
                        'privar_call'
                    )) {
                        return;
                    }

                    await canal.permissionOverwrites.edit(
                        interaction.guild.roles.everyone,
                        { Connect: false }
                    );

                    await canal.permissionOverwrites.edit(
                        interaction.user.id,
                        {
                            ViewChannel: true,
                            Connect: true
                        }
                    );

                    return interaction.reply({
                        content: '🔒 A call foi trancada! Novas conexões estão bloqueadas.',
                        ephemeral: true
                    });
                }

                // DESPRIVAR CALL
                if (ferramenta === 'desprivar_call') {
                    const canal = membro.voice.channel;
                    const botMembro = await interaction.guild.members.fetchMe();

                    if (!canal.permissionsFor(botMembro)
                        ?.has(PermissionFlagsBits.ManageChannels)) {
                        return responderErro(
                            interaction,
                            '❌ Preciso da permissão Gerenciar canais.'
                        );
                    }

                    if (!await verificarCooldown(
                        interaction,
                        membro,
                        'desprivar_call'
                    )) {
                        return;
                    }

                    await canal.permissionOverwrites.edit(
                        interaction.guild.roles.everyone,
                        { Connect: null }
                    );

                    return interaction.reply({
                        content: '🔓 A call foi destrancada! A entrada voltou a seguir as permissões do canal.',
                        ephemeral: true
                    });
                }
            }
        }

        // COMANDOS SLASH
        if (!interaction.isChatInputCommand()) return;

        const comando = client.commands.get(interaction.commandName);
        if (!comando) return;

        await comando.execute(interaction);

    } catch (error) {
        console.error('Erro na interação:', error);

        await responderErro(
            interaction,
            '❌ Ocorreu um erro. Verifique as permissões do bot e tente novamente.'
        );
    }
});

// ==================================================
// LIGAR BOT
// ==================================================

if (!process.env.DISCORD_TOKEN) {
    console.error('Token não encontrado nas variáveis de ambiente.');
} else {
    client.login(process.env.DISCORD_TOKEN).catch(error => {
        console.error('Falha ao conectar o bot:', error.message);
    });
}
