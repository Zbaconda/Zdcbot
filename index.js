require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const cron = require('node-cron');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const {
    Client,
    Collection,
    GatewayIntentBits,
    Partials,
    ActivityType,
    ChannelType,
    PermissionFlagsBits,
    ContainerBuilder,
    TextDisplayBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
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
// CONFIGURAÇÕES
// ======================================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const CATEGORIA_CALL = '1560763293994323999';
const CARGO_BOOSTER = '1559367297053757551';
const CANAL_PUBLICACOES_ID = '1567571023061057657';
const CANAL_LIMPEZA_ID = '1559375230202290256';
const CANAL_FREEFIRE_ID = '1568364484098269194';

const BANNER_PAINEL_CALL = 'https://media.discordapp.net/attachments/1559056011375943784/1563610071886331994/file_0000000060b8820e9ce7fd5014b9b33a.png?ex=6ae03b1b&is=6adee99b&hm=89cc9ed84a2ef5f71ddaccaa52f5c6caff67303cb83988cc308da4f0907a89d5&=&format=webp&quality=lossless';

const FUSO_HORARIO = 'America/Sao_Paulo';
const TEMPO_EXCLUSAO_CALL_VAZIA = 10000;
const INTERVALO_ATIVIDADE = 10 * 60 * 60 * 1000;
const INTERVALO_RESULTADO_FF = 30000;
const LIMITE_VERIFICACAO = 40;

const EMOJIS_PUBLICACAO = {
    curtidaVazia: { id: '1567528948093554781', name: 'coracaovazio' },
    republicacaoVazia: { id: '1567528817667612725', name: 'naorepost' },
    comentario: { id: '1567528753415061594', name: 'cometario' },
    informacao: { id: '1567532202118484068', name: 'info' }
};

const DATA_DIR = path.join(__dirname, 'data');
const ARQUIVO_PUBLICACOES = path.join(DATA_DIR, 'publicacoes.json');
const ARQUIVO_LIMPEZA = path.join(DATA_DIR, 'limpeza.json');
const ARQUIVO_CALLS_TEMPORARIAS = path.join(DATA_DIR, 'calls_temporarias.json');
const ARQUIVO_VERIFICADOS = path.join(DATA_DIR, 'verificados.json');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function garantirArquivo(arquivo) {
    if (!fs.existsSync(arquivo)) {
        fs.writeFileSync(arquivo, '{}', 'utf8');
    }
}

[
    ARQUIVO_PUBLICACOES,
    ARQUIVO_LIMPEZA,
    ARQUIVO_CALLS_TEMPORARIAS,
    ARQUIVO_VERIFICADOS
].forEach(garantirArquivo);

// ======================================================
// FREE FIRE CORE
// ======================================================

const FF = require('./commands/freefireCore');

const partidasMonitoradas = new Set();
const partidasIniciando = new Set();
const partidasFinalizando = new Set();

let intervaloMonitoramentoFF = null;

// ======================================================
// CLIENTE
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
// JSON
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

function obterCallsTemporarias() {
    return lerJSON(ARQUIVO_CALLS_TEMPORARIAS);
}

function registrarCallTemporaria(canalId) {
    const calls = obterCallsTemporarias();
    calls[canalId] = true;
    salvarJSON(ARQUIVO_CALLS_TEMPORARIAS, calls);
    return obterCallsTemporarias()[canalId] === true;
}

function removerRegistroCall(canalId) {
    const calls = obterCallsTemporarias();
    delete calls[canalId];
    salvarJSON(ARQUIVO_CALLS_TEMPORARIAS, calls);
}

// ======================================================
// RESPOSTAS
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
// COMANDOS SLASH
// ======================================================

const pastaComandos = path.join(__dirname, 'commands');

if (fs.existsSync(pastaComandos)) {
    const arquivos = fs.readdirSync(pastaComandos)
        .filter(arquivo => arquivo.endsWith('.js'));

    for (const arquivo of arquivos) {
        try {
            const comando = require(path.join(pastaComandos, arquivo));

            if (
                comando &&
                comando.data &&
                typeof comando.data.toJSON === 'function' &&
                typeof comando.execute === 'function'
            ) {
                client.commands.set(comando.data.name, comando);
                console.log(`Comando carregado: ${comando.data.name}`);
            }
        } catch (erro) {
            console.error(`Erro ao carregar ${arquivo}:`, erro);
        }
    }
}

async function registrarComandos() {
    if (!TOKEN || !CLIENT_ID) {
        console.warn('Configure DISCORD_TOKEN e CLIENT_ID.');
        return;
    }

    const comandos = [...client.commands.values()]
        .map(comando => comando.data.toJSON());

    if (!comandos.length) {
        console.log('Nenhum comando slash encontrado.');
        return;
    }

    try {
        const rest = new REST({ version: '10' }).setToken(TOKEN);

        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: comandos }
        );

        console.log(`${comandos.length} comandos slash registrados.`);
    } catch (erro) {
        console.error('Erro ao registrar comandos:', erro);
    }
}

// ======================================================
// ATIVIDADE
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
    if (!client.user || !series.length) return;

    client.user.setActivity(series[indiceSerie], {
        type: ActivityType.Watching
    });

    indiceSerie = (indiceSerie + 1) % series.length;
}

// ======================================================
// CALLS TEMPORÁRIAS
// ======================================================

function obterCall(interaction) {
    return interaction.member?.voice?.channel || null;
}

function ehBooster(membro) {
    return Boolean(membro?.roles?.cache?.has(CARGO_BOOSTER));
}

function estaNaCategoriaCall(canal) {
    return Boolean(canal && canal.parentId === CATEGORIA_CALL);
}

function ehCallTemporaria(canal) {
    if (
        !canal ||
        canal.type !== ChannelType.GuildVoice ||
        !estaNaCategoriaCall(canal)
    ) {
        return false;
    }

    return obterCallsTemporarias()[canal.id] === true;
}

function podeControlarCall(interaction, canal) {
    if (!canal || !interaction.member) return false;

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

    return interaction.member?.voice?.channelId === canal.id;
}

function cancelarTemporizadorCall(canalId) {
    const temporizador = temporizadoresCall.get(canalId);

    if (temporizador) {
        clearTimeout(temporizador);
        temporizadoresCall.delete(canalId);
    }
}

function programarExclusaoCall(canal) {
    if (!ehCallTemporaria(canal)) return;

    cancelarTemporizadorCall(canal.id);

    const temporizador = setTimeout(async () => {
        try {
            const atual = await canal.guild.channels
                .fetch(canal.id)
                .catch(() => null);

            if (ehCallTemporaria(atual) && atual.members.size === 0) {
                await atual.delete(
                    'Call temporária criada pelo bot e vazia há 10 segundos.'
                );

                removerRegistroCall(atual.id);
                console.log(`Call temporária excluída: ${atual.name}`);
            }
        } catch (erro) {
            console.error('Erro ao excluir call temporária:', erro);
        } finally {
            temporizadoresCall.delete(canal.id);
        }
    }, TEMPO_EXCLUSAO_CALL_VAZIA);

    temporizadoresCall.set(canal.id, temporizador);
}

