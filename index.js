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
const CANAL_BOAS_VINDAS_ID = '1570657702051319908';

const BANNER_PAINEL_CALL = 'https://media.discordapp.net/attachments/1559056011375943784/1563610071886331994/file_0000000060b8820e9ce7fd5014b9b33a.png?ex=6ae03b1b&is=6adee99b&hm=89cc9ed84a2ef5f71ddaccaa52f5c6caff67303cb83988cc308da4f0907a89d5&=&format=webp&quality=lossless';

const FUSO_HORARIO = 'America/Sao_Paulo';
const TEMPO_EXCLUSAO_CALL_VAZIA = 10000;
const TEMPO_EXCLUSAO_BOAS_VINDAS = 17000;
const INTERVALO_ATIVIDADE = 10 * 60 * 60 * 1000;
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
});

// ======================================================
// SISTEMA DE BOAS-VINDAS AUTOMÁTICAS
// ======================================================

client.on('guildMemberAdd', async membro => {
    try {
        console.log(
            `[BOAS-VINDAS] Novo membro detectado: ${membro.user.tag}`
        );

        // Não enviar boas-vindas para bots.
        if (membro.user.bot) return;

        const canal = await membro.guild.channels
            .fetch(CANAL_BOAS_VINDAS_ID)
            .catch(() => null);

        if (!canal || !canal.isTextBased() || !canal.send) {
            console.error(
                '[BOAS-VINDAS] Canal não encontrado ou não é um canal de texto.'
            );
            return;
        }

        // Cria o container de boas-vindas com a cor padrão do Discord.
        const containerBoasVindas = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# <:zodiaco:1559716108292849684> Seja bem-vindo(a), ${membro}!\n` +
                    `Que bom ter você na **${membro.guild.name}**!\n` +
                    `Fique à vontade e aproveite nosso servidor! 🎉`
                )
            );

        // Envia a mensagem no formato Components V2.
        const mensagemBoasVindas = await canal.send({
            components: [containerBoasVindas],
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: {
                users: [membro.id]
            }
        });

        console.log(
            `[BOAS-VINDAS] Mensagem enviada para ${membro.user.tag}.`
        );

        // Apaga somente a mensagem de boas-vindas após 17 segundos.
        setTimeout(async () => {
            try {
                await mensagemBoasVindas.delete();

                console.log(
                    `[BOAS-VINDAS] Mensagem de ${membro.user.tag} apagada após 17 segundos.`
                );
            } catch (erro) {
                console.error(
                    '[BOAS-VINDAS] Não consegui apagar a mensagem:',
                    erro.message
                );
            }
        }, TEMPO_EXCLUSAO_BOAS_VINDAS);

    } catch (erro) {
        console.error(
            '[BOAS-VINDAS] Erro ao enviar mensagem:',
            erro
        );
    }
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
                            'Não consegui retirar seu mute.'
                        );
                    }
                }

                if (!canal) {
                    return responderErro(
                        interaction,
                        'Entre em uma chamada antes de usar esta ferramenta.'
                    );
                }

                if (
                    opcao === 'privar_call' ||
                    opcao === 'desprivar_call'
                ) {
                    if (!podeAlterarPrivacidade(interaction, canal)) {
                        return responderErro(
                            interaction,
                            'Você precisa estar na chamada que deseja controlar.'
                        );
                    }

                    try {
                        if (opcao === 'privar_call') {
                            await privarCall(canal);

                            return responderSucesso(
                                interaction,
                                'A chamada foi privatizada.'
                            );
                        }

                        await liberarCall(canal);

                        return responderSucesso(
                            interaction,
                            'A chamada voltou a ser pública.'
                        );
                    } catch (erro) {
                        console.error('Erro ao alterar privacidade:', erro);

                        return responderErro(
                            interaction,
                            'Não consegui alterar a privacidade.'
                        );
                    }
                }

                if (
                    !ehCallTemporaria(canal) ||
                    !podeControlarCall(interaction, canal)
                ) {
                    return responderErro(
                        interaction,
                        'Você precisa estar dentro de uma call temporária.'
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
                        content: 'Selecione quem deseja mover para sua call.',
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
                            'Este recurso é exclusivo para Boosters.'
                        );
                    }

                    const seletor = new UserSelectMenuBuilder()
                        .setCustomId('call_selecionar_mutar')
                        .setPlaceholder('Escolha quem deseja mutar')
                        .setMinValues(1)
                        .setMaxValues(1);

                    return interaction.reply({
                        content: 'Selecione quem deseja mutar.',
                        components: [
                            new ActionRowBuilder().addComponents(seletor)
                        ],
                        flags: MessageFlags.Ephemeral
                    });
                }

                return responderErro(
                    interaction,
                    'Esta ferramenta não é reconhecida.'
                );
            }

            return;
        }

        // BOTÕES
        if (interaction.isButton()) {
            const id = interaction.customId;

            // ==========================================
            // BOTÕES CALLS
            // ==========================================

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
                        'Entre em uma call temporária para usar esse controle.'
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
                        'Entre em uma call temporária para usar esse controle.'
                    );
                }

                const seletor = new UserSelectMenuBuilder()
                    .setCustomId('call_selecionar_membro')
                    .setPlaceholder('Escolha quem deseja mover')
                    .setMinValues(1)
                    .setMaxValues(1);

                return interaction.reply({
                    content: 'Selecione quem deseja mover para sua call.',
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
                        'Este recurso é exclusivo para Boosters.'
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
                        'Entre em uma call temporária para usar esse controle.'
                    );
                }

                const seletor = new UserSelectMenuBuilder()
                    .setCustomId('call_selecionar_mutar')
                    .setPlaceholder('Escolha quem deseja mutar')
                    .setMinValues(1)
                    .setMaxValues(1);

                return interaction.reply({
                    content: 'Selecione quem deseja mutar.',
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
                        'Entre em uma call primeiro.'
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
                        'Não consegui retirar seu mute.'
                    );
                }
            }

            if (id === 'call_privada' || id === 'call_publica') {
                const canal = obterCall(interaction);

                if (!canal) {
                    return responderErro(
                        interaction,
                        'Entre em uma chamada primeiro.'
                    );
                }

                if (!podeAlterarPrivacidade(interaction, canal)) {
                    return responderErro(
                        interaction,
                        'Você precisa estar na chamada que deseja controlar.'
                    );
                }

                try {
                    if (id === 'call_privada') {
                        await privarCall(canal);

                        return responderSucesso(
                            interaction,
                            'Sua call foi privatizada.'
                        );
                    }

                    await liberarCall(canal);

                    return responderSucesso(
                        interaction,
                        'Sua call voltou a ser pública.'
                    );
                } catch (erro) {
                    console.error('Erro ao alterar privacidade:', erro);

                    return responderErro(
                        interaction,
                        'Não consegui alterar a privacidade.'
                    );
                }
            }

            // ==========================================
            // PUBLICAÇÕES
            // ==========================================

            if (id.startsWith('pub_like_')) {
                const publicacaoId = id.slice('pub_like_'.length);
                const publicacoes = obterPublicacoes();
                const publicacao = publicacoes[publicacaoId];

                if (!publicacao) {
                    return responderErro(
                        interaction,
                        'Publicação não encontrada.'
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
                } else {
                    publicacao.curtidas.push(interaction.user.id);
                }

                salvarPublicacoes(publicacoes);
                atualizarVerificacoes(publicacoes);

                const verificado = usuarioVerificado(publicacao.autorId);

                for (const item of Object.values(publicacoes)) {
                    if (item.autorId === publicacao.autorId) {
                        item.verificado = verificado;
                    }
                }

                salvarPublicacoes(publicacoes);

                await interaction.deferReply({
                    flags: MessageFlags.Ephemeral
                });

                await atualizarCardPublicacao(publicacaoId);

                return interaction.editReply({
                    content: indice !== -1
                        ? 'Você removeu sua curtida.'
                        : 'Você curtiu a publicação!'
                });
            }

            if (id.startsWith('pub_comentar_')) {
                const publicacaoId = id.slice('pub_comentar_'.length);
                const publicacao = obterPublicacoes()[publicacaoId];

                if (!publicacao) {
                    return responderErro(
                        interaction,
                        'Publicação não encontrada.'
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

            if (id.startsWith('pub_republicar_')) {
                const publicacaoId = id.slice('pub_republicar_'.length);
                const publicacoes = obterPublicacoes();
                const publicacao = publicacoes[publicacaoId];

                if (!publicacao) {
                    return responderErro(
                        interaction,
                        'Publicação não encontrada.'
                    );
                }

                if (!Array.isArray(publicacao.republicacoes)) {
                    publicacao.republicacoes = [];
                }

                const usuarioId = interaction.user.id;
                const indice = publicacao.republicacoes.indexOf(usuarioId);

                await interaction.deferReply({
                    flags: MessageFlags.Ephemeral
                });

                if (indice !== -1) {
                    publicacao.republicacoes.splice(indice, 1);
                    salvarPublicacoes(publicacoes);
                    await atualizarCardPublicacao(publicacaoId);

                    return interaction.editReply({
                        content: 'Você desfez sua republicação.'
                    });
                }

                publicacao.republicacoes.push(usuarioId);
                salvarPublicacoes(publicacoes);
                await atualizarCardPublicacao(publicacaoId);

                const link = publicacao.mensagemPublicadaId
                    ? `https://discord.com/channels/${publicacao.guildId}/${publicacao.canalId}/${publicacao.mensagemPublicadaId}`
                    : 'Link indisponível.';

                return interaction.editReply({
                    content:
                        `**${interaction.user.username} republicou uma publicação.**\n` +
                        `Publicação original: ${link}`
                });
            }

            if (id.startsWith('pub_detalhes_')) {
                const publicacaoId = id.slice('pub_detalhes_'.length);
                const publicacao = obterPublicacoes()[publicacaoId];

                if (!publicacao) {
                    return responderErro(
                        interaction,
                        'Publicação não encontrada.'
                    );
                }

                const curtidas = publicacao.curtidas || [];
                const comentarios = publicacao.comentarios || [];
                const republicacoes = publicacao.republicacoes || [];

                const listaCurtidas = curtidas.length
                    ? curtidas.slice(0, 15)
                        .map(usuarioId => `<@${usuarioId}>`)
                        .join(', ')
                    : 'Ninguém curtiu ainda.';

                const listaRepublicacoes = republicacoes.length
                    ? republicacoes.slice(0, 15)
                        .map(usuarioId => `<@${usuarioId}>`)
                        .join(', ')
                    : 'Ninguém republicou ainda.';

                const listaComentarios = comentarios.length
                    ? comentarios.slice(-10).map(comentario =>
                        `**${comentario.autorNome || 'Usuário'}:** ${comentario.texto}`
                    ).join('\n\n')
                    : 'Nenhum comentário ainda.';

                const painelDetalhes = new ContainerBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            '# Informações da publicação\n\n' +
                            `**Autor:** <@${publicacao.autorId}>\n` +
                            `**Curtidas:** ${curtidas.length}\n` +
                            `**Comentários:** ${comentarios.length}\n` +
                            `**Republicações:** ${republicacoes.length}\n\n` +
                            '## Pessoas que curtiram\n' +
                            `${listaCurtidas}\n\n` +
                            '## Pessoas que republicaram\n' +
                            `${listaRepublicacoes}\n\n` +
                            '## Comentários recentes\n' +
                            `${listaComentarios.slice(0, 2500)}`
                        )
                    );

                return interaction.reply({
                    components: [painelDetalhes],
                    flags: MessageFlags.Ephemeral |
                        MessageFlags.IsComponentsV2
                });
            }

            return;
        }

        // ==================================================
        // MENUS DE USUÁRIOS
        // ==================================================

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
                    'Entre em uma call temporária para usar esse controle.'
                );
            }

            const alvo = await interaction.guild.members
                .fetch(interaction.values[0])
                .catch(() => null);

            if (!alvo) {
                return responderErro(
                    interaction,
                    'Não encontrei esse membro.'
                );
            }

            if (id === 'call_selecionar_mutar') {
                if (!ehBooster(interaction.member)) {
                    return responderErro(
                        interaction,
                        'Opção exclusiva para Boosters.'
                    );
                }

                if (alvo.id === interaction.user.id) {
                    return responderErro(
                        interaction,
                        'Selecione outro membro.'
                    );
                }

                if (alvo.voice.channelId !== canal.id) {
                    return responderErro(
                        interaction,
                        'O membro precisa estar na sua call.'
                    );
                }

                try {
                    await alvo.voice.setMute(true);

                    return interaction.update({
                        content: `${alvo} foi mutado no servidor.`,
                        components: []
                    });
                } catch (erro) {
                    console.error('Erro ao mutar membro:', erro);

                    return responderErro(
                        interaction,
                        'Não consegui mutar esse membro.'
                    );
                }
            }

            if (!alvo.voice.channel) {
                return responderErro(
                    interaction,
                    'Esse membro não está em uma call.'
                );
            }

            if (alvo.id === interaction.user.id) {
                return responderErro(
                    interaction,
                    'Selecione outro membro.'
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
                        `Membro selecionado: **${alvo.user.username}**\n` +
                        'Escolha a call de destino:',
                    components: [
                        new ActionRowBuilder().addComponents(seletor)
                    ]
                });
            }

            const botMembro = await interaction.guild.members.fetchMe();

            if (!botMembro.permissions.has(PermissionFlagsBits.MoveMembers)) {
                return responderErro(
                    interaction,
                    'Preciso da permissão Mover membros.'
                );
            }

            try {
                await alvo.voice.setChannel(canal);

                return interaction.update({
                    content: `${alvo} foi movido para ${canal}.`,
                    components: []
                });
            } catch (erro) {
                console.error('Erro ao mover membro:', erro);

                return responderErro(
                    interaction,
                    'Não consegui mover esse membro.'
                );
            }
        }

        // ==================================================
        // MENU DE CANAL DE DESTINO
        // ==================================================

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
                    'Entre em uma call temporária para usar esse controle.'
                );
            }

            const alvoId = interaction.customId.split(':')[1];

            const alvo = await interaction.guild.members
                .fetch(alvoId)
                .catch(() => null);

            if (!alvo || !alvo.voice.channel) {
                return responderErro(
                    interaction,
                    'Esse membro não está mais em uma call.'
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
                    'Canal de destino inválido.'
                );
            }

            const botMembro = await interaction.guild.members.fetchMe();

            if (!botMembro.permissions.has(PermissionFlagsBits.MoveMembers)) {
                return responderErro(
                    interaction,
                    'Preciso da permissão Mover membros.'
                );
            }

            try {
                await alvo.voice.setChannel(destino);

                return interaction.update({
                    content: `${alvo} foi movido para ${destino}.`,
                    components: []
                });
            } catch (erro) {
                console.error('Erro ao mover membro:', erro);

                return responderErro(
                    interaction,
                    'Não consegui mover o membro para essa call.'
                );
            }
        }

        // ==================================================
        // MODAIS
        // ==================================================

        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'modal_limite_call') {
                const canal = obterCall(interaction);

                if (
                    !canal ||
                    !ehCallTemporaria(canal) ||
                    !podeControlarCall(interaction, canal)
                ) {
                    return responderErro(
                        interaction,
                        'Entre em uma call temporária para usar esse controle.'
                    );
                }

                const valor = interaction.fields
                    .getTextInputValue('limite')
                    .trim();

                if (!/^\d{1,2}$/.test(valor) || Number(valor) > 99) {
                    return responderErro(
                        interaction,
                        'Digite um número de 0 a 99.'
                    );
                }

                try {
                    await canal.setUserLimit(Number(valor));

                    return responderSucesso(
                        interaction,
                        Number(valor) === 0
                            ? 'Limite removido.'
                            : `Limite definido para ${valor} pessoas.`
                    );
                } catch (erro) {
                    console.error('Erro ao definir limite:', erro);

                    return responderErro(
                        interaction,
                        'Não consegui alterar o limite da call.'
                    );
                }
            }

            if (interaction.customId === 'modal_mutar_membro') {
                const membro = await interaction.guild.members
                    .fetch(interaction.user.id);

                if (!ehBooster(membro)) {
                    return responderErro(
                        interaction,
                        'Opção exclusiva para Boosters.'
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
                        'Não encontrei esse membro em uma call.'
                    );
                }

                try {
                    await alvo.voice.setMute(true);

                    return responderSucesso(
                        interaction,
                        'Membro mutado com sucesso.'
                    );
                } catch (erro) {
                    console.error('Erro ao mutar membro:', erro);

                    return responderErro(
                        interaction,
                        'Não consegui mutar esse membro.'
                    );
                }
            }

            if (interaction.customId.startsWith('modal_comentario_')) {
                const publicacaoId = interaction.customId
                    .slice('modal_comentario_'.length);

                const publicacoes = obterPublicacoes();
                const publicacao = publicacoes[publicacaoId];

                if (!publicacao) {
                    return responderErro(
                        interaction,
                        'Publicação não encontrada.'
                    );
                }

                const comentario = interaction.fields
                    .getTextInputValue('comentario')
                    .trim();

                if (!comentario) {
                    return responderErro(
                        interaction,
                        'Escreva um comentário.'
                    );
                }

                if (!Array.isArray(publicacao.comentarios)) {
                    publicacao.comentarios = [];
                }

                publicacao.comentarios.push({
                    autorId: interaction.user.id,
                    autorNome: interaction.member?.displayName ||
                        interaction.user.globalName ||
                        interaction.user.username,
                    texto: comentario.slice(0, 1000),
                    data: new Date().toISOString()
                });

                salvarPublicacoes(publicacoes);

                await interaction.deferReply({
                    flags: MessageFlags.Ephemeral
                });

                await atualizarCardPublicacao(publicacaoId);

                return interaction.editReply({
                    content: 'Seu comentário foi registrado!'
                });
            }

            return;
        }
    } catch (erro) {
        console.error('Erro geral em interactionCreate:', erro);

        await responderErro(
            interaction,
            'Ocorreu um erro ao processar essa interação.'
        );
    }
});

// ======================================================
// ERROS
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
        'DISCORD_TOKEN não foi encontrado nas variáveis de ambiente.'
    );
} else {
    client.login(TOKEN).catch(erro => {
        console.error('Não foi possível conectar o bot:', erro);
    });
                         }
