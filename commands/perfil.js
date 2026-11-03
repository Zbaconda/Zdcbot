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
const FILE = path.join(DATA_DIR, 'perfis.json');

const MAX_BANNER_SIZE = 8 * 1024 * 1024;
const TEMPO_ENVIO_BANNER = 2 * 60 * 1000;

const CARGO_NAMORADO = '1566433563887403038';
const CARGO_SOLTEIRO = '1566433517179510904';

// Quando criar o cargo VIP, coloque o ID aqui.
const CARGO_VIP = null;

// ==========================================
// DIMENSÕES
// ==========================================

const LARGURA = 1536;
const ALTURA = 1195;

const BANNER = {
    x: 0,
    y: 0,
    largura: 1536,
    altura: 558
};

const AVATAR = {
    x: 1235,
    y: 480,
    raio: 210
};

const PAINEL = {
    x: 40,
    y: 645,
    largura: 794,
    altura: 510
};

const NOME = {
    x: 998,
    y: 780,
    largura: 460,
    altura: 74
};

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
// TEMAS
// ==========================================

const TEMAS = {
    branco: {
        nome: 'Branco',
        fundo: '#FFFFFF',
        painel: '#F3F3F3',
        card: '#FFFFFF',
        texto: '#171717',
        secundario: '#777777',
        borda: '#DADADA'
    },

    preto: {
        nome: 'Preto',
        fundo: '#111114',
        painel: '#202026',
        card: '#29292F',
        texto: '#FFFFFF',
        secundario: '#B8B8C2',
        borda: '#393941'
    },

    roxo: {
        nome: 'Roxo',
        fundo: '#241331',
        painel: '#352044',
        card: '#49305C',
        texto: '#FFFFFF',
        secundario: '#D6BDEB',
        borda: '#65477A'
    },

    azul: {
        nome: 'Azul',
        fundo: '#142B43',
        painel: '#1D3B59',
        card: '#294D70',
        texto: '#FFFFFF',
        secundario: '#C0D9F2',
        borda: '#3B6287'
    },

    rosa: {
        nome: 'Rosa',
        fundo: '#482235',
        painel: '#613149',
        card: '#79425D',
        texto: '#FFFFFF',
        secundario: '#F8C9DC',
        borda: '#94536F'
    },

    vermelho: {
        nome: 'Vermelho',
        fundo: '#421C20',
        painel: '#5B282D',
        card: '#75353B',
        texto: '#FFFFFF',
        secundario: '#F5C5C8',
        borda: '#91464D'
    }
};

