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

const CARGO_VIP = null;

// ==========================================
// TEMAS
// ==========================================

const TEMAS = {
    branco: {
        nome: 'Branco',
        fundo: '#ffffff',
        card: '#eeeeF2',
        texto: '#17171c',
        secundario: '#777780',
        borda: '#dedee5',
        destaque: '#8050e8'
    },

    preto: {
        nome: 'Preto',
        fundo: '#111114',
        card: '#29292f',
        texto: '#ffffff',
        secundario: '#b8b8c2',
        borda: '#393941',
        destaque: '#a477ff'
    },

    roxo: {
        nome: 'Roxo',
        fundo: '#7944b5',
        card: '#e8dafa',
        texto: '#241331',
        secundario: '#674b7d',
        borda: '#d5b9f2',
        destaque: '#ffffff'
    },

    azul: {
        nome: 'Azul',
        fundo: '#397ac5',
        card: '#dcecff',
        texto: '#142b43',
        secundario: '#54718f',
        borda: '#c0dcfa',
        destaque: '#ffffff'
    },

    rosa: {
        nome: 'Rosa',
        fundo: '#d66f9c',
        card: '#ffe2ed',
        texto: '#482235',
        secundario: '#946078',
        borda: '#f4c3d8',
        destaque: '#ffffff'
    },

    vermelho: {
        nome: 'Vermelho',
        fundo: '#bd454b',
        card: '#ffe1e1',
        texto: '#421c20',
        secundario: '#936064',
        borda: '#f1c0c2',
        destaque: '#ffffff'
    }
};

// ==========================================
// PASTAS E ARQUIVOS
// ==========================================

fs.mkdirSync(DATA_DIR, { recursive: true });

if (
    fs.existsSync(BANNERS_DIR) &&
    !fs.statSync(BANNERS_DIR).isDirectory()
) {
    throw new Error(
        '[PERFIL] data/banners existe, mas não é uma pasta.'
    );
}

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
        const conteudo = fs.readFileSync(FILE, 'utf8');
        return JSON.parse(conteudo);
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
        money: '',
        rank: '',
        vip: '',
        reputacao: 0,
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
// UTILITÁRIOS DE CANVAS
// ==========================================

function arredondar(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.closePath();
}

function desenharTexto(
    ctx,
    texto,
    x,
    y,
    tamanho,
    cor,
    fonte = 'normal'
) {
    ctx.fillStyle = cor;
    ctx.font = `${fonte} ${tamanho}px Arial`;

    ctx.fillText(String(texto), x, y);
}

