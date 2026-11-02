const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    AttachmentBuilder,
    MessageFlags
} = require('discord.js');

const { createCanvas, loadImage } = require('@napi-rs/canvas');

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// ==========================================
// CONFIGURAÇÕES
// ==========================================

const DATA_DIR = path.join(__dirname, '..', 'data');
const BANNERS_DIR = path.join(DATA_DIR, 'banners');
const MODELOS_DIR = path.join(DATA_DIR, 'modelos');

const TEMPLATE = path.join(
    MODELOS_DIR,
    'perfil-base.png'
);

const FILE = path.join(DATA_DIR, 'perfis.json');

const MAX_BANNER_SIZE = 8 * 1024 * 1024;
const TEMPO_ENVIO_BANNER = 2 * 60 * 1000;

const CARGO_NAMORADO = '1566433563887403038';
const CARGO_SOLTEIRO = '1566433517179510904';

const CARGO_VIP = null;

// ==========================================
// DIMENSÕES EXATAS DO MODELO
// ==========================================

const LARGURA = 1536;
const ALTURA = 1195;

// Área do banner
const BANNER = {
    x: 0,
    y: 0,
    largura: 1536,
    altura: 558
};

// Área do avatar
const AVATAR = {
    x: 1235,
    y: 480,
    raio: 238
};

// Área cinza
const PAINEL = {
    x: 40,
    y: 645,
    largura: 794,
    altura: 510
};

// Nome
const NOME = {
    x: 998,
    y: 780,
    largura: 460,
    altura: 74
};

// Cartões
const CARTOES = {
    largura: 370,
    altura: 110,
    x1: 55,
    x2: 445,
    y1: 690,
    y2: 840,
    y3: 990
};

// ==========================================
// CORES
// ==========================================

const CORES = {
    branco: '#FFFFFF',
    cinza: '#E7E7E7',
    roxo: '#BA35D2',
    preto: '#171717',
    cinzaTexto: '#777777'
};

// ==========================================
// TEMAS
// ==========================================

const TEMAS = {
    branco: {
        nome: 'Branco',
        fundo: '#FFFFFF',
        card: '#E7E7E7',
        texto: '#171717',
        secundario: '#777777',
        borda: '#DADADA'
    },

    preto: {
        nome: 'Preto',
        fundo: '#111114',
        card: '#29292F',
        texto: '#FFFFFF',
        secundario: '#B8B8C2',
        borda: '#393941'
    },

    roxo: {
        nome: 'Roxo',
        fundo: '#FFFFFF',
        card: '#E8DAFA',
        texto: '#241331',
        secundario: '#674B7D',
        borda: '#D5B9F2'
    },

    azul: {
        nome: 'Azul',
        fundo: '#FFFFFF',
        card: '#DCECFD',
        texto: '#142B43',
        secundario: '#54718F',
        borda: '#C0DCFA'
    },

    rosa: {
        nome: 'Rosa',
        fundo: '#FFFFFF',
        card: '#FFE2ED',
        texto: '#482235',
        secundario: '#946078',
        borda: '#F4C3D8'
    },

    vermelho: {
        nome: 'Vermelho',
        fundo: '#FFFFFF',
        card: '#FFE1E1',
        texto: '#421C20',
        secundario: '#936064',
        borda: '#F1C0C2'
    }
};

// ==========================================
// PASTAS
// ==========================================

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(BANNERS_DIR, { recursive: true });
fs.mkdirSync(MODELOS_DIR, { recursive: true });

if (!fs.existsSync(FILE)) {
    fs.writeFileSync(FILE, '{}', 'utf8');
}

// ==========================================
// ESTADOS TEMPORÁRIOS
// ==========================================

const enviosPendentes = new Map();
const ajustesPendentes = new Map();

// ==========================================
// BANCO DE DADOS
// ==========================================

function lerPerfis() {
    try {
        return JSON.parse(
            fs.readFileSync(FILE, 'utf8')
        );
    } catch (erro) {
        console.error('[PERFIL] Erro ao ler perfis:', erro);
        return {};
    }
}