async function criarCallTemporaria(interaction) {
    const guild = interaction.guild;
    const membro = interaction.member;

    if (!guild || !membro || !membro.user) {
        return responderErro(
            interaction,
            'Use esta opção dentro do servidor.'
        );
    }

    try {
        const categoria = await guild.channels
            .fetch(CATEGORIA_CALL)
            .catch(() => null);

        if (!categoria || categoria.type !== ChannelType.GuildCategory) {
            return responderErro(
                interaction,
                'A categoria das calls não foi encontrada. Confira o ID.'
            );
        }

        const canais = await guild.channels.fetch();

        const nomeSeguro = (membro.user.username || 'membro')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 100) || 'membro';

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

        if (!registrarCallTemporaria(canal.id)) {
            await canal.delete().catch(() => null);

            return responderErro(
                interaction,
                'Não consegui registrar a call com segurança.'
            );
        }

        await interaction.reply({
            content: `Call criada com sucesso!\nVá para a call: ${canal}`,
            flags: MessageFlags.Ephemeral
        });

        if (membro.voice?.channel) {
            try {
                await membro.voice.setChannel(canal);
            } catch (erro) {
                console.error('Não consegui mover o criador:', erro);

                await interaction.followUp({
                    content: 'A call foi criada, mas não consegui mover você.',
                    flags: MessageFlags.Ephemeral
                }).catch(() => null);
            }
        }

        console.log(`Call temporária registrada: ${canal.name}`);
        return canal;
    } catch (erro) {
        console.error('Erro ao criar call:', erro);

        return responderErro(
            interaction,
            'Não consegui criar a call. Confira as permissões do bot.'
        );
    }
}

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
        { ViewChannel: false, Connect: false }
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
        { ViewChannel: true, Connect: true }
    );
}

function criarPainelCall() {
    const painel = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '# Controle de call\n\n' +
                'Use os botões abaixo para controlar sua chamada.\n\n' +
                'Limite: alterar a quantidade de pessoas.\n' +
                'Mover: mover alguém para sua call.\n' +
                'Mutar: recurso exclusivo para Boosters.\n' +
                'Desmutar: retirar seu mute de servidor.\n' +
                'Privar: restringir o acesso à call.\n' +
                'Liberar: permitir que todos entrem novamente.'
            )
        )
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL(BANNER_PAINEL_CALL)
            )
        );

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
        components: [painel, linha1, linha2],
        flags: MessageFlags.IsComponentsV2
    };
}

// ======================================================
// PUBLICAÇÕES
// ======================================================

function emojiPersonalizado(emoji) {
    return {
        id: emoji.id,
        name: emoji.name
    };
}

function criarBotoesPublicacao(id) {
    const linha = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`pub_like_${id}`)
            .setEmoji(emojiPersonalizado(EMOJIS_PUBLICACAO.curtidaVazia))
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(`pub_comentar_${id}`)
            .setEmoji(emojiPersonalizado(EMOJIS_PUBLICACAO.comentario))
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(`pub_republicar_${id}`)
            .setEmoji(emojiPersonalizado(EMOJIS_PUBLICACAO.republicacaoVazia))
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(`pub_detalhes_${id}`)
            .setEmoji(emojiPersonalizado(EMOJIS_PUBLICACAO.informacao))
            .setLabel('Info')
            .setStyle(ButtonStyle.Secondary)
    );

    return [linha];
}

// ======================================================
// SISTEMA DE VERIFICAÇÃO
// ======================================================

function obterVerificados() {
    return lerJSON(ARQUIVO_VERIFICADOS);
}

function usuarioVerificado(usuarioId) {
    return Boolean(obterVerificados()[usuarioId]);
}

function atualizarVerificacoes(publicacoes) {
    const verificados = obterVerificados();
    const curtidasPorUsuario = {};

    for (const publicacao of Object.values(publicacoes)) {
        if (!publicacao || !publicacao.autorId) continue;

        if (!Array.isArray(publicacao.curtidas)) {
            publicacao.curtidas = [];
        }

        curtidasPorUsuario[publicacao.autorId] =
            (curtidasPorUsuario[publicacao.autorId] || 0) +
            publicacao.curtidas.length;
    }

    for (const [usuarioId, total] of Object.entries(curtidasPorUsuario)) {
        if (total >= LIMITE_VERIFICACAO && !verificados[usuarioId]) {
            verificados[usuarioId] = {
                verificadoDesde: new Date().toISOString()
            };

            console.log(`Usuário ${usuarioId} recebeu verificação.`);
        }
    }

    salvarJSON(ARQUIVO_VERIFICADOS, verificados);
}

// ======================================================
// MENÇÕES NAS PUBLICAÇÕES
// ======================================================