// ==========================================
// PASTAS
// ==========================================

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(BANNERS_DIR, { recursive: true });

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
        return JSON.parse(fs.readFileSync(FILE, 'utf8'));
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

    const perfil = {
        nivel: 1,
        money: 0,
        xp: 0,
        xpNecessario: 500,

        // Rank permanece independente.
        rank: '',

        vip: '',

        // Reputação antiga é preservada.
        reputacao: 0,

        // Novo contador independente.
        advertencias: 0,

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

    // Atualiza o limite antigo de XP.
    if (
        !perfil.xpNecessario ||
        perfil.xpNecessario === 200
    ) {
        perfil.xpNecessario = 500;
    }

    if (perfil.advertencias == null) {
        perfil.advertencias = 0;
    }

    if (perfil.reputacao == null) {
        perfil.reputacao = 0;
    }

    if (!perfil.crop) {
        perfil.crop = {
            x: 0,
            y: 0,
            zoom: 1
        };
    }

    return perfil;
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

    ctx.fillText(String(texto ?? ''), x, y);

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
// ESTADO CIVIL
// ==========================================

function obterEstadoCivil(member) {
    if (!member) return 'Não definido';

    const cargos = member.roles.cache;

    if (cargos.has(CARGO_NAMORADO)) {
        return 'Namorando';
    }

    if (cargos.has(CARGO_SOLTEIRO)) {
        return 'Solteiro';
    }

    return 'Não definido';
}

// ==========================================
// DESENHAR MODELO
// ==========================================

function desenharModelo(ctx, tema) {
    // FUNDO PRINCIPAL

    ctx.fillStyle = tema.fundo;
    ctx.fillRect(0, 0, LARGURA, ALTURA);

    // PAINEL

    ctx.fillStyle = tema.painel;

    arredondar(
        ctx,
        PAINEL.x,
        PAINEL.y,
        PAINEL.largura,
        PAINEL.altura,
        35
    );

    ctx.fill();

    // DETALHE

    ctx.strokeStyle = tema.borda;
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(55, 625);
    ctx.lineTo(830, 625);
    ctx.stroke();
}

// ==========================================
// INDICADOR DE BANNER
// ==========================================

function desenharIndicadorBanner(ctx) {
    ctx.save();
    // Ilustração discreta em roxo para indicar onde o banner será exibido.
    const gradiente = ctx.createLinearGradient(0, 0, LARGURA, BANNER.altura);
    gradiente.addColorStop(0, '#21152F');
    gradiente.addColorStop(0.5, '#352044');
    gradiente.addColorStop(1, '#17131F');
    ctx.fillStyle = gradiente;
    ctx.fillRect(0, 0, LARGURA, BANNER.altura);

    const estrelas = [
        [150, 120, 5], [330, 245, 3], [520, 105, 4], [720, 330, 5],
        [910, 155, 3], [1100, 300, 4], [1320, 115, 5], [1450, 390, 3],
        [240, 420, 3], [600, 450, 2], [980, 420, 3], [1240, 220, 2]
    ];
    ctx.fillStyle = '#D9B7FF';
    for (const [x, y, r] of estrelas) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.globalAlpha = 0.72;
    ctx.fillStyle = '#B987E8';
    for (const [x, y, r] of [[420,180,34],[1180,130,24],[820,250,18]]) {
        ctx.beginPath();
        ctx.moveTo(x, y-r); ctx.lineTo(x+5, y-5); ctx.lineTo(x+r, y);
        ctx.lineTo(x+5, y+5); ctx.lineTo(x, y+r); ctx.lineTo(x-5, y+5);
        ctx.lineTo(x-r, y); ctx.lineTo(x-5, y-5); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(15, 10, 22, 0.42)';
    arredondar(ctx, 55, 55, 290, 85, 22);
    ctx.fill();
    desenharTexto(ctx, 'SEU BANNER', 200, 108, 27, '#FFFFFF', 'bold', 'center');
    ctx.restore();
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

    const buffer = Buffer.from(await resposta.arrayBuffer());

    if (!buffer.length || buffer.length > MAX_BANNER_SIZE) {
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

    const caminho = path.join(BANNERS_DIR, nomeSeguro);

    if (!fs.existsSync(caminho)) {
        throw new Error('Banner não encontrado.');
    }

    return loadImage(fs.readFileSync(caminho));
}

// ==========================================
// DESENHAR BANNER
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
// AVATAR
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
// NOME
// ==========================================

function desenharNome(ctx, user, tema) {
    ctx.fillStyle = tema.painel;

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

    let tamanho = 42;

    ctx.save();

    ctx.font = `bold ${tamanho}px Arial`;

    while (
        ctx.measureText(nome).width > NOME.largura - 35 &&
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

    let tamanho = 34;

    ctx.save();

    ctx.font = `bold ${tamanho}px Arial`;

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
// ÍCONES EM EMOJI
// ==========================================

function desenharIcone(ctx, tipo, x, y) {
    const icones = {
        coins: '🪙',
        nivel: '⭐',
        vip: '👑',
        advertencias: '⚠️',
        estado: '💗'
    };

    desenharEmoji(
        ctx,
        icones[tipo] || '✨',
        x + 44,
        y + 44,
        58
    );
}

// ==========================================
// CARTÃO
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

    ctx.fillStyle = tema.card;

    arredondar(
        ctx,
        x,
        y,
        largura,
        altura,
        35
    );

    ctx.fill();

    desenharIcone(
        ctx,
        tipo,
        x,
        y + 11
    );

    const textoX = x + 100;

    let tamanhoTitulo = 29;

    ctx.save();
    ctx.font = `bold ${tamanhoTitulo}px Arial`;

    while (
        ctx.measureText(titulo).width > 250 &&
        tamanhoTitulo > 19
    ) {
        tamanhoTitulo -= 2;
        ctx.font = `bold ${tamanhoTitulo}px Arial`;
    }

    ctx.restore();

    desenharTexto(
        ctx,
        titulo,
        textoX,
        y + 48,
        tamanhoTitulo,
        tema.texto,
        'bold'
    );

    let tamanhoValor = 25;

    ctx.save();
    ctx.font = `bold ${tamanhoValor}px Arial`;

    while (
        ctx.measureText(valor).width > 250 &&
        tamanhoValor > 16
    ) {
        tamanhoValor -= 2;
        ctx.font = `bold ${tamanhoValor}px Arial`;
    }

    ctx.restore();

    desenharTexto(
        ctx,
        valor,
        textoX,
        y + 83,
        tamanhoValor,
        tema.secundario,
        'bold'
    );
}

// ==========================================
// PAINEL DE INFORMAÇÕES
// ==========================================

function desenharPainel(ctx, perfil, member, tema) {
    const nivel = Number(perfil.nivel) || 1;
    const money = Number(perfil.money) || 0;
    const xp = Number(perfil.xp) || 0;
    const xpNecessario = Number(perfil.xpNecessario) || 500;

    const advertencias = Number(perfil.advertencias) || 0;

    const estadoCivil = obterEstadoCivil(member);

    let vip = 'Sem VIP';

    if (CARGO_VIP && member?.roles?.cache?.has(CARGO_VIP)) {
        vip = member.guild.roles.cache.get(CARGO_VIP)?.name || 'VIP';
    }

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
        `Nível ${nivel}`,
        `${xp}/${xpNecessario} XP`,
        'nivel',
        tema
    );

    // SEGUNDA LINHA

    desenharCartao(
        ctx,
        CARTOES.x1,
        CARTOES.y2,
        'VIP',
        vip,
        'vip',
        tema
    );

    desenharCartao(
        ctx,
        CARTOES.x2,
        CARTOES.y2,
        'Advertências',
        String(advertencias),
        'advertencias',
        tema
    );

    // TERCEIRA LINHA

    desenharCartao(
        ctx,
        CARTOES.x1,
        CARTOES.y3,
        'Estado civil',
        estadoCivil,
        'estado',
        tema
    );
}

// ==========================================
// GERAR PERFIL
// ==========================================

async function gerarImagem(user, perfil, member = null) {
    const canvas = createCanvas(LARGURA, ALTURA);
    const ctx = canvas.getContext('2d');

    const tema = TEMAS[perfil.tema] || TEMAS.branco;

    desenharModelo(ctx, tema);

    // BANNER

    if (perfil.banner) {
        try {
            const banner = await carregarBanner(perfil.banner);

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

            desenharIndicadorBanner(ctx);
        }
    } else {
        desenharIndicadorBanner(ctx);
    }

    // AVATAR

    await desenharAvatar(ctx, user);

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
    const perfil = obterPerfil(interaction.user.id);

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
        components: criarBotoesCrop(interaction.user.id)
    });
}

// ==========================================
// RECEBER IMAGEM
// ==========================================

async function receberImagemBanner(mensagem) {
    if (mensagem.author.bot || !mensagem.guild) {
        return false;
    }

    const pendente = enviosPendentes.get(mensagem.author.id);

    if (!pendente) return false;

    if (mensagem.guild.id !== pendente.guildId) {
        return false;
    }

    if (Date.now() > pendente.expiraEm) {
        enviosPendentes.delete(mensagem.author.id);

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

    enviosPendentes.delete(mensagem.author.id);

    let nomeArquivo = null;
    let painelEnviado = false;

    try {
        nomeArquivo = await baixarESalvarBanner(imagem);

        const perfil = obterPerfil(mensagem.author.id);

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
            components: criarBotoesCrop(mensagem.author.id)
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

            ajustesPendentes.delete(mensagem.author.id);

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

            const perfil = obterPerfil(interaction.user.id);

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
                ajustesPendentes.delete(interaction.user.id);

                return interaction.reply({
                    content:
                        'O tempo para ajustar o banner acabou. Envie novamente.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // CANCELAR

            if (acao === 'cancelar') {
                ajustesPendentes.delete(interaction.user.id);

                const caminho = path.join(
                    BANNERS_DIR,
                    estado.banner
                );

                if (fs.existsSync(caminho)) {
                    fs.unlinkSync(caminho);
                }

                return interaction.update({
                    content:
                        '❌ Ajuste cancelado. Seu banner anterior foi mantido.',
                    attachments: [],
                    components: []
                });
            }

            // CONFIRMAR

            if (acao === 'confirmar') {
                const perfil = obterPerfil(interaction.user.id);

                const bannerAnterior = perfil.banner;

                perfil.banner = estado.banner;
                perfil.crop = estado.crop;

                salvarPerfil(
                    interaction.user.id,
                    perfil
                );

                ajustesPendentes.delete(interaction.user.id);

                // Remove o banner anterior, se houver.
                if (
                    bannerAnterior &&
                    bannerAnterior !== estado.banner
                ) {
                    const caminhoAnterior = path.join(
                        BANNERS_DIR,
                        path.basename(bannerAnterior)
                    );

                    if (fs.existsSync(caminhoAnterior)) {
                        fs.unlinkSync(caminhoAnterior);
                    }
                }

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

            const perfil = obterPerfil(interaction.user.id);

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