function textoLimitado(ctx, texto, x, y, maxWidth) {
    let resultado = String(texto || '');

    while (
        resultado.length > 3 &&
        ctx.measureText(resultado).width > maxWidth
    ) {
        resultado = resultado.slice(0, -4) + '...';
    }

    ctx.fillText(resultado, x, y);
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

    if (!buffer.length || buffer.length > MAX_BANNER_SIZE) {
        throw new Error(
            'A imagem está vazia ou ultrapassa o limite de 8 MB.'
        );
    }

    // Verifica se a imagem pode ser aberta.
    await loadImage(buffer);

    const nomeArquivo = `${crypto.randomUUID()}${extensao}`;
    const caminho = path.join(BANNERS_DIR, nomeArquivo);

    fs.writeFileSync(caminho, buffer);

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
// DESENHAR BANNER COM ENQUADRAMENTO
// ==========================================

function desenharBanner(
    ctx,
    imagem,
    x,
    y,
    largura,
    altura,
    crop = {}
) {
    const zoom = Math.max(
        1,
        Math.min(3, Number(crop.zoom) || 1)
    );

    const proporcao = Math.max(
        largura / imagem.width,
        altura / imagem.height
    );

    const larguraBase = largura / proporcao;
    const alturaBase = altura / proporcao;

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

    arredondar(ctx, x, y, largura, altura, 24);
    ctx.clip();

    ctx.drawImage(
        imagem,
        sx,
        sy,
        larguraFonte,
        alturaFonte,
        x,
        y,
        largura,
        altura
    );

    ctx.restore();
}

// ==========================================
// ESTADO CIVIL E VIP
// ==========================================

function obterEstadoCivil(member) {
    if (!member) return 'Não informado';

    if (member.roles.cache.has(CARGO_NAMORADO)) {
        return 'Namorado';
    }

    if (member.roles.cache.has(CARGO_SOLTEIRO)) {
        return 'Solteiro';
    }

    return 'Não informado';
}

function obterVIP(member) {
    if (!CARGO_VIP || !member) {
        return 'Não possui VIP';
    }

    return member.roles.cache.has(CARGO_VIP)
        ? 'Possui VIP'
        : 'Não possui VIP';
}

// ==========================================
// GERAR IMAGEM DO PERFIL
// ==========================================

async function gerarImagem(user, perfil, member = null) {
    const canvas = createCanvas(1200, 700);
    const ctx = canvas.getContext('2d');

    const tema = TEMAS[perfil.tema] || TEMAS.branco;

    // FUNDO
    ctx.fillStyle = tema.fundo;
    ctx.fillRect(0, 0, 1200, 700);

    // BANNER
    let banner = null;

    if (perfil.banner) {
        try {
            banner = await carregarBanner(perfil.banner);
        } catch (erro) {
            console.error(
                '[PERFIL] Erro ao carregar banner:',
                erro
            );
        }
    }

    if (banner) {
        desenharBanner(
            ctx,
            banner,
            30,
            30,
            1140,
            270,
            perfil.crop
        );
    } else {
        const gradiente = ctx.createLinearGradient(
            30,
            30,
            1170,
            300
        );

        gradiente.addColorStop(0, '#7043aa');
        gradiente.addColorStop(1, '#26183d');

        ctx.fillStyle = gradiente;

        arredondar(ctx, 30, 30, 1140, 270, 24);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.08)';

        for (let i = 0; i < 8; i++) {
            ctx.beginPath();

            ctx.arc(
                700 + i * 65,
                60 + (i % 3) * 55,
                80,
                0,
                Math.PI * 2
            );

            ctx.fill();
        }
    }

    // AVATAR
    try {
        const avatar = await loadImage(
            user.displayAvatarURL({
                extension: 'png',
                size: 256
            })
        );

        ctx.save();

        ctx.beginPath();
        ctx.arc(1010, 290, 91, 0, Math.PI * 2);
        ctx.clip();

        ctx.drawImage(
            avatar,
            919,
            199,
            182,
            182
        );

        ctx.restore();

        ctx.strokeStyle = tema.fundo;
        ctx.lineWidth = 12;

        ctx.beginPath();
        ctx.arc(1010, 290, 91, 0, Math.PI * 2);
        ctx.stroke();

    } catch (erro) {
        console.error(
            '[PERFIL] Erro ao carregar avatar:',
            erro
        );
    }

    // NOME
    desenharTexto(
        ctx,
        user.globalName || user.username,
        65,
        370,
        38,
        tema.texto
    );

    // DESCRIÇÃO
    ctx.font = 'normal 21px Arial';
    ctx.fillStyle = tema.secundario;

    textoLimitado(
        ctx,
        perfil.descricao ||
            'Este usuário ainda não adicionou uma descrição.',
        67,
        410,
        1040
    );

    // INFORMAÇÕES
    const estadoCivil = obterEstadoCivil(member);
    const vip = obterVIP(member);

    const cards = [
        {
            icone: '◉',
            titulo: 'Money',
            valor: perfil.money || '0'
        },
        {
            icone: '★',
            titulo: 'Nível',
            valor: String(perfil.nivel || 1)
        },
        {
            icone: '✦',
            titulo: 'VIP',
            valor: vip
        },
        {
            icone: '♡',
            titulo: 'Estado civil',
            valor: estadoCivil
        },
        {
            icone: '♧',
            titulo: 'Reputação',
            valor: String(perfil.reputacao || 0)
        }
    ];

    const cardW = 345;
    const cardH = 105;
    const gapX = 22;
    const gapY = 18;
    const startX = 65;
    const startY = 450;

    cards.forEach((card, i) => {
        const coluna = i % 3;
        const linha = Math.floor(i / 3);

        const x = startX + coluna * (cardW + gapX);
        const y = startY + linha * (cardH + gapY);

        ctx.fillStyle = tema.card;

        arredondar(
            ctx,
            x,
            y,
            cardW,
            cardH,
            18
        );

        ctx.fill();

        ctx.strokeStyle = tema.borda;
        ctx.lineWidth = 2;
        ctx.stroke();

        desenharTexto(
            ctx,
            card.icone,
            x + 20,
            y + 42,
            30,
            tema.destaque === '#ffffff'
                ? tema.texto
                : tema.destaque
        );

        desenharTexto(
            ctx,
            card.titulo,
            x + 65,
            y + 35,
            17,
            tema.secundario
        );

        ctx.fillStyle = tema.texto;
        ctx.font = 'normal 23px Arial';

        textoLimitado(
            ctx,
            card.valor,
            x + 65,
            y + 70,
            cardW - 85
        );
    });

    // RODAPÉ
    desenharTexto(
        ctx,
        'ZODÍACO • PROFILE',
        65,
        685,
        15,
        tema.secundario
    );

    return canvas.toBuffer('image/png');
}

// ==========================================
// CONTROLES DO ENQUADRAMENTO
// ==========================================

function criarBotoesCrop(usuarioId) {
    const prefixo = `perfil_crop_${usuarioId}_`;

    return [
        // PRIMEIRA LINHA: 5 BOTÕES
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

        // SEGUNDA LINHA
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

        // TERCEIRA LINHA
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
            '🖼️ Ajuste o enquadramento do seu banner.\n' +
            'Use as setas para mover a imagem e os botões + e − para ajustar o zoom.\n' +
            'Quando estiver satisfeito, clique em Confirmar.',
        files: [attachment],
        attachments: [],
        components: criarBotoesCrop(interaction.user.id)
    });
}