async function formatarMencoes(texto, mensagem) {
    if (!texto) return '';

    let resultado = texto;

    const mencoesUsuarios = [...resultado.matchAll(/<@!?(\d+)>/g)];

    for (const mencao of mencoesUsuarios) {
        const id = mencao[1];

        let usuario = mensagem.mentions.users.get(id);

        if (!usuario) {
            usuario = await client.users.fetch(id).catch(() => null);
        }

        if (usuario) {
            const membro = await mensagem.guild.members
                .fetch(id)
                .catch(() => null);

            const nome = membro?.displayName ||
                usuario.globalName ||
                usuario.username;

            resultado = resultado.replace(
                new RegExp(`<@!?${id}>`, 'g'),
                `@${nome}`
            );
        }
    }

    const mencoesCargos = [...resultado.matchAll(/<@&(\d+)>/g)];

    for (const mencao of mencoesCargos) {
        const id = mencao[1];
        const cargo = mensagem.mentions.roles.get(id) ||
            await mensagem.guild.roles.fetch(id).catch(() => null);

        if (cargo) {
            resultado = resultado.replace(
                new RegExp(`<@&${id}>`, 'g'),
                `@${cargo.name}`
            );
        }
    }

    const mencoesCanais = [...resultado.matchAll(/<#(\d+)>/g)];

    for (const mencao of mencoesCanais) {
        const id = mencao[1];
        const canal = mensagem.mentions.channels.get(id) ||
            await mensagem.guild.channels.fetch(id).catch(() => null);

        if (canal) {
            resultado = resultado.replace(
                new RegExp(`<#${id}>`, 'g'),
                `#${canal.name}`
            );
        }
    }

    return resultado;
}

// ======================================================
// FUNÇÕES DO CARD DE PUBLICAÇÃO
// ======================================================

function arredondarRetangulo(ctx, x, y, largura, altura, raio) {
    ctx.beginPath();
    ctx.moveTo(x + raio, y);
    ctx.lineTo(x + largura - raio, y);
    ctx.quadraticCurveTo(x + largura, y, x + largura, y + raio);
    ctx.lineTo(x + largura, y + altura - raio);
    ctx.quadraticCurveTo(
        x + largura,
        y + altura,
        x + largura - raio,
        y + altura
    );
    ctx.lineTo(x + raio, y + altura);
    ctx.quadraticCurveTo(x, y + altura, x, y + altura - raio);
    ctx.lineTo(x, y + raio);
    ctx.quadraticCurveTo(x, y, x + raio, y);
    ctx.closePath();
}

function quebrarTexto(ctx, texto, largura) {
    const palavras = String(texto || '').split(/\s+/);
    const linhas = [];
    let linha = '';

    for (const palavra of palavras) {
        const teste = linha ? `${linha} ${palavra}` : palavra;

        if (ctx.measureText(teste).width > largura && linha) {
            linhas.push(linha);
            linha = palavra;
        } else {
            linha = teste;
        }
    }

    if (linha) linhas.push(linha);
    return linhas;
}

async function carregarImagem(url) {
    if (!url) return null;

    try {
        return await loadImage(url);
    } catch (erro) {
        console.warn('Não consegui carregar imagem:', erro.message);
        return null;
    }
}

function desenharImagemCortada(ctx, imagem, x, y, largura, altura) {
    const proporcao = Math.max(
        largura / imagem.width,
        altura / imagem.height
    );

    const larguraNova = imagem.width * proporcao;
    const alturaNova = imagem.height * proporcao;

    const deslocamentoX = (largura - larguraNova) / 2;
    const deslocamentoY = (altura - alturaNova) / 2;

    ctx.save();
    arredondarRetangulo(ctx, x, y, largura, altura, 18);
    ctx.clip();

    ctx.drawImage(
        imagem,
        x + deslocamentoX,
        y + deslocamentoY,
        larguraNova,
        alturaNova
    );

    ctx.restore();
}

async function gerarCardPublicacao(publicacao) {
    const largura = 1200;
    const margem = 64;
    const larguraTexto = largura - margem * 2;

    const texto = publicacao.texto || '';
    const autorNome = publicacao.autorNome || 'Usuário';
    const username = publicacao.autorUsername || 'usuario';

    const avatar = await carregarImagem(publicacao.avatarURL);

    const imagemMidia = publicacao.imagemURL
        ? await carregarImagem(publicacao.imagemURL)
        : null;

    const data = new Date(publicacao.data || Date.now());

    const dataFormatada = new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: FUSO_HORARIO
    }).format(data);

    const fonteNome = '300 36px Arial';
    const fonteUsername = '300 22px Arial';
    const fonteTexto = '300 32px Arial';
    const fonteData = '300 22px Arial';
    const fonteContador = '300 22px Arial';

    const canvasMedida = createCanvas(largura, 100);
    const ctxMedida = canvasMedida.getContext('2d');

    ctxMedida.font = fonteTexto;

    const linhas = quebrarTexto(
        ctxMedida,
        texto || ' ',
        larguraTexto
    );

    const alturaTexto = Math.max(1, linhas.length) * 43;
    const alturaImagem = imagemMidia ? 480 : 0;

    const altura =
        220 +
        alturaTexto +
        (imagemMidia ? alturaImagem + 35 : 0) +
        160;

    const canvas = createCanvas(largura, altura);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, largura, altura);

    ctx.strokeStyle = '#202020';
    ctx.lineWidth = 2;
    arredondarRetangulo(ctx, 2, 2, largura - 4, altura - 4, 28);
    ctx.stroke();

    if (avatar) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(112, 112, 48, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(avatar, 64, 64, 96, 96);
        ctx.restore();
    } else {
        ctx.fillStyle = '#292b33';
        ctx.beginPath();
        ctx.arc(112, 112, 48, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = fonteNome;
    ctx.fillText(autorNome.slice(0, 35), 190, 100);

    if (publicacao.verificado) {
        const nomeLargura = ctx.measureText(
            autorNome.slice(0, 35)
        ).width;

        const seloX = Math.min(190 + nomeLargura + 22, 1030);

        ctx.fillStyle = '#ed4245';
        ctx.beginPath();
        ctx.arc(seloX, 88, 17, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = '300 20px Arial';
        ctx.fillText('✓', seloX - 7, 95);
    }

    ctx.fillStyle = '#9b9da7';
    ctx.font = fonteUsername;
    ctx.fillText(`@${username}`.slice(0, 45), 190, 140);

    let y = 205;

    ctx.fillStyle = '#f5f5f7';
    ctx.font = fonteTexto;

    for (const linha of linhas) {
        ctx.fillText(linha, margem, y);
        y += 43;
    }

    y += 18;

    if (imagemMidia) {
        desenharImagemCortada(
            ctx,
            imagemMidia,
            margem,
            y,
            larguraTexto,
            alturaImagem
        );

        y += alturaImagem + 35;
    }

    ctx.strokeStyle = '#292b33';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(margem, altura - 135);
    ctx.lineTo(largura - margem, altura - 135);
    ctx.stroke();

    ctx.fillStyle = '#8d909a';
    ctx.font = fonteData;
    ctx.fillText(dataFormatada, margem, altura - 95);

    const curtidas = publicacao.curtidas?.length || 0;
    const comentarios = publicacao.comentarios?.length || 0;
    const republicacoes = publicacao.republicacoes?.length || 0;

    const desenharContador = (numero, descricao, x, yPos) => {
        const textoNumero = String(numero);

        ctx.fillStyle = '#ffffff';
        ctx.font = fonteContador;
        ctx.fillText(textoNumero, x, yPos);

        const larguraNumero = ctx.measureText(textoNumero).width;

        ctx.fillStyle = '#8d909a';
        ctx.font = fonteContador;
        ctx.fillText(descricao, x + larguraNumero + 8, yPos);
    };

    desenharContador(curtidas, 'curtidas', margem, altura - 42);
    desenharContador(comentarios, 'comentários', margem + 280, altura - 42);
    desenharContador(republicacoes, 'republicações', margem + 650, altura - 42);

    return canvas.toBuffer('image/png');
}

// ======================================================
// ATUALIZAR CARD PUBLICADO
// ======================================================

async function atualizarCardPublicacao(publicacaoId) {
    const publicacoes = obterPublicacoes();
    const publicacao = publicacoes[publicacaoId];

    if (!publicacao?.mensagemPublicadaId) return;

    try {
        const canal = await client.channels.fetch(
            publicacao.canalId
        ).catch(() => null);

        if (!canal) return;

        const mensagem = await canal.messages.fetch(
            publicacao.mensagemPublicadaId
        ).catch(() => null);

        if (!mensagem) return;

        const buffer = await gerarCardPublicacao(publicacao);

        const arquivo = new AttachmentBuilder(buffer, {
            name: `publicacao-${publicacaoId}.png`
        });

        await mensagem.edit({
            attachments: [],
            files: [arquivo],
            components: criarBotoesPublicacao(publicacaoId)
        });
    } catch (erro) {
        console.error('Erro ao atualizar card:', erro);
    }
}

// ======================================================
// PUBLICAR MENSAGEM
// ======================================================

async function publicarMensagem(mensagem) {
    if (mensagem.author.bot || !mensagem.guild) return;
    if (mensagem.channelId !== CANAL_PUBLICACOES_ID) return;

    const textoOriginal = mensagem.content?.trim() || '';
    const texto = await formatarMencoes(textoOriginal, mensagem);

    const anexos = [...mensagem.attachments.values()];

    const imagens = anexos.filter(anexo =>
        anexo.contentType?.startsWith('image/') ||
        /\.(png|jpe?g|gif|webp)$/i.test(anexo.name || '')
    );

    const videos = anexos.filter(anexo =>
        anexo.contentType?.startsWith('video/') ||
        /\.(mp4|mov|webm)$/i.test(anexo.name || '')
    );

    if (!texto && anexos.length === 0) return;

    try {
        const canal = await mensagem.guild.channels
            .fetch(CANAL_PUBLICACOES_ID)
            .catch(() => null);

        if (!canal?.isTextBased() || !canal.send) return;

        const data = new Date();

        const autor = mensagem.member?.displayName ||
            mensagem.author.globalName ||
            mensagem.author.username;

        const publicacao = {
            autorId: mensagem.author.id,
            autorNome: autor,
            autorUsername: mensagem.author.username,
            avatarURL: mensagem.author.displayAvatarURL({
                extension: 'png',
                size: 256
            }),
            guildId: mensagem.guild.id,
            canalId: mensagem.channelId,
            mensagemOriginalId: mensagem.id,
            mensagemPublicadaId: null,
            texto,
            curtidas: [],
            comentarios: [],
            republicacoes: [],
            mensagensRepostadas: {},
            data: data.toISOString(),
            verificado: usuarioVerificado(mensagem.author.id),
            imagemURL: imagens[0]?.url || null,
            video: videos.length > 0
        };

        const buffer = await gerarCardPublicacao(publicacao);

        const arquivos = [
            new AttachmentBuilder(buffer, {
                name: `publicacao-${mensagem.id}.png`
            })
        ];

        for (const video of videos.slice(0, 2)) {
            try {
                const resposta = await fetch(video.url);

                if (!resposta.ok) continue;

                const dados = Buffer.from(
                    await resposta.arrayBuffer()
                );

                arquivos.push(
                    new AttachmentBuilder(dados, {
                        name: video.name || 'video.mp4'
                    })
                );
            } catch (erro) {
                console.warn('Não consegui copiar o vídeo:', erro.message);
            }
        }

        const publicacoes = obterPublicacoes();
        publicacoes[mensagem.id] = publicacao;
        salvarPublicacoes(publicacoes);

        const publicada = await canal.send({
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

        console.log(`Publicação criada: ${mensagem.id}`);
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
            console.error('Canal de limpeza não encontrado ou inválido.');
            return;
        }

        let total = 0;

        while (true) {
            const mensagens = await canal.messages.fetch({ limit: 100 });

            if (!mensagens.size) break;

            const recentes = mensagens.filter(m =>
                Date.now() - m.createdTimestamp <
                14 * 24 * 60 * 60 * 1000
            );

            const antigas = mensagens.filter(m =>
                Date.now() - m.createdTimestamp >=
                14 * 24 * 60 * 60 * 1000
            );

            if (recentes.size) {
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

                await new Promise(resolve => setTimeout(resolve, 350));
            }

            if (mensagens.size < 100) break;
        }

        const estado = lerJSON(ARQUIVO_LIMPEZA);
        estado.ultimaLimpeza = new Date().toISOString();
        estado.totalExcluidas = total;
        salvarJSON(ARQUIVO_LIMPEZA, estado);

        console.log(`Limpeza concluída. Total excluído: ${total}`);
    } catch (erro) {
        console.error('Erro na limpeza semanal:', erro);
    }
}

cron.schedule('0 0 * * 0', limparCanalSemanal, {
    timezone: FUSO_HORARIO
});

// ======================================================
// FREE FIRE - PAINEL E PARTIDAS
// ======================================================

function obterParticipantesFF(match) {
    return [
        match.captain1Id,
        match.captain2Id || match.adversaryId
    ].filter(Boolean);
}

function obterStatusFF(status) {
    const estados = {
        waiting: 'Aguardando confirmação',
        starting: 'Iniciando sala...',
        playing: 'Partida em andamento',
        finished: 'Partida finalizada',
        cancelled: 'Partida cancelada',
        start_error: 'Falha ao iniciar — verificar sala',
        no_match: 'Nenhuma partida reconhecida pela API'
    };

    return estados[status] || status || 'Status desconhecido';
}

function criarTextoPainelFF(match) {
    const confirmacoes = Array.isArray(match.confirmations)
        ? match.confirmations
        : [];

    return (
        '# PARTIDA FREE FIRE\n\n' +
        `**Partida:** #${match.id}\n` +
        '**Formato:** 1v1\n' +
        '**Mapa:** Bermuda\n\n' +
        `**Jogador 1:** <@${match.captain1Id}>\n` +
        `**Adversário:** <@${match.captain2Id || match.adversaryId}>\n\n` +
        `**ID da sala:** ${match.roomId}\n` +
        `**Senha:** ${match.password}\n` +
        '**Configuração:** AP Padrão\n\n' +
        `**Confirmações:** ${confirmacoes.length}/2\n` +
        `**Status:** ${obterStatusFF(match.status)}\n\n` +
        (
            match.status === 'waiting'
                ? 'Somente os dois participantes podem confirmar.\n' +
                  'Clique em **Confirmar presença** ou envie **GO** no canal.'
                : 'Acompanhe o andamento da partida por este painel.'
        )
    );
}

function criarBotoesFF(match) {
    const aguardando = match.status === 'waiting';

    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`ff_confirmar:${match.id}`)
                .setLabel('Confirmar presença')
                .setEmoji('✅')
                .setStyle(ButtonStyle.Success)
                .setDisabled(!aguardando),

            new ButtonBuilder()
                .setCustomId(`ff_copiar:${match.id}`)
                .setLabel('Copiar ID')
                .setEmoji('🆔')
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId(`ff_convite:${match.id}`)
                .setLabel('Convite da sala')
                .setEmoji('🔗')
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId(`ff_cancelar:${match.id}`)
                .setLabel('Cancelar partida')
                .setEmoji('✖️')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(!aguardando)
        )
    ];
}

