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

const {
  createCanvas,
  loadImage
} = require('@napi-rs/canvas');

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// ==========================================
// PASTAS E ARQUIVOS
// ==========================================

const DATA_DIR = path.join(__dirname, '..', 'data');
const BANNERS_DIR = path.join(DATA_DIR, 'banners');
const FILE = path.join(DATA_DIR, 'perfis.json');

const MAX_BANNER_SIZE = 8 * 1024 * 1024;
const TEMPO_ENVIO_BANNER = 2 * 60 * 1000;

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(BANNERS_DIR, { recursive: true });

if (!fs.existsSync(FILE)) {
  fs.writeFileSync(FILE, '{}', 'utf8');
}

// ==========================================
// ESTADO DOS ENVIOS
// ==========================================

const enviosPendentes = new Map();
const clientesConectados = new WeakSet();

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

function arredondar(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.closePath();
}

// ==========================================
// REGISTRAR RECEBIMENTO DE IMAGENS
// ==========================================

function conectarRecebimento(client) {
  if (!client || clientesConectados.has(client)) {
    return;
  }

  clientesConectados.add(client);

  client.on('messageCreate', async mensagem => {
    try {
      const tratado = await receberImagemBanner(mensagem);

      if (tratado) return;

    } catch (erro) {
      console.error(
        '[PERFIL] Erro ao receber imagem:',
        erro
      );
    }
  });

  console.log('[PERFIL] Sistema de envio de banners conectado.');
}

// ==========================================
// BAIXAR E SALVAR IMAGEM
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

  // Verifica se o arquivo realmente é uma imagem.
  await loadImage(buffer);

  const nomeArquivo =
    `${crypto.randomUUID()}${extensao}`;

  const caminho = path.join(
    BANNERS_DIR,
    nomeArquivo
  );

  fs.writeFileSync(caminho, buffer);

  console.log(
    `[PERFIL] Banner salvo: ${nomeArquivo}`
  );

  return nomeArquivo;
}

// ==========================================
// CARREGAR BANNER SALVO
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
    throw new Error(
      `Arquivo de banner não encontrado: ${nomeSeguro}`
    );
  }

  const buffer = fs.readFileSync(caminho);

  return loadImage(buffer);
}

// ==========================================
// RECEBER IMAGEM ENVIADA NO CHAT
// ==========================================

async function receberImagemBanner(mensagem) {
  if (mensagem.author.bot || !mensagem.guild) {
    return false;
  }

  const pendente = enviosPendentes.get(
    mensagem.author.id
  );

  if (!pendente) {
    return false;
  }

  // Confere se o envio aconteceu no mesmo servidor.
  if (mensagem.guild.id !== pendente.guildId) {
    return false;
  }

  // Confere se foi enviado no mesmo canal.
  if (mensagem.channelId !== pendente.channelId) {
    return false;
  }

  // Confere se o prazo expirou.
  if (Date.now() > pendente.expiraEm) {
    enviosPendentes.delete(mensagem.author.id);

    await mensagem.reply(
      '⌛ O tempo para enviar o banner acabou. Abra `/perfil` e tente novamente.'
    ).catch(() => null);

    return true;
  }

  const imagens = [...mensagem.attachments.values()].filter(
    anexo => {
      const tipo = anexo.contentType || '';

      return (
        tipo.startsWith('image/') ||
        /\.(png|jpe?g|gif|webp)$/i.test(anexo.name || '')
      );
    }
  );

  if (imagens.length === 0) {
    await mensagem.reply(
      '🖼️ Não encontrei uma imagem nessa mensagem. Envie PNG, JPG, WEBP ou GIF.'
    ).catch(() => null);

    return true;
  }

  const imagem = imagens[0];

  if (imagem.size > MAX_BANNER_SIZE) {
    await mensagem.reply(
      '❌ Essa imagem ultrapassa o limite de 8 MB. Envie outra imagem menor.'
    ).catch(() => null);

    return true;
  }

  // Impede dois envios simultâneos do mesmo usuário.
  enviosPendentes.delete(mensagem.author.id);

  let resposta;

  try {
    const nomeArquivo = await baixarESalvarBanner(imagem);

    const perfis = lerPerfis();

    const perfilAtual = {
      nivel: 1,
      money: '',
      rank: '',
      vip: '',
      banner: '',
      descricao: '',
      ...(perfis[mensagem.author.id] || {})
    };

    perfilAtual.banner = nomeArquivo;

    perfis[mensagem.author.id] = perfilAtual;

    salvarPerfis(perfis);

    resposta =
      '✅ **Seu banner foi salvo com sucesso!**\n' +
      'Use `/perfil` para visualizar seu novo perfil.';

    console.log(
      `[PERFIL] Banner atualizado para ${mensagem.author.username}.`
    );

  } catch (erro) {
    console.error(
      '[PERFIL] Erro ao salvar imagem:',
      erro
    );

    resposta =
      `❌ Não consegui salvar essa imagem.\n` +
      `Motivo: ${erro.message}`;
  }

  await mensagem.reply(resposta).catch(() => null);

  return true;
}