function salvarPerfis(data) {
    fs.writeFileSync(
        FILE,
        JSON.stringify(data, null, 2),
        'utf8'
    );
}

function obterPerfil(id) {
    const perfis = lerPerfis();

    return {
        nivel: 1,
        money: 0,
        xp: 0,
        xpNecessario: 200,
        rank: '',
        vip: '',
        reputacao: 0,
        badges: [],
        parceiro: '',
        banner: '',
        descricao: '',
        tema: 'branco',
        crop: {
            x: 0,
            y: 0,
            zoom: 1
        },
        ...(perfis[id] || {})
    };
}

function salvarPerfil(id, perfil) {
    const perfis = lerPerfis();

    perfis[id] = perfil;

    salvarPerfis(perfis);
}

// ==========================================
// UTILITÁRIOS
// ==========================================

function arredondar(ctx, x, y, largura, altura, raio) {
    ctx.beginPath();

    ctx.roundRect(
        x,
        y,
        largura,
        altura,
        raio
    );

    ctx.closePath();
}

function desenharTexto(
    ctx,
    texto,
    x,
    y,
    tamanho,
    cor,
    peso = 'normal',
    alinhamento = 'left'
) {
    ctx.fillStyle = cor;
    ctx.font = `${peso} ${tamanho}px Arial`;
    ctx.textAlign = alinhamento;
    ctx.textBaseline = 'alphabetic';

    ctx.fillText(
        String(texto ?? ''),
        x,
        y
    );

    ctx.textAlign = 'left';
}