async function atualizarPainelFF(matchId) {
    const db = FF.readDB();
    const match = db.matches?.[String(matchId)];

    if (!match?.channelId || !match?.messageId) return;

    try {
        const canal = await client.channels
            .fetch(match.channelId)
            .catch(() => null);

        if (!canal?.isTextBased()) return;

        const mensagem = await canal.messages
            .fetch(match.messageId)
            .catch(() => null);

        if (!mensagem) return;

        await mensagem.edit({
            components: [
                FF.makeContainer(criarTextoPainelFF(match)),
                ...criarBotoesFF(match)
            ],
            flags: MessageFlags.IsComponentsV2
        });
    } catch (erro) {
        console.error('[FREE FIRE] Erro ao atualizar painel:', erro);
    }
}

async function localizarPartidaFF(matchId) {
    const db = FF.readDB();
    const match = db.matches?.[String(matchId)];

    return match ? { db, match } : null;
}

// ======================================================
// FREE FIRE - CONFIRMAÇÃO E INÍCIO
// ======================================================

async function confirmarPartidaFF(matchId, usuarioId, canal) {
    const resultado = await localizarPartidaFF(matchId);

    if (!resultado) {
        return {
            ok: false,
            mensagem: 'Essa partida não foi encontrada.'
        };
    }

    const { db, match } = resultado;
    const participantes = obterParticipantesFF(match);

    if (!participantes.includes(usuarioId)) {
        return {
            ok: false,
            mensagem: 'Somente os dois participantes podem confirmar esta partida.'
        };
    }

    if (match.status !== 'waiting') {
        return {
            ok: false,
            mensagem: `Esta partida não está aguardando confirmação. Status: ${obterStatusFF(match.status)}.`
        };
    }

    if (!Array.isArray(match.confirmations)) {
        match.confirmations = [];
    }

    if (match.confirmations.includes(usuarioId)) {
        return {
            ok: false,
            mensagem: 'Você já confirmou sua presença.'
        };
    }

    match.confirmations.push(usuarioId);

    if (!FF.saveDB(db)) {
        return {
            ok: false,
            mensagem: 'Não consegui salvar sua confirmação. Tente novamente.'
        };
    }

    await atualizarPainelFF(matchId);

    if (match.confirmations.length >= 2) {
        await iniciarPartidaFF(matchId, canal);

        return {
            ok: true,
            mensagem: 'Os dois jogadores confirmaram. Estou iniciando a sala!'
        };
    }

    const outro = participantes.find(id => id !== usuarioId);

    return {
        ok: true,
        mensagem:
            `Sua presença foi confirmada! Agora falta <@${outro}>.\n` +
            '**Confirmações: 1/2.**'
    };
}