// ==========================================
// RECEBER IMAGEM NO SERVIDOR
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

    // VERIFICAR TEMPO
    if (Date.now() > pendente.expiraEm) {
        enviosPendentes.delete(mensagem.author.id);

        await mensagem.reply(
            '⌛ O tempo para enviar o banner acabou. Abra `/perfil` e tente novamente.'
        ).catch(() => null);

        return true;
    }

    // PROCURAR IMAGENS
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
        // BAIXAR E SALVAR IMAGEM
        nomeArquivo = await baixarESalvarBanner(imagem);

        const perfil = obterPerfil(mensagem.author.id);

        const cropInicial = {
            x: 0,
            y: 0,
            zoom: 1
        };

        // BUSCAR MEMBRO
        const membro = await mensagem.guild.members
            .fetch(mensagem.author.id)
            .catch(() => null);

        // GERAR PRÉVIA
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

        // ENVIAR PAINEL ANTES DE APAGAR A MENSAGEM
        const painel = await mensagem.channel.send({
            content:
                `<@${mensagem.author.id}> ✅ Imagem recebida!\n\n` +
                '🖼️ Agora ajuste o enquadramento do seu banner.\n' +
                'Use as setas para mover a imagem e os botões + e − para ajustar o zoom.',
            files: [attachment],
            components: criarBotoesCrop(mensagem.author.id)
        });

        painelEnviado = true;

        // REGISTRAR AJUSTE
        ajustesPendentes.set(mensagem.author.id, {
            banner: nomeArquivo,
            crop: cropInicial,
            guildId: mensagem.guild.id,
            criadoEm: Date.now()
        });

        // APAGAR A MENSAGEM ORIGINAL DEPOIS DO ENVIO
        await mensagem.delete().catch(erro => {
            console.warn(
                '[PERFIL] Não foi possível apagar a mensagem original:',
                erro.message
            );
        });

        console.log(
            `[PERFIL] Banner recebido de ${mensagem.author.username}. Painel: ${painel.id}`
        );

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
                    'Sua mensagem original foi mantida. Tente novamente.'
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

        let member = null;

        if (interaction.guild) {
            member = await interaction.guild.members
                .fetch(user.id)
                .catch(() => null);
        }

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
    // RECEBER IMAGENS
    // ========================================

    async handleMessage(mensagem) {
        return receberImagemBanner(mensagem);
    },

    // ========================================
    // INTERAÇÕES
    // ========================================

    async handleInteraction(interaction) {

        // ======================================
        // ABRIR EDIÇÃO
        // ======================================

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

        // ======================================
        // ESCOLHER OPÇÃO
        // ======================================

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

                enviosPendentes.set(interaction.user.id, {
                    guildId: interaction.guild.id,
                    expiraEm: Date.now() + TEMPO_ENVIO_BANNER
                });

                return interaction.reply({
                    content:
                        '🖼️ **Envie seu banner em qualquer canal deste servidor!**\n\n' +
                        '• Formatos: PNG, JPG, WEBP ou GIF.\n' +
                        '• Tamanho máximo: 8 MB.\n' +
                        '• Você tem 2 minutos para enviar.\n\n' +
                        'Depois, você poderá ajustar a posição e o zoom antes de salvar.',
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

        // ======================================
        // ESCOLHER TEMA
        // ======================================

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

            salvarPerfil(interaction.user.id, perfil);

            return interaction.update({
                content:
                    `✅ Seu tema foi alterado para **${TEMAS[tema].nome}**!`,
                components: []
            });
        }

        // ======================================
        // AJUSTE DO BANNER
        // ======================================

        if (
            interaction.isButton() &&
            interaction.customId.startsWith('perfil_crop_')
        ) {
            const partes = interaction.customId.split('_');

            const usuarioId = partes[2];
            const acao = partes[3];

            // VERIFICAR DONO DO AJUSTE
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

                perfil.banner = estado.banner;
                perfil.crop = estado.crop;

                salvarPerfil(
                    interaction.user.id,
                    perfil
                );

                ajustesPendentes.delete(interaction.user.id);

                return interaction.update({
                    content:
                        '✅ **Seu novo banner foi salvo no perfil!**',
                    attachments: [],
                    components: []
                });
            }

            // MOVIMENTAÇÃO E ZOOM
            const passo = 0.05;

            if (acao === 'cima') {
                estado.crop.y -= passo;
            }

            if (acao === 'baixo') {
                estado.crop.y += passo;
            }

            if (acao === 'esquerda') {
                estado.crop.x -= passo;
            }

            if (acao === 'direita') {
                estado.crop.x += passo;
            }

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

            // LIMITES DO ENQUADRAMENTO
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

        // ======================================
        // SALVAR DESCRIÇÃO
        // ======================================

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