function desenharEmoji(ctx, emoji, x, y, tamanho) {
    ctx.save();

    ctx.font = `${tamanho}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillText(emoji, x, y);

    ctx.restore();
}

// ==========================================
// CARREGAR MODELO DO CANVA
// ==========================================

async function carregarModelo() {
    if (!fs.existsSync(TEMPLATE)) {
        throw new Error(
            'Imagem-base não encontrada. Coloque perfil-base.png em data/modelos/.'
        );
    }

    return loadImage(
        fs.readFileSync(TEMPLATE)
    );
}

// ==========================================
// BAIXAR BANNER
// ==========================================

async function baixarESalvarBanner(anexo) {
    if (!anexo?.url) {
        throw new Error('Nenhuma imagem foi encontrada.');
    }

    const resposta = await fetch(anexo.url, {
        signal: AbortSignal.timeout(20000)
    });

    if (!resposta.ok) {
        throw new Error(
            `Não foi possível baixar a imagem: HTTP ${resposta.status}`
        );
    }

    const tipoResposta = (
        resposta.headers.get('content-type') || ''
    ).split(';')[0].trim().toLowerCase();

    const tipoAnexo = (
        anexo.contentType || ''
    ).split(';')[0].trim().toLowerCase();

    const tipo = tipoResposta.startsWith('image/')
        ? tipoResposta
        : tipoAnexo;

    const extensoes = {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/webp': '.webp',
        'image/gif': '.gif'
    };

    const extensao = extensoes[tipo];

    if (!extensao) {
        throw new Error(
            'Formato inválido. Envie PNG, JPG, WEBP ou GIF.'
        );
    }

    const tamanhoInformado = Number(
        resposta.headers.get('content-length') || 0
    );

    if (tamanhoInformado > MAX_BANNER_SIZE) {
        throw new Error('O banner precisa ter no máximo 8 MB.');
    }

    const buffer = Buffer.from(
        await resposta.arrayBuffer()
    );

    if (
        !buffer.length ||
        buffer.length > MAX_BANNER_SIZE
    ) {
        throw new Error(
            'A imagem está vazia ou ultrapassa 8 MB.'
        );
    }

    await loadImage(buffer);

    const nomeArquivo = `${crypto.randomUUID()}${extensao}`;

    fs.writeFileSync(
        path.join(BANNERS_DIR, nomeArquivo),
        buffer
    );

    return nomeArquivo;
}

// ==========================================
// CARREGAR BANNER
// ==========================================

async function carregarBanner(nomeArquivo) {
    if (!nomeArquivo) return null;

    const nomeSeguro = path.basename(nomeArquivo);

    if (nomeSeguro !== nomeArquivo) {
        throw new Error('Nome de arquivo inválido.');
    }

    const caminho = path.join(
        BANNERS_DIR,
        nomeSeguro
    );

    if (!fs.existsSync(caminho)) {
        throw new Error('Banner não encontrado.');
    }

    return loadImage(
        fs.readFileSync(caminho)
    );
}

// ==========================================
// DESENHAR BANNER SOBRE O MODELO
// ==========================================

function desenharBanner(ctx, imagem, crop = {}) {
    const zoom = Math.max(
        1,
        Math.min(3, Number(crop.zoom) || 1)
    );

    const proporcao = Math.max(
        BANNER.largura / imagem.width,
        BANNER.altura / imagem.height
    );

    const larguraBase = BANNER.largura / proporcao;
    const alturaBase = BANNER.altura / proporcao;

    const larguraFonte = larguraBase / zoom;
    const alturaFonte = alturaBase / zoom;

    const maxX = imagem.width - larguraFonte;
    const maxY = imagem.height - alturaFonte;

    const centroX =
        imagem.width / 2 +
        (Number(crop.x) || 0) * imagem.width;

    const centroY =
        imagem.height / 2 +
        (Number(crop.y) || 0) * imagem.height;

    const sx = Math.max(
        0,
        Math.min(maxX, centroX - larguraFonte / 2)
    );

    const sy = Math.max(
        0,
        Math.min(maxY, centroY - alturaFonte / 2)
    );

    ctx.save();

    ctx.beginPath();

    ctx.moveTo(0, 0);
    ctx.lineTo(LARGURA, 0);
    ctx.lineTo(LARGURA, BANNER.altura - 42);

    ctx.quadraticCurveTo(
        LARGURA,
        BANNER.altura,
        LARGURA - 42,
        BANNER.altura
    );

    ctx.lineTo(42, BANNER.altura);

    ctx.quadraticCurveTo(
        0,
        BANNER.altura,
        0,
        BANNER.altura - 42
    );

    ctx.closePath();
    ctx.clip();

    ctx.drawImage(
        imagem,
        sx,
        sy,
        larguraFonte,
        alturaFonte,
        0,
        0,
        BANNER.largura,
        BANNER.altura
    );

    ctx.restore();
}

// ==========================================
// AVATAR DO DISCORD
// ==========================================

async function desenharAvatar(ctx, user) {
    const avatar = await loadImage(
        user.displayAvatarURL({
            extension: 'png',
            size: 512
        })
    );

    ctx.save();

    ctx.beginPath();

    ctx.arc(
        AVATAR.x,
        AVATAR.y,
        AVATAR.raio,
        0,
        Math.PI * 2
    );

    ctx.clip();

    ctx.drawImage(
        avatar,
        AVATAR.x - AVATAR.raio,
        AVATAR.y - AVATAR.raio,
        AVATAR.raio * 2,
        AVATAR.raio * 2
    );

    ctx.restore();
}

// ==========================================
// NOME DE EXIBIÇÃO
// ==========================================

function desenharNome(ctx, user, tema) {
    ctx.fillStyle = tema.card;

    arredondar(
        ctx,
        NOME.x,
        NOME.y,
        NOME.largura,
        NOME.altura,
        25
    );

    ctx.fill();

    const nome = user.globalName || user.username;

    ctx.save();

    ctx.font = 'bold 48px Arial';

    let tamanho = 48;

    while (
        ctx.measureText(nome).width >
        NOME.largura - 35 &&
        tamanho > 22
    ) {
        tamanho -= 2;
        ctx.font = `bold ${tamanho}px Arial`;
    }

    ctx.restore();

    desenharTexto(
        ctx,
        nome,
        NOME.x + NOME.largura / 2,
        NOME.y + 52,
        tamanho,
        tema.texto,
        'bold',
        'center'
    );
}

// ==========================================
// DESCRIÇÃO
// ==========================================

function desenharDescricao(ctx, perfil, tema) {
    const descricao = perfil.descricao || 'Sem descrição...';

    ctx.save();

    ctx.font = 'bold 34px Arial';

    let tamanho = 34;

    while (
        ctx.measureText(descricao).width > 770 &&
        tamanho > 18
    ) {
        tamanho -= 2;
        ctx.font = `bold ${tamanho}px Arial`;
    }

    ctx.restore();

    desenharTexto(
        ctx,
        descricao,
        56,
        610,
        tamanho,
        tema.texto,
        'bold'
    );

    ctx.beginPath();
    ctx.moveTo(55, 625);
    ctx.lineTo(830, 625);

    ctx.strokeStyle = tema.borda;
    ctx.lineWidth = 2;
    ctx.stroke();
}

// ==========================================
// ÍCONES
// ==========================================

function desenharIcone(ctx, tipo, x, y) {
    ctx.save();

    ctx.fillStyle = CORES.roxo;

    arredondar(
        ctx,
        x,
        y,
        88,
        88,
        [25, 0, 0, 25]
    );

    ctx.fill();

    const icones = {
        coins: '🪙',
        nivel: '⭐',
        badges: '🏅',
        reps: '👍',
        casado: '🕊️'
    };

    desenharEmoji(
        ctx,
        icones[tipo] || '✨',
        x + 44,
        y + 44,
        53
    );

    if (tipo === 'reps') {
        desenharEmoji(
            ctx,
            '⭐',
            x + 17,
            y + 17,
            20
        );
    }

    if (tipo === 'casado') {
        desenharEmoji(
            ctx,
            '💗',
            x + 20,
            y + 18,
            19
        );
    }

    ctx.restore();
}

// ==========================================
// CARTÃO INDIVIDUAL
// ==========================================

function desenharCartao(
    ctx,
    x,
    y,
    titulo,
    valor,
    tipo,
    tema
) {
    const largura = CARTOES.largura;
    const altura = CARTOES.altura;

    // FUNDO BRANCO
    ctx.fillStyle = '#FFFFFF';

    arredondar(
        ctx,
        x,
        y,
        largura,
        altura,
        55
    );

    ctx.fill();

    // ÍCONE ROXO
    desenharIcone(
        ctx,
        tipo,
        x,
        y + 11
    );

    // TEXTO
    const textoX = x + 125;

    desenharTexto(
        ctx,
        titulo,
        textoX,
        y + 52,
        31,
        '#171717',
        'bold'
    );

    desenharTexto(
        ctx,
        valor,
        textoX,
        y + 86,
        25,
        '#171717',
        'bold'
    );
}

// ==========================================
// PAINEL DE INFORMAÇÕES
// ==========================================

function desenharPainel(ctx, perfil, member, tema) {
    // O FUNDO CINZA VEM DA IMAGEM-BASE.
    // NÃO DESENHAMOS OUTRO PAINEL POR CIMA.

    const nivel = Number(perfil.nivel) || 1;
    const money = Number(perfil.money) || 0;
    const xp = Number(perfil.xp) || 0;
    const xpNecessario = Number(perfil.xpNecessario) || 200;
    const reputacao = Number(perfil.reputacao) || 0;

    const badges = Array.isArray(perfil.badges)
        ? perfil.badges
        : [];

    const estadoCivil = obterEstadoCivil(member);

    const parceiro = perfil.parceiro || 'Não informado';

    // PRIMEIRA LINHA
    desenharCartao(
        ctx,
        CARTOES.x1,
        CARTOES.y1,
        money.toLocaleString('pt-BR'),
        'Coins',
        'coins',
        tema
    );

    desenharCartao(
        ctx,
        CARTOES.x2,
        CARTOES.y1,
        `Nível: ${nivel}`,
        `${xp}/${xpNecessario}`,
        'nivel',
        tema
    );

    // SEGUNDA LINHA
    desenharCartao(
        ctx,
        CARTOES.x1,
        CARTOES.y2,
        'Badges',
        String(badges.length),
        'badges',
        tema
    );

    desenharCartao(
        ctx,
        CARTOES.x2,
        CARTOES.y2,
        'Reps',
        String(reputacao),
        'reps',
        tema
    );

    // TERCEIRA LINHA
    desenharCartao(
        ctx,
        CARTOES.x1,
        CARTOES.y3,
        estadoCivil === 'Namorado'
            ? 'Casado(a)'
            : estadoCivil,
        parceiro,
        'casado',
        tema
    );
}

// ==========================================
// GERAR PERFIL
// ==========================================

async function gerarImagem(user, perfil, member = null) {
    const canvas = createCanvas(
        LARGURA,
        ALTURA
    );

    const ctx = canvas.getContext('2d');

    const tema = TEMAS[perfil.tema] || TEMAS.branco;

    // CARREGAR MODELO ORIGINAL
    const modelo = await carregarModelo();

    // PRESERVAR TAMANHO DO MODELO
    ctx.drawImage(
        modelo,
        0,
        0,
        LARGURA,
        ALTURA
    );

    // SUBSTITUIR BANNER
    if (perfil.banner) {
        try {
            const banner = await carregarBanner(
                perfil.banner
            );

            desenharBanner(
                ctx,
                banner,
                perfil.crop
            );
        } catch (erro) {
            console.error(
                '[PERFIL] Erro ao carregar banner:',
                erro
            );
        }
    }

    // SUBSTITUIR FOTO DO CÍRCULO
    await desenharAvatar(
        ctx,
        user
    );

    // DESCRIÇÃO
    desenharDescricao(
        ctx,
        perfil,
        tema
    );

    // INFORMAÇÕES
    desenharPainel(
        ctx,
        perfil,
        member,
        tema
    );

    // NOME
    desenharNome(
        ctx,
        user,
        tema
    );

    return canvas.toBuffer('image/png');
}

// ==========================================
// BOTÕES DE ENQUADRAMENTO
// ==========================================

function criarBotoesCrop(usuarioId) {
    const prefixo = `perfil_crop_${usuarioId}_`;

    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`${prefixo}cima`)
                .setLabel('↑')
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId(`${prefixo}esquerda`)
                .setLabel('←')
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId(`${prefixo}baixo`)
                .setLabel('↓')
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId(`${prefixo}direita`)
                .setLabel('→')
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId(`${prefixo}menos`)
                .setLabel('−')
                .setStyle(ButtonStyle.Secondary)
        ),

        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`${prefixo}mais`)
                .setLabel('+')
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId(`${prefixo}resetar`)
                .setLabel('Resetar')
                .setStyle(ButtonStyle.Secondary)
        ),

        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`${prefixo}cancelar`)
                .setLabel('Cancelar')
                .setStyle(ButtonStyle.Danger),

            new ButtonBuilder()
                .setCustomId(`${prefixo}confirmar`)
                .setLabel('Confirmar')
                .setStyle(ButtonStyle.Success)
        )
    ];
}

// ==========================================
// ATUALIZAR PRÉVIA
// ==========================================

async function atualizarPreviewCrop(interaction, estado) {
    const perfil = obterPerfil(
        interaction.user.id
    );

    perfil.banner = estado.banner;
    perfil.crop = estado.crop;

    const imagem = await gerarImagem(
        interaction.user,
        perfil,
        interaction.member
    );

    const attachment = new AttachmentBuilder(
        imagem,
        {
            name: 'previa-perfil.png'
        }
    );

    return interaction.update({
        content:
            '🖼️ Ajuste o enquadramento do banner.\n' +
            'Use as setas para mover a imagem e + ou − para ajustar o zoom.',
        files: [attachment],
        attachments: [],
        components: criarBotoesCrop(
            interaction.user.id
        )
    });
}

// ==========================================
// RECEBER IMAGEM
// ==========================================

async function receberImagemBanner(mensagem) {
    if (mensagem.author.bot || !mensagem.guild) {
        return false;
    }

    const pendente = enviosPendentes.get(
        mensagem.author.id
    );

    if (!pendente) return false;

    if (mensagem.guild.id !== pendente.guildId) {
        return false;
    }

    if (Date.now() > pendente.expiraEm) {
        enviosPendentes.delete(
            mensagem.author.id
        );

        await mensagem.reply(
            '⌛ O tempo para enviar o banner acabou. Abra `/perfil` e tente novamente.'
        ).catch(() => null);

        return true;
    }

    const imagens = [
        ...mensagem.attachments.values()
    ].filter(anexo => {
        const tipo = anexo.contentType || '';

        return (
            tipo.startsWith('image/') ||
            /\.(png|jpe?g|gif|webp)$/i.test(anexo.name || '')
        );
    });

    if (!imagens.length) {
        await mensagem.reply(
            '🖼️ Envie uma imagem PNG, JPG, WEBP ou GIF.'
        ).catch(() => null);

        return true;
    }

    const imagem = imagens[0];

    if (imagem.size > MAX_BANNER_SIZE) {
        await mensagem.reply(
            '❌ Essa imagem ultrapassa o limite de 8 MB.'
        ).catch(() => null);

        return true;
    }

    enviosPendentes.delete(
        mensagem.author.id
    );

    let nomeArquivo = null;
    let painelEnviado = false;

    try {
        nomeArquivo = await baixarESalvarBanner(
            imagem
        );

        const perfil = obterPerfil(
            mensagem.author.id
        );

        const cropInicial = {
            x: 0,
            y: 0,
            zoom: 1
        };

        const membro = await mensagem.guild.members
            .fetch(mensagem.author.id)
            .catch(() => null);

        const imagemPreview = await gerarImagem(
            mensagem.author,
            {
                ...perfil,
                banner: nomeArquivo,
                crop: cropInicial
            },
            membro
        );

        const attachment = new AttachmentBuilder(
            imagemPreview,
            {
                name: 'previa-perfil.png'
            }
        );

        await mensagem.channel.send({
            content:
                `<@${mensagem.author.id}> ✅ Imagem recebida!\n\n` +
                'Ajuste o enquadramento do seu banner.',
            files: [attachment],
            components: criarBotoesCrop(
                mensagem.author.id
            )
        });

        painelEnviado = true;

        ajustesPendentes.set(
            mensagem.author.id,
            {
                banner: nomeArquivo,
                crop: cropInicial,
                guildId: mensagem.guild.id,
                criadoEm: Date.now()
            }
        );

        await mensagem.delete().catch(() => null);

    } catch (erro) {
        console.error(
            '[PERFIL] Erro ao receber banner:',
            erro
        );

        if (!painelEnviado) {
            if (nomeArquivo) {
                const caminho = path.join(
                    BANNERS_DIR,
                    nomeArquivo
                );

                if (fs.existsSync(caminho)) {
                    fs.unlinkSync(caminho);
                }
            }

            ajustesPendentes.delete(
                mensagem.author.id
            );

            await mensagem.reply({
                content:
                    `❌ Não consegui processar essa imagem: ${erro.message}\n` +
                    'Sua mensagem original foi mantida.'
            }).catch(() => null);
        }
    }

    return true;
}

// ==========================================
// COMANDO /PERFIL
// ==========================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName('perfil')
        .setDescription('Visualize seu perfil no Zodíaco')
        .addUserOption(option =>
            option
                .setName('usuario')
                .setDescription('Perfil de outro membro')
                .setRequired(false)
        ),

    async execute(interaction) {
        const user =
            interaction.options.getUser('usuario') ||
            interaction.user;

        const perfil = obterPerfil(user.id);

        const member = interaction.guild
            ? await interaction.guild.members
                .fetch(user.id)
                .catch(() => null)
            : null;

        const imagem = await gerarImagem(
            user,
            perfil,
            member
        );

        const attachment = new AttachmentBuilder(
            imagem,
            {
                name: 'perfil-zodiaco.png'
            }
        );

        const rows = user.id === interaction.user.id
            ? [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('perfil_abrir_edicao')
                        .setLabel('Editar')
                        .setStyle(ButtonStyle.Secondary)
                )
            ]
            : [];

        return interaction.reply({
            files: [attachment],
            components: rows
        });
    },

    // ========================================
    // RECEBER MENSAGENS
    // ========================================

    async handleMessage(mensagem) {
        return receberImagemBanner(mensagem);
    },

    // ========================================
    // INTERAÇÕES
    // ========================================

    async handleInteraction(interaction) {

        // ABRIR EDIÇÃO
        if (
            interaction.isButton() &&
            interaction.customId === 'perfil_abrir_edicao'
        ) {
            return interaction.reply({
                content: 'O que você deseja fazer?',
                components: [
                    new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId('perfil_editar_opcao')
                            .setPlaceholder('Escolha uma opção')
                            .addOptions(
                                {
                                    label: 'Alterar banner',
                                    description: 'Enviar e ajustar uma imagem',
                                    value: 'banner'
                                },
                                {
                                    label: 'Editar descrição',
                                    description: 'Alterar a descrição do perfil',
                                    value: 'descricao'
                                },
                                {
                                    label: 'Personalizar tema',
                                    description: 'Escolher a cor do perfil',
                                    value: 'tema'
                                }
                            )
                    )
                ],
                flags: MessageFlags.Ephemeral
            });
        }

        // ESCOLHER OPÇÃO
        if (
            interaction.isStringSelectMenu() &&
            interaction.customId === 'perfil_editar_opcao'
        ) {
            const tipo = interaction.values[0];

            // BANNER
            if (tipo === 'banner') {
                if (!interaction.guild) {
                    return interaction.reply({
                        content: '❌ Abra o perfil dentro de um servidor.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                enviosPendentes.set(
                    interaction.user.id,
                    {
                        guildId: interaction.guild.id,
                        expiraEm: Date.now() + TEMPO_ENVIO_BANNER
                    }
                );

                return interaction.reply({
                    content:
                        '🖼️ **Envie seu banner em qualquer canal deste servidor!**\n\n' +
                        '• PNG, JPG, WEBP ou GIF.\n' +
                        '• Máximo de 8 MB.\n' +
                        '• Você tem 2 minutos para enviar.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // TEMA
            if (tipo === 'tema') {
                return interaction.reply({
                    content: '**Escolha o tema do seu perfil:**',
                    components: [
                        new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId('perfil_escolher_tema')
                                .setPlaceholder('Selecione uma cor')
                                .addOptions(
                                    { label: 'Branco', value: 'branco' },
                                    { label: 'Preto', value: 'preto' },
                                    { label: 'Roxo', value: 'roxo' },
                                    { label: 'Azul', value: 'azul' },
                                    { label: 'Rosa', value: 'rosa' },
                                    { label: 'Vermelho', value: 'vermelho' }
                                )
                        )
                    ],
                    flags: MessageFlags.Ephemeral
                });
            }

            // DESCRIÇÃO
            const modal = new ModalBuilder()
                .setCustomId('perfil_modal_descricao')
                .setTitle('Editar descrição');

            const campo = new TextInputBuilder()
                .setCustomId('valor')
                .setLabel('Sua descrição')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(180)
                .setPlaceholder('Escreva algo sobre você...');

            modal.addComponents(
                new ActionRowBuilder().addComponents(campo)
            );

            return interaction.showModal(modal);
        }

        // ESCOLHER TEMA
        if (
            interaction.isStringSelectMenu() &&
            interaction.customId === 'perfil_escolher_tema'
        ) {
            const tema = interaction.values[0];

            if (!TEMAS[tema]) {
                return interaction.reply({
                    content: 'Tema inválido.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const perfil = obterPerfil(
                interaction.user.id
            );

            perfil.tema = tema;

            salvarPerfil(
                interaction.user.id,
                perfil
            );

            return interaction.update({
                content:
                    `✅ Seu tema foi alterado para **${TEMAS[tema].nome}**!`,
                components: []
            });
        }

        // AJUSTAR BANNER
        if (
            interaction.isButton() &&
            interaction.customId.startsWith('perfil_crop_')
        ) {
            const partes = interaction.customId.split('_');

            const usuarioId = partes[2];
            const acao = partes[3];

            if (usuarioId !== interaction.user.id) {
                return interaction.reply({
                    content:
                        '❌ Somente quem enviou este banner pode ajustar o enquadramento.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const estado = ajustesPendentes.get(
                interaction.user.id
            );

            if (!estado) {
                return interaction.reply({
                    content:
                        'Esse ajuste expirou. Envie o banner novamente.',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (
                Date.now() - estado.criadoEm >
                TEMPO_ENVIO_BANNER
            ) {
                ajustesPendentes.delete(
                    interaction.user.id
                );

                return interaction.reply({
                    content:
                        'O tempo para ajustar o banner acabou. Envie novamente.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // CANCELAR
            if (acao === 'cancelar') {
                ajustesPendentes.delete(
                    interaction.user.id
                );

                return interaction.update({
                    content:
                        '❌ Ajuste cancelado. Seu banner anterior foi mantido.',
                    attachments: [],
                    components: []
                });
            }

            // CONFIRMAR
            if (acao === 'confirmar') {
                const perfil = obterPerfil(
                    interaction.user.id
                );

                perfil.banner = estado.banner;
                perfil.crop = estado.crop;

                salvarPerfil(
                    interaction.user.id,
                    perfil
                );

                ajustesPendentes.delete(
                    interaction.user.id
                );

                return interaction.update({
                    content:
                        '✅ **Seu novo banner foi salvo no perfil!**',
                    attachments: [],
                    components: []
                });
            }

            // MOVIMENTAR
            const passo = 0.05;

            if (acao === 'cima') estado.crop.y -= passo;
            if (acao === 'baixo') estado.crop.y += passo;
            if (acao === 'esquerda') estado.crop.x -= passo;
            if (acao === 'direita') estado.crop.x += passo;

            if (acao === 'mais') {
                estado.crop.zoom = Math.min(
                    3,
                    estado.crop.zoom + 0.15
                );
            }

            if (acao === 'menos') {
                estado.crop.zoom = Math.max(
                    1,
                    estado.crop.zoom - 0.15
                );
            }

            if (acao === 'resetar') {
                estado.crop = {
                    x: 0,
                    y: 0,
                    zoom: 1
                };
            }

            estado.crop.x = Math.max(
                -0.45,
                Math.min(0.45, estado.crop.x)
            );

            estado.crop.y = Math.max(
                -0.45,
                Math.min(0.45, estado.crop.y)
            );

            return atualizarPreviewCrop(
                interaction,
                estado
            );
        }

        // SALVAR DESCRIÇÃO
        if (
            interaction.isModalSubmit() &&
            interaction.customId === 'perfil_modal_descricao'
        ) {
            const valor = interaction.fields
                .getTextInputValue('valor')
                .trim();

            if (!valor) {
                return interaction.reply({
                    content: 'O campo não pode ficar vazio.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const perfil = obterPerfil(
                interaction.user.id
            );

            perfil.descricao = valor;

            salvarPerfil(
                interaction.user.id,
                perfil
            );

            return interaction.reply({
                content:
                    '✅ Sua descrição foi atualizada com sucesso!',
                flags: MessageFlags.Ephemeral
            });
        }

        return false;
    }
};