async function iniciarPartidaFF(matchId, canalOrigem = null) {
    const id = String(matchId);

    if (partidasIniciando.has(id)) return;

    const resultado = await localizarPartidaFF(id);

    if (!resultado) return;

    const { db, match } = resultado;

    if (match.status !== 'waiting') return;

    if (
        !Array.isArray(match.confirmations) ||
        match.confirmations.length < 2
    ) {
        return;
    }

    partidasIniciando.add(id);

    try {
        // O status é salvo antes da chamada à API para evitar
        // que duas confirmações iniciem a mesma sala duas vezes.
        match.status = 'starting';
        match.startAttemptAt = new Date().toISOString();

        if (!FF.saveDB(db)) {
            throw new Error('Não consegui salvar o estado de inicialização.');
        }

        await atualizarPainelFF(id);

        try {
            const resposta = await FF.startNixRoom(match.sessionId);

            const dbAtualizado = FF.readDB();
            const partidaAtualizada = dbAtualizado.matches?.[id];

            if (!partidaAtualizada) return;

            partidaAtualizada.status = 'playing';
            partidaAtualizada.startedAt = new Date().toISOString();
            partidaAtualizada.startResponse = resposta || null;

            FF.saveDB(dbAtualizado);

            await atualizarPainelFF(id);

            const canal = canalOrigem ||
                await client.channels.fetch(
                    partidaAtualizada.channelId
                ).catch(() => null);

            if (canal?.isTextBased()) {
                await FF.sendContainer(
                    canal,
                    `# PARTIDA #${id} INICIADA!\n\n` +
                    'Os dois jogadores confirmaram a presença e a sala foi iniciada.\n' +
                    `**ID da sala:** ${partidaAtualizada.roomId}\n` +
                    '**Status:** Partida em andamento.\n\n' +
                    'O bot acompanhará o resultado automaticamente.'
                );
            }

            iniciarMonitoramentoPartidaFF(id);
            console.log(`[FREE FIRE] Partida #${id} iniciada.`);
        } catch (erroAPI) {
            console.error(
                `[FREE FIRE] Falha ao iniciar partida #${id}:`,
                erroAPI
            );

            const dbErro = FF.readDB();
            const partidaErro = dbErro.matches?.[id];

            if (partidaErro) {
                partidaErro.status = 'start_error';
                partidaErro.startError = erroAPI.message;
                partidaErro.startErrorAt = new Date().toISOString();
                FF.saveDB(dbErro);

                await atualizarPainelFF(id);
            }

            const canal = canalOrigem ||
                await client.channels.fetch(
                    match.channelId
                ).catch(() => null);

            if (canal?.isTextBased()) {
                await FF.sendContainer(
                    canal,
                    `# ATENÇÃO — PARTIDA #${id}\n\n` +
                    'A API não confirmou o início da sala.\n' +
                    'Por segurança, não vou tentar iniciar novamente automaticamente.\n\n' +
                    'A equipe precisa verificar o estado da sala antes de qualquer nova tentativa.'
                );
            }
        }
    } finally {
        partidasIniciando.delete(id);
    }
}

// ======================================================
// FREE FIRE - CANCELAMENTO
// ======================================================

async function cancelarPartidaFF(matchId, usuarioId, membro, interaction) {
    const resultado = await localizarPartidaFF(matchId);

    if (!resultado) {
        return responderErro(interaction, 'Partida não encontrada.');
    }

    const { db, match } = resultado;
    const participantes = obterParticipantesFF(match);

    if (
        !participantes.includes(usuarioId) &&
        !FF.isAdmin(membro)
    ) {
        return responderErro(
            interaction,
            'Somente os participantes ou a equipe administrativa podem cancelar.'
        );
    }

    if (match.status !== 'waiting') {
        return responderErro(
            interaction,
            'Só é possível cancelar uma partida que ainda aguarda confirmação.'
        );
    }

    try {
        await interaction.deferReply({
            flags: MessageFlags.Ephemeral
        });

        await FF.releaseNixRoom(match.sessionId);

        const dbAtualizado = FF.readDB();
        const partidaAtualizada = dbAtualizado.matches?.[String(matchId)];

        if (!partidaAtualizada) {
            return interaction.editReply({
                content: 'A sala foi liberada, mas não encontrei a partida no banco.'
            });
        }

        partidaAtualizada.status = 'cancelled';
        partidaAtualizada.cancelledAt = new Date().toISOString();
        partidaAtualizada.cancelledBy = usuarioId;

        FF.saveDB(dbAtualizado);

        await atualizarPainelFF(matchId);

        await interaction.editReply({
            content: `A partida #${matchId} foi cancelada e a sala foi liberada.`
        });

        const canal = await client.channels
            .fetch(match.channelId)
            .catch(() => null);

        if (canal?.isTextBased()) {
            await FF.sendContainer(
                canal,
                `# PARTIDA #${matchId} CANCELADA\n\nA sala foi liberada pela NixFF.`
            );
        }
    } catch (erro) {
        console.error('[FREE FIRE] Erro ao cancelar partida:', erro);

        if (interaction.deferred || interaction.replied) {
            return interaction.editReply({
                content: `Não consegui cancelar a sala: ${erro.publicMessage || erro.message}`
            }).catch(() => null);
        }

        return responderErro(
            interaction,
            `Não consegui cancelar a sala: ${erro.publicMessage || erro.message}`
        );
    }
}