// ==========================================
// GERAR IMAGEM DO PERFIL
// ==========================================

async function gerarImagem(user, perfil) {
  const canvas = createCanvas(1100, 620);
  const ctx = canvas.getContext('2d');

  // FUNDO

  const bg = ctx.createLinearGradient(
    0, 0, 1100, 620
  );

  bg.addColorStop(0, '#100d1d');
  bg.addColorStop(0.55, '#21143a');
  bg.addColorStop(1, '#090812');

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1100, 620);

  // ========================================
  // BANNER
  // ========================================

  let bannerCarregado = false;

  if (perfil.banner) {
    try {
      const banner = await carregarBanner(
        perfil.banner
      );

      const largura = 1044;
      const altura = 235;

      const escala = Math.max(
        largura / banner.width,
        altura / banner.height
      );

      const w = banner.width * escala;
      const h = banner.height * escala;

      ctx.save();

      arredondar(
        ctx,
        28,
        25,
        largura,
        altura,
        28
      );

      ctx.clip();

      ctx.drawImage(
        banner,
        28 + (largura - w) / 2,
        25 + (altura - h) / 2,
        w,
        h
      );

      ctx.restore();

      bannerCarregado = true;

    } catch (erro) {
      console.error(
        '[PERFIL] Erro ao carregar banner:',
        erro
      );
    }
  }

  // BANNER PADRÃO

  if (!bannerCarregado) {
    const bannerGrad = ctx.createLinearGradient(
      28, 25, 1072, 260
    );

    bannerGrad.addColorStop(0, '#4b2678');
    bannerGrad.addColorStop(1, '#171126');

    ctx.fillStyle = bannerGrad;

    arredondar(
      ctx,
      28,
      25,
      1044,
      235,
      28
    );

    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.08)';

    for (let i = 0; i < 8; i++) {
      ctx.beginPath();

      ctx.arc(
        760 + i * 55,
        55 + (i % 3) * 55,
        85,
        0,
        Math.PI * 2
      );

      ctx.fill();
    }
  }

  // ========================================
  // AVATAR
  // ========================================

  try {
    const avatar = await loadImage(
      user.displayAvatarURL({
        extension: 'png',
        size: 256
      })
    );

    ctx.save();

    ctx.beginPath();
    ctx.arc(145, 245, 83, 0, Math.PI * 2);
    ctx.clip();

    ctx.drawImage(
      avatar,
      62,
      162,
      166,
      166
    );

    ctx.restore();

    ctx.strokeStyle = '#d9c5ff';
    ctx.lineWidth = 8;

    ctx.beginPath();
    ctx.arc(145, 245, 83, 0, Math.PI * 2);
    ctx.stroke();

  } catch (erro) {
    console.error(
      '[PERFIL] Erro ao carregar avatar:',
      erro
    );
  }

  // ========================================
  // NOME E DESCRIÇÃO
  // ========================================

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 43px Sans';

  ctx.fillText(
    user.globalName || user.username,
    255,
    300,
    790
  );

  ctx.fillStyle = '#c7b5e8';
  ctx.font = '22px Sans';

  ctx.fillText(
    perfil.descricao ||
    'Este usuário ainda não adicionou uma descrição.',
    258,
    340,
    780
  );

  // ========================================
  // CARDS
  // ========================================

  const cards = [
    {
      label: 'MONEY',
      value: perfil.money || ''
    },
    {
      label: 'NÍVEL',
      value: String(perfil.nivel || 1)
    },
    {
      label: 'RANK',
      value: perfil.rank || ''
    },
    {
      label: 'VIP',
      value: perfil.vip || ''
    }
  ];

  const startX = 40;
  const gap = 18;
  const cardW = 246;
  const cardY = 405;
  const cardH = 150;

  cards.forEach((card, i) => {
    const x = startX + i * (cardW + gap);

    ctx.fillStyle = 'rgba(255,255,255,0.075)';

    arredondar(
      ctx,
      x,
      cardY,
      cardW,
      cardH,
      20
    );

    ctx.fill();

    ctx.strokeStyle = 'rgba(211,184,255,0.22)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#c7b5e8';
    ctx.font = 'bold 19px Sans';

    ctx.fillText(
      card.label,
      x + 22,
      cardY + 42
    );

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 31px Sans';

    ctx.fillText(
      card.value,
      x + 22,
      cardY + 96,
      cardW - 40
    );
  });

  // ========================================
  // RODAPÉ
  // ========================================

  ctx.fillStyle = '#8f7eaa';
  ctx.font = '17px Sans';

  ctx.fillText(
    'ZODÍACO • PROFILE',
    40,
    590
  );

  return canvas.toBuffer('image/png');
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

    const perfis = lerPerfis();

    const perfil = {
      nivel: 1,
      money: '',
      rank: '',
      vip: '',
      banner: '',
      descricao: '',
      ...(perfis[user.id] || {})
    };

    const imagem = await gerarImagem(
      user,
      perfil
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
              .setEmoji('✏️')
          )
        ]
      : [];

    return interaction.reply({
      files: [attachment],
      components: rows
    });
  },

  // ========================================
  // INTERAÇÕES
  // ========================================

  async handleInteraction(interaction, client) {
    // Conecta o recebimento de imagens ao bot.
    conectarRecebimento(client);

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
                  label: 'Escolher banner',
                  description: 'Enviar uma imagem para o perfil',
                  value: 'banner',
                  emoji: '🖼️'
                },
                {
                  label: 'Editar descrição',
                  description: 'Alterar a descrição do perfil',
                  value: 'descricao',
                  emoji: '📝'
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

      // ENVIO DE BANNER DIRETO PELO CHAT

      if (tipo === 'banner') {
        if (!interaction.guild || !interaction.channelId) {
          return interaction.reply({
            content: '❌ Abra o perfil dentro de um canal do servidor.',
            flags: MessageFlags.Ephemeral
          });
        }

        enviosPendentes.set(interaction.user.id, {
          guildId: interaction.guild.id,
          channelId: interaction.channelId,
          expiraEm: Date.now() + TEMPO_ENVIO_BANNER
        });

        return interaction.reply({
          content:
            '🖼️ **Envie seu banner neste canal!**\n\n' +
            'Anexe a imagem em uma mensagem normal.\n' +
            '• Formatos: PNG, JPG, WEBP ou GIF.\n' +
            '• Tamanho máximo: 8 MB.\n' +
            '• Você tem 2 minutos para enviar.\n\n' +
            'Assim que receber a imagem, vou salvá-la automaticamente no seu perfil.',
          flags: MessageFlags.Ephemeral
        });
      }

      // EDITAR DESCRIÇÃO

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

      const perfis = lerPerfis();

      const perfilAtual = {
        nivel: 1,
        money: '',
        rank: '',
        vip: '',
        banner: '',
        descricao: '',
        ...(perfis[interaction.user.id] || {})
      };

      perfilAtual.descricao