// ======================================================
// FREE FIRE - RESULTADO DA NIXFF
// ======================================================

function valorBooleano(valor) {
    return valor === true ||
        valor === 1 ||
        String(valor).toLowerCase() === 'true';
}

function extrairJogadoresResultado(dados) {
    if (!dados || typeof dados !== 'object') return [];

    const candidatos = [
        dados.players,
        dados.members,
        dados.participants,
        dados.player_results,
        dados.results?.players,
        dados.data?.players,
        dados.data?.members,
        dados.result?.players
    ];

    for (const lista of candidatos) {
        if (Array.isArray(lista)) return lista;
    }

    const equipes = [
        dados.teams,
        dados.data?.teams,
        dados.result?.teams
    ].find(Array.isArray);

    if (equipes) {
        return equipes.flatMap((equipe, indice) => {
            const jogadores = equipe.players ||
                equipe.members ||
                equipe.participants ||
                [];

            return Array.isArray(jogadores)
                ? jogadores.map(jogador => ({
                    ...jogador,
                    teamId: jogador.teamId ?? equipe.id ?? indice,
                    teamWinner: jogador.teamWinner ??
                        equipe.winner ??
                        equipe.is_winner
                }))
                : [];
        });
    }

    return [];
}

function extrairUidJogador(jogador) {
    return String(
        jogador.account_id ??
        jogador.accountId ??
        jogador.uid ??
        jogador.player_uid ??
        jogador.playerId ??
        jogador.id ??
        ''
    );
}

function extrairDiscordIdJogador(jogador) {
    return String(
        jogador.discord_id ??
        jogador.discordId ??
        jogador.user_id ??
        jogador.userId ??
        ''
    );
}

function extrairKills(jogador) {
    const valor =
        jogador.kills ??
        jogador.kill ??
        jogador.eliminations ??
        jogador.eliminacao ??
        jogador.total_kills;

    const numero = Number(valor);

    return Number.isFinite(numero) ? numero : 0;
}

function extrairNomeJogador(jogador) {
    return String(
        jogador.nickname ??
        jogador.nick ??
        jogador.name ??
        jogador.username ??
        'Jogador'
    );
}

function identificarVencedor(dados, jogadores) {
    const vencedorDireto =
        dados.winner ??
        dados.winning_team ??
        dados.winner_team ??
        dados.data?.winner ??
        dados.result?.winner;

    if (vencedorDireto !== undefined && vencedorDireto !== null) {
        return String(
            vencedorDireto.id ??
            vencedorDireto.team_id ??
            vencedorDireto.teamId ??
            vencedorDireto
        );
    }

    const jogadorVencedor = jogadores.find(jogador =>
        valorBooleano(jogador.winner) ||
        valorBooleano(jogador.is_winner) ||
        valorBooleano(jogador.teamWinner)
    );

    if (jogadorVencedor) {
        return String(
            jogadorVencedor.teamId ??
            jogadorVencedor.team_id ??
            jogadorVencedor.team ??
            extrairDiscordIdJogador(jogadorVencedor) ??
            ''
        );
    }

    return null;
}

function identificarEstadoResultado(dados) {
    return String(
        dados.status ??
        dados.state ??
        dados.result_status ??
        dados.data?.status ??
        dados.result?.status ??
        ''
    ).toLowerCase();
}

function mapearDiscordIdPorJogador(jogador, db) {
    const discordId = extrairDiscordIdJogador(jogador);

    if (discordId) return discordId;

    const uid = extrairUidJogador(jogador);

    if (!uid) return null;

    for (const [id, perfil] of Object.entries(db.players || {})) {
        const uidSalvo = String(
            perfil.uid ??
            perfil.accountId ??
            perfil.account_id ??
            ''
        );

        if (uidSalvo && uidSalvo === uid) {
            return id;
        }
    }

    return null;
}

function formatarDuracaoFF(match, dados) {
    const segundos = Number(
        dados.duration ??
        dados.duration_seconds ??
        dados.durationSeconds ??
        dados.data?.duration ??
        0
    );

    if (Number.isFinite(segundos) && segundos > 0) {
        const minutos = Math.floor(segundos / 60);
        const resto = segundos % 60;
        return `${minutos} min ${resto} s`;
    }

    if (match.startedAt) {
        const fim = match.finishedAt
            ? new Date(match.finishedAt).getTime()
            : Date.now();

        const inicio = new Date(match.startedAt).getTime();
        const minutos = Math.max(0, Math.floor((fim - inicio) / 60000));

        return `${minutos} minutos`;
    }

    return 'Não informada';
}

async function publicarResultadoFF(match, dados) {
    const jogadores = extrairJogadoresResultado(dados);
    const vencedor = identificarVencedor(dados, jogadores);

    const grupos = new Map();

    for (const jogador of jogadores) {
        const equipe = String(
            jogador.teamId ??
            jogador.team_id ??
            jogador.team ??
            'sem_equipe'
        );

        if (!grupos.has(equipe)) grupos.set(equipe, []);
        grupos.get(equipe).push(jogador);
    }

    let texto =
        '# PARTIDA FINALIZADA\n\n' +
        `**Partida:** #${match.id}\n` +
        '**Modo:** AP Padrão\n' +
        `**ID da sala:** ${match.roomId}\n` +
        `**Duração:** ${formatarDuracaoFF(match, dados)}\n\n`;

    let mvpEncontrado = false;

    if (grupos.size > 0) {
        for (const [equipeId, membros] of grupos.entries()) {
            const equipeVenceu = vencedor !== null &&
                String(equipeId) === String(vencedor);

            texto += equipeVenceu
                ? '## TIME VENCEDOR\n'
                : '## TIME PERDEDOR\n';

            for (const jogador of membros) {
                const nome = extrairNomeJogador(jogador);
                const uid = extrairUidJogador(jogador) || 'Não informado';
                const kills = extrairKills(jogador);

                const mvp = (
                    valorBooleano(jogador.mvp) ||
                    valorBooleano(jogador.is_mvp) ||
                    valorBooleano(jogador.most_valuable_player)
                ) && equipeVenceu;

                if (mvp) mvpEncontrado = true;

                texto +=
                    `**Jogador:** ${nome}${mvp ? ' [MVP]' : ''}\n` +
                    `**UID:** ${uid}\n` +
                    `**Eliminações:** ${kills}\n\n`;
            }
        }
    } else {
        texto +=
            'A partida foi finalizada pela API, mas os dados individuais dos jogadores não foram retornados.\n';
    }

    if (texto.length > 3900) {
        texto = texto.slice(0, 3850) +
            '\n\n[Informações adicionais omitidas por limite de mensagem.]';
    }

    const canal = await client.channels
        .fetch(match.channelId || CANAL_FREEFIRE_ID)
        .catch(() => null);

    if (canal?.isTextBased()) {
        await canal.send({
            components: [FF.makeContainer(texto)],
            flags: MessageFlags.IsComponentsV2
        });
    }

    // Só atualiza estatísticas quando a API informa claramente
    // os jogadores e suas equipes, e conseguimos associá-los
    // a contas Discord já identificadas.
    if (vencedor !== null && jogadores.length > 0) {
        const db = FF.readDB();

        const mapeados = jogadores.map(jogador => ({
            jogador,
            discordId: mapearDiscordIdPorJogador(jogador, db),
            equipe: String(
                jogador.teamId ??
                jogador.team_id ??
                jogador.team ??
                'sem_equipe'
            )
        }));

        const todosMapeados = mapeados.every(item => item.discordId);

        if (todosMapeados) {
            for (const item of mapeados) {
                const detalhes = {
                    roomId: match.roomId,
                    uid: extrairUidJogador(item.jogador),
                    nickname: extrairNomeJogador(item.jogador),
                    kills: extrairKills(item.jogador)
                };

                if (item.equipe === String(vencedor)) {
                    FF.applyWin(item.discordId, match.id, detalhes);
                } else {
                    FF.applyLoss(item.discordId, match.id, detalhes);
                }
            }
        } else {
            console.warn(
                `[FREE FIRE] Partida #${match.id}: resultado publicado, mas há jogadores sem vínculo de UID/Discord. Estatísticas não foram atribuídas.`
            );
        }
    } else {
        console.warn(
            `[FREE FIRE] Partida #${match.id}: API não informou vencedor/equipes de forma suficiente para atualizar estatísticas.`
        );
    }

    return { texto, mvpEncontrado };
}

// ======================================================
// FREE FIRE - PROCESSAR FINALIZAÇÃO
// ======================================================

async function finalizarPartidaFF(matchId, dados) {
    const id = String(matchId);

    if (partidasFinalizando.has(id)) return;

    partidasFinalizando.add(id);

    try {
        const resultado = await localizarPartidaFF(id);

        if (!resultado) return;

        const { db, match } = resultado;

        if (
            match.status === 'finished' &&
            match.resultPosted
        ) {
            return;
        }

        match.status = 'finished';
        match.finishedAt = new Date().toISOString();
        match.result = dados;

        FF.saveDB(db);

        await publicarResultadoFF(match, dados);

        const dbFinal = FF.readDB();
        const partidaFinal = dbFinal.matches?.[id];

        if (partidaFinal) {
            partidaFinal.resultPosted = true;
            partidaFinal.resultPostedAt = new Date().toISOString();
            FF.saveDB(dbFinal);
        }

        await atualizarPainelFF(id);

        console.log(`[FREE FIRE] Resultado da partida #${id} publicado.`);
    } catch (erro) {
        console.error(
            `[FREE FIRE] Erro ao finalizar partida #${id}:`,
            erro
        );
    } finally {
        partidasFinalizando.delete(id);
    }
}

// ======================================================
// FREE FIRE - MONITORAMENTO
// ======================================================

async function consultarPartidaFF(matchId) {
    const resultado = await localizarPartidaFF(matchId);

    if (!resultado) return;

    const { match } = resultado;

    if (!match.sessionId) {
        console.warn(
            `[FREE FIRE] Partida #${matchId} sem sessionId.`
        );
        return;
    }

    if (!['playing', 'starting'].includes(match.status)) return;

    try {
        const dados = await FF.getNixResult(match.sessionId);
        const estado = identificarEstadoResultado(dados);

        if (
            estado.includes('finalizada') ||
            estado.includes('finished') ||
            estado.includes('completed') ||
            estado.includes('complete')
        ) {
            await finalizarPartidaFF(matchId, dados);
            partidasMonitoradas.delete(String(matchId));
            return;
        }

        if (
            estado.includes('no_match') ||
            estado.includes('no-match') ||
            estado.includes('no match')
        ) {
            const db = FF.readDB();
            const atual = db.matches?.[String(matchId)];

            if (atual && atual.status !== 'no_match') {
                atual.status = 'no_match';
                atual.noMatchAt = new Date().toISOString();
                atual.result = dados;
                FF.saveDB(db);

                await atualizarPainelFF(matchId);

                const canal = await client.channels
                    .fetch(atual.channelId || CANAL_FREEFIRE_ID)
                    .catch(() => null);

                if (canal?.isTextBased()) {
                    await FF.sendContainer(
                        canal,
                        `# PARTIDA #${matchId}\n\n` +
                        'A NixFF informou que não reconheceu uma partida válida.\n' +
                        'Nenhuma vitória ou derrota foi registrada.'
                    );
                }
            }

            partidasMonitoradas.delete(String(matchId));
            return;
        }

        if (
            estado.includes('jogando') ||
            estado.includes('playing') ||
            estado.includes('in_progress') ||
            estado.includes('in-progress')
        ) {
            const db = FF.readDB();
            const atual = db.matches?.[String(matchId)];

            if (atual && atual.status === 'starting') {
                atual.status = 'playing';
                atual.startedAt = atual.startedAt ||
                    new Date().toISOString();

                FF.saveDB(db);
                await atualizarPainelFF(matchId);
            }

            return;
        }

        // Resposta desconhecida: não altera o status e tenta
        // consultar novamente no próximo ciclo.
        console.log(
            `[FREE FIRE] Estado da partida #${matchId}: ${estado || 'não informado'}`
        );
    } catch (erro) {
        console.error(
            `[FREE FIRE] Erro ao consultar partida #${matchId}:`,
            erro.message
        );
    }
}

function iniciarMonitoramentoPartidaFF(matchId) {
    const id = String(matchId);

    if (partidasMonitoradas.has(id)) return;

    partidasMonitoradas.add(id);

    consultarPartidaFF(id).catch(erro => {
        console.error('[FREE FIRE] Erro no primeiro monitoramento:', erro);
    });
}

async function monitorarPartidasFF() {
    const db = FF.readDB();

    for (const [id, match] of Object.entries(db.matches || {})) {
        if (
            ['playing', 'starting'].includes(match.status) &&
            match.sessionId
        ) {
            await consultarPartidaFF(id);
        }
    }
}

function iniciarMonitoramentoGeralFF() {
    if (intervaloMonitoramentoFF) {
        clearInterval(intervaloMonitoramentoFF);
    }

    // Recupera partidas que continuaram ativas após reiniciar o bot.
    monitorarPartidasFF().catch(erro => {
        console.error('[FREE FIRE] Erro ao recuperar partidas:', erro);
    });

    intervaloMonitoramentoFF = setInterval(() => {
        monitorarPartidasFF().catch(erro => {
            console.error('[FREE FIRE] Erro no monitoramento:', erro);
        });
    }, INTERVALO_RESULTADO_FF);
}

// ======================================================
// FREE FIRE - COMANDO GO
// ======================================================

async function processarGOFF(mensagem, matchId = null) {
    if (
        mensagem.author.bot ||
        !mensagem.guild ||
        mensagem.channelId !== CANAL_FREEFIRE_ID
    ) {
        return false;
    }

    const db = FF.readDB();

    let pendentes = Object.values(db.matches || {}).filter(match =>
        match.status === 'waiting' &&
        obterParticipantesFF(match).includes(mensagem.author.id)
    );

    if (matchId) {
        pendentes = pendentes.filter(
            match => String(match.id) === String(matchId)
        );
    }

    if (pendentes.length === 0) {
        await FF.sendContainer(
            mensagem.channel,
            `${mensagem.author}, não encontrei uma partida sua aguardando confirmação.`
        );

        return true;
    }

    if (pendentes.length > 1) {
        await FF.sendContainer(
            mensagem.channel,
            `${mensagem.author}, você tem mais de uma partida aguardando confirmação. Use **GO #ID** para identificar a partida.`
        );

        return true;
    }

    const match = pendentes[0];

    const resultado = await confirmarPartidaFF(
        match.id,
        mensagem.author.id,
        mensagem.channel
    );

    await FF.sendContainer(
        mensagem.channel,
        resultado.mensagem
    );

    return true;
}

// ======================================================
// BOT ONLINE
// ======================================================

client.once('clientReady', async () => {
    console.log(`Bot online: ${client.user.tag}`);

    atualizarAtividade();

    if (intervaloAtividade) {
        clearInterval(intervaloAtividade);
    }

    intervaloAtividade = setInterval(
        atualizarAtividade,
        INTERVALO_ATIVIDADE
    );

    await registrarComandos();

    iniciarMonitoramentoGeralFF();
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
        const comandoSetgame = require('./commands/setgame');

        if (
            comandoSetgame?.handleMessage &&
            await comandoSetgame.handleMessage(mensagem)
        ) {
            return;
        }

        // GO ou GO #ID — confirmação de partida Free Fire.
        if (
            !mensagem.author.bot &&
            mensagem.guild &&
            mensagem.channelId === CANAL_FREEFIRE_ID
        ) {
            const conteudo = mensagem.content.trim();

            if (/^go(?:\s+#?\d+)?$/i.test(conteudo)) {
                const idEncontrado = conteudo.match(/^go\s+#?(\d+)$/i);
                await processarGOFF(
                    mensagem,
                    idEncontrado ? idEncontrado[1] : null
                );
            }

            // Comando de criação por prefixo: z?cs @adversário.
            const criacao = conteudo.match(/^z\?cs\s+<@!?(\d+)>$/i);

            if (criacao) {
                const adversarioId = criacao[1];

                if (adversarioId === mensagem.author.id) {
                    await mensagem.reply('Você não pode escolher a si mesmo como adversário.');
                    return;
                }

                const adversario = await mensagem.guild.members
                    .fetch(adversarioId)
                    .catch(() => null);

                if (!adversario || adversario.user.bot) {
                    await mensagem.reply('Não encontrei um adversário válido no servidor.');
                    return;
                }

                try {
                    const senha = FF.generateRoomPassword();

                    const resposta = await FF.createNixRoom({
                        password: senha,
                        config_type: 'ap_padrao',
                        start_delay_minutes: 5,
                        map_name: 'Bermuda'
                    });

                    if (!resposta?.session_id || resposta.room_id == null) {
                        throw new Error('A NixFF não retornou os dados necessários da sala.');
                    }

                    const banco = FF.readDB();
                    const matchId = String(banco.nextId || 1);
                    banco.nextId = Number(matchId) + 1;

                    const match = {
                        id: matchId,
                        creatorId: mensagem.author.id,
                        captain1Id: mensagem.author.id,
                        captain2Id: adversarioId,
                        adversaryId,
                        map: 'Bermuda',
                        configType: 'ap_padrao',
                        roomId: String(resposta.room_id),
                        password: String(resposta.password || senha),
                        sessionId: resposta.session_id,
                        inviteLink: resposta.invite_link ||
                            resposta.invitation_link ||
                            null,
                        inviteCode: resposta.invite_code ||
                            resposta.code ||
                            null,
                        status: 'waiting',
                        confirmations: [],
                        createdAt: new Date().toISOString(),
                        startedAt: null,
                        finishedAt: null,
                        channelId: mensagem.channelId,
                        messageId: null,
                        result: null,
                        resultPosted: false
                    };

                    banco.matches[matchId] = match;

                    if (!FF.saveDB(banco)) {
                        throw new Error('Não consegui salvar a partida.');
                    }

                    const painel = await mensagem.channel.send({
                        components: [
                            FF.makeContainer(criarTextoPainelFF(match)),
                            ...criarBotoesFF(match)
                        ],
                        flags: MessageFlags.IsComponentsV2
                    });

                    const bancoAtualizado = FF.readDB();

                    if (bancoAtualizado.matches[matchId]) {
                        bancoAtualizado.matches[matchId].messageId = painel.id;
                        FF.saveDB(bancoAtualizado);
                    }

                    await FF.sendLog(
                        mensagem.guild,
                        `# SALA FREE FIRE CRIADA\n\n` +
                        `**Partida:** #${matchId}\n` +
                        `**Criador:** <@${mensagem.author.id}>\n` +
                        `**Adversário:** <@${adversarioId}>\n` +
                        `**ID da sala:** ${match.roomId}\n` +
                        '**Mapa:** Bermuda\n' +
                        '**Configuração:** AP Padrão\n' +
                        '**Status:** Aguardando confirmação'
                    );

                    await mensagem.reply(
                        `Sala criada! Partida **#${matchId}** contra ${adversario}.\n` +
                        `O painel foi publicado abaixo.`
                    );
                } catch (erro) {
                    console.error('[FREE FIRE] Erro no comando z?cs:', erro);

                    await mensagem.reply(
                        `Não consegui criar a sala: ${erro.publicMessage || erro.message}`
                    ).catch(() => null);
                }

                return;
            }
        }

        const comandoPerfil = client.commands.get('perfil');

        if (
            comandoPerfil?.handleMessage &&
            await comandoPerfil.handleMessage(mensagem)
        ) {
            return;
        }

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
        const comandoSetgame = require('./commands/setgame');

        if (
            comandoSetgame?.handleInteraction &&
            await comandoSetgame.handleInteraction(interaction)
        ) {
            return;
        }

        // PERFIL
        const comandoPerfil = client.commands.get('perfil');

        if (
            comandoPerfil?.handleInteraction &&
            await comandoPerfil.handleInteraction(interaction, client)
        ) {
            return;
        }

        // TICKETS
        const comandoTicket = client.commands.get('ticket');

        if (
            comandoTicket?.handleInteraction &&
            await comandoTicket.handleInteraction(interaction, client)
        ) {
            return;
        }

        // COMANDOS SLASH
        if (interaction.isChatInputCommand()) {
            const comando = client.commands.get(interaction.commandName);

            if (!comando) {
                return responderErro(interaction, 'Comando não encontrado.');
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
                    'Erro ao executar o comando.'
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
                        'O sistema de cargos não está carregado.'
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
                            'Entre em uma chamada primeiro.'
                        );
                    }

                    try {
                        await interaction.member.voice.setMute(false);

                        return responderSucesso(
                            interaction,
                            'Seu mute de servidor foi removido.'
                        );
                    } catch (erro) {
                        console.error('Erro ao desmutar:', erro);

                        return responderErro(
                            interaction,
