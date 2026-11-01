const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    EmbedBuilder,
    AttachmentBuilder,
    MessageFlags
} = require('discord.js');

const CANAL_LOGS_TICKETS = '1559889239192240128';
const CARGO_ADMIN_TICKETS = '1561597992123768933';
const CATEGORIA_TICKETS_ID = '1565842106508124180';

const BANNER_SUPORTE = 'https://media.discordapp.net/attachments/1559056011375943784/1563610140286918838/file_00000000797c820ebdcb865e2be3398e.png?ex=6ae6d2ab&is=6ae5812b&hm=1edd0d07c534c71539ffe1c754a36a0cfe71603fd2af8732f8eff04c80da3032&=&format=webp&quality=lossless';

const CATEGORIAS = {
    parcerias: {
        label: 'Parcerias',
        emoji: '🤝',
        descricao: 'Propostas e assuntos relacionados a parcerias.'
    },
    denuncias: {
        label: 'Denúncias',
        emoji: '🚨',
        descricao: 'Reporte situações que precisam da atenção da equipe.'
    },
    duvidas: {
        label: 'Dúvidas',
        emoji: '❓',
        descricao: 'Tire suas dúvidas sobre o servidor.'
    }
};

function ehAdmin(interaction) {
    return Boolean(
        interaction.member?.roles?.cache?.has(CARGO_ADMIN_TICKETS)
    );
}

function textoPainel() {
    return '# <:zodiaco:1559378755158548520>  𝑺uporte — 𝓩odiaco\n\n' +
        '<a:blackwoiz:1565855581674283140> 𝓢eja bem-vindo(a) à nossa central de atendimento! Estamos aqui para ajudar você da melhor maneira possível\n\n' +
        '> <:3_wiisp:1565855585369596046>  **A**ntes de iniciar, pedimos que leia atentamente as orientações e descreva sua solicitação de forma clara e objetiva. Assim, nossa equipe poderá compreender melhor sua necessidade e oferecer o auxílio adequado.\n\n' +
        '> <:3_wiisp:1565855585369596046> **M**antenha a cordialidade durante todo o atendimento e aguarde até que um membro da equipe esteja disponível para responder. Sua paciência é muito importante!\n\n' +
        '> <:3_wiisp:1565855585369596046>  **P**ara iniciar, basta clicar em "Abrir", selecionar uma das opções e iniciar seu atendimento. Nossa equipe estará à disposição para ajudar!\n\n' +
        '-# > <:3_wiisp:1565855585369596046>  **A**gradecemos pela compreensão, confiança e preferência. Será um prazer receber você por aqui!\n\n' +
        '**Com carinho, equipe 𝓩odiaco.** <a:ggwinsz_branco:1565855557103915098>';
}

// PAINEL PRINCIPAL

function criarPainelSuporte() {
    return new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(textoPainel())
        )
        .addSeparatorComponents(
            new SeparatorBuilder()
        )
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL(BANNER_SUPORTE)
            )
        );
}

function criarBotaoAbrir() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket:abrir')
            .setLabel('Abrir')
            .setEmoji('🎫')
            .setStyle(ButtonStyle.Primary)
    );
}

// PAINEL DE SELEÇÃO

function criarPainelSelecao() {
    return new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '# 🎫 Escolha a categoria do seu atendimento\n\n' +
                'Selecione uma das opções abaixo para continuar.\n\n' +
                'Você poderá enviar mensagens somente depois de escolher uma categoria.'
            )
        )
        .addSeparatorComponents(
            new SeparatorBuilder()
        );
}

function criarMenuCategoria() {
    const menu = new StringSelectMenuBuilder()
        .setCustomId('ticket:categoria')
        .setPlaceholder('Selecione o motivo do atendimento...')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
            Object.entries(CATEGORIAS).map(([value, categoria]) => ({
                label: categoria.label,
                description: categoria.descricao,
                value,
                emoji: categoria.emoji
            }))
        );

    return new ActionRowBuilder().addComponents(menu);
}

// PAINÉIS DE CADA CATEGORIA

function criarPainelAtendimento(chave) {
    const descricoes = {
        parcerias:
            `# <:emoji_233:1566168876251877600> PARCERIAS — CENTRAL DE ATENDIMENTO\n\n` +
            `Tem interesse em fazer uma parceria com a **Zodíaco**? Este espaço é destinado ao recebimento de propostas de outras comunidades.\n\n` +
            `### Para solicitar uma parceria, seu servidor precisa:\n` +
            `ㅤ\n` +
            `- Ter, no mínimo, 100 membros.\n` +
            `- Manter uma comunidade ativa.\n` +
            `- Não possuir panelinhas ou grupos que prejudiquem a interação e a convivência entre os membros.\n` +
            `- Disponibilizar um convite permanente, sem prazo de expiração.\n\n` +
            `**Importante:** Antes de enviar sua proposta, confira se todos os requisitos estão sendo cumpridos e se o convite está funcionando. Nossa equipe irá analisar a solicitação e retornar com uma resposta. <a:zodiaco:1565855589009981530>\n\n` +
            `-# <:snake_black:1566146728653103104> O envio da proposta não garante aprovação. A decisão fica a critério da equipe responsável. Suas informações serão tratadas com sigilo.`,

        duvidas:
            `# <a:emoji_232:1566158275840581642> DÚVIDAS — CENTRAL DE ATENDIMENTO\n\n` +
            `Precisa de ajuda? Este espaço foi criado para esclarecer dúvidas e orientar você sobre o funcionamento da **Zodíaco**.\n\n` +
            `### Você pode utilizar este atendimento para:\n` +
            `ㅤ\n` +
            `> <a:whitset40:1547273099693527050> __Dúvidas sobre regras, canais e cargos__.\n\n` +
            `> <a:whitset40:1547273099693527050> __Informações sobre eventos e atividades__.\n\n` +
            `> <a:whitset40:1547273099693527050> __Ajuda com comandos e funções dos bots__.\n\n` +
            `> <a:whitset40:1547273099693527050> __Problemas ou dificuldades no servidor__.\n\n` +
            `> <a:whitset40:1547273099693527050> __Outras questões relacionadas à comunidade__.\n\n` +
            `### Para facilitar o atendimento, explique:\n` +
            `ㅤ\n` +
            `- <a:zodiaco:1566146710978170991> __Qual é a sua dúvida ou dificuldade__.\n\n` +
            `- <a:zodiaco:1566146710978170991> __Em qual canal ou situação aconteceu__.\n\n` +
            `- <a:zodiaco:1566146710978170991> __Prints ou mensagens de erro, caso necessário__.\n\n` +
            `*Nossa equipe irá orientar você da melhor forma possível. Explique sua situação com clareza e aguarde o retorno de um responsável.*\n\n` +
            `-# <:snake_black:1566146728653103104> Este é um atendimento privado. Suas informações serão tratadas com sigilo. Aguarde a equipe responder.`,

        denuncias:
            `# <a:zodiaco:1561119760383606905> DENÚNCIAS — CENTRAL DE ATENDIMENTO\n\n` +
            `Este espaço é destinado ao registro de denúncias sobre comportamentos inadequados ou situações que violem as regras da **Zodíaco**.\n\n` +
            `### Você pode denunciar:\n` +
            `ㅤ\n` +
            `> <:zodiaco:1559627194903568464> __Desrespeito, assédio ou ofensas a membros__.\n\n` +
            `> <:zodiaco:1559627194903568464> __Ameaças, provocações ou conflitos__.\n\n` +
            `> <:zodiaco:1559627194903568464> __Divulgação de conteúdos proibidos__.\n\n` +
            `> <:zodiaco:1559627194903568464> __Descumprimento das regras do servidor__.\n\n` +
            `> <:zodiaco:1559627194903568464> __Outras situações que mereçam atenção da equipe__.\n\n` +
            `### Para realizar sua denúncia, informe:\n` +
            `ㅤ\n` +
            `- <:zodiaco:1559627194903568464> __Quem está envolvido e o que aconteceu__.\n\n` +
            `- <:zodiaco:1559627194903568464> __Onde e quando ocorreu a situação__.\n\n` +
            `- <:zodiaco:1559627194903568464> __Prints, links ou outras evidências, se disponíveis__.\n\n` +
            `**Importante**: *Seja claro e verdadeiro ao relatar o ocorrido. Evite denúncias falsas ou motivadas por conflitos pessoais. Todas as informações serão analisadas com discrição pela equipe responsável.*\n\n` +
            `-# <:snake_black:1566146728653103104> Este é um atendimento privado. Suas informações serão tratadas com sigilo.`
    };

    const painel = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(descricoes[chave])
        );

    const botoes = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket:encerrar')
            .setLabel('Fechar ticket')
            .setEmoji('🔒')
            .setStyle(ButtonStyle.Secondary)
    );

    return [painel, botoes];
}

// DADOS DO TICKET

function lerDados(canal) {
    const topic = canal.topic || '';

    const owner = topic.match(/ticket_owner=(\d+)/)?.[1];
    const categoria = topic.match(/ticket_category=([a-z]+)/)?.[1] || 'pendente';
    const criado = topic.match(/ticket_created=([^;]+)/)?.[1];
    const assumido = topic.match(/ticket_assigned=(\d+)/)?.[1] || null;
    const resolvido = topic.match(/ticket_resolved=(\d+)/)?.[1] || null;

    if (!owner || !criado) return null;

    return {
        owner,
        categoria,
        criado,
        assumido,
        resolvido
    };
}

async function atualizarTopic(canal, dados) {
    await canal.setTopic(
        `ticket_owner=${dados.owner};ticket_category=${dados.categoria};ticket_created=${dados.criado};ticket_assigned=${dados.assumido || ''};ticket_resolved=${dados.resolvido || ''}`
    );
}

async function enviarLog(guild, embed, files = []) {
    const logs = await guild.channels.fetch(CANAL_LOGS_TICKETS).catch(() => null);

    if (!logs?.isTextBased()) {
        throw new Error('Canal de logs não encontrado ou não é textual.');
    }

    await logs.send({
        embeds: [embed],
        files
    });
}

// CRIAÇÃO DO TICKET

async function criarTicket(interaction, client) {
    const categoria = await interaction.guild.channels
        .fetch(CATEGORIA_TICKETS_ID)
        .catch(() => null);

    if (!categoria || categoria.type !== ChannelType.GuildCategory) {
        return interaction.reply({
            content: '❌ A categoria de tickets não foi encontrada. Confira o ID e as permissões do bot.',
            flags: MessageFlags.Ephemeral
        });
    }

    const existentes = interaction.guild.channels.cache.filter(c =>
        c.type === ChannelType.GuildText &&
        c.topic?.includes(`ticket_owner=${interaction.user.id}`)
    );

    if (existentes.size) {
        return interaction.reply({
            content: `⚠️ Você já possui um ticket aberto: ${existentes.first()}`,
            flags: MessageFlags.Ephemeral
        });
    }

    await interaction.deferReply({
        flags: MessageFlags.Ephemeral
    });

    const nome = interaction.user.username
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 18) || 'membro';

    const criado = new Date().toISOString();

    try {
        const canal = await interaction.guild.channels.create({
            name: `ticket-abertura-${nome}`,
            type: ChannelType.GuildText,
            parent: categoria.id,

            topic:
                `ticket_owner=${interaction.user.id};` +
                `ticket_category=pendente;` +
                `ticket_created=${criado};` +
                `ticket_assigned=;` +
                `ticket_resolved=`,

            permissionOverwrites: [
                {
                    id: interaction.guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: interaction.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.ReadMessageHistory
                    ],
                    deny: [
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.AddReactions,
                        PermissionFlagsBits.CreatePublicThreads,
                        PermissionFlagsBits.CreatePrivateThreads
                    ]
                },
                {
                    id: CARGO_ADMIN_TICKETS,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.AttachFiles
                    ]
                },
                {
                    id: client.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.ManageChannels,
                        PermissionFlagsBits.AttachFiles,
                        PermissionFlagsBits.ManageMessages
                    ]
                }
            ],

            reason: `Ticket iniciado por ${interaction.user.tag}`
        });

        await canal.send({
            components: [
                criarPainelSelecao(),
                criarMenuCategoria()
            ],
            flags: MessageFlags.IsComponentsV2
        });

        const embed = new EmbedBuilder()
            .setColor(0x7137B8)
            .setTitle('🎫 Novo ticket aberto')
            .addFields(
                {
                    name: 'Aberto por',
                    value: `${interaction.user} (${interaction.user.id})`
                },
                {
                    name: 'Canal',
                    value: `${canal}`,
                    inline: true
                },
                {
                    name: 'Categoria',
                    value: 'Aguardando seleção',
                    inline: true
                },
                {
                    name: 'Aberto em',
                    value: `<t:${Math.floor(Date.now() / 1000)}:F>`
                }
            )
            .setTimestamp();

        await enviarLog(interaction.guild, embed);

        await interaction.editReply({
            content: `✅ Seu ticket foi criado: ${canal}\nEscolha uma categoria para liberar o atendimento.`
        });

    } catch (erro) {
        console.error('Erro ao criar ticket:', erro);

        await interaction.editReply({
            content: '❌ Não consegui criar o ticket. Confira as permissões do bot na categoria e no canal de logs.'
        });
    }
}

// SELEÇÃO DA CATEGORIA

async function selecionarCategoria(interaction) {
    const canal = interaction.channel;
    const dados = lerDados(canal);

    if (!dados || dados.owner !== interaction.user.id) {
        return interaction.reply({
            content: '❌ Somente quem abriu o ticket pode escolher a categoria.',
            flags: MessageFlags.Ephemeral
        });
    }

    if (dados.categoria !== 'pendente') {
        return interaction.reply({
            content: '⚠️ A categoria já foi selecionada.',
            flags: MessageFlags.Ephemeral
        });
    }

    const chave = interaction.values[0];
    const categoria = CATEGORIAS[chave];

    if (!categoria) {
        return interaction.reply({
            content: '❌ Categoria inválida.',
            flags: MessageFlags.Ephemeral
        });
    }

    try {
        const nome = interaction.user.username
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '-')
            .replace(/-+/g, '-')
            .slice(0, 18) || 'membro';

        await canal.setName(`ticket-${chave}-${nome}`);

        dados.categoria = chave;
        await atualizarTopic(canal, dados);

        await canal.permissionOverwrites.edit(interaction.user.id, {
            ViewChannel: true,
            ReadMessageHistory: true,
            SendMessages: true,
            AttachFiles: true,
            AddReactions: true
        });

        await interaction.message.delete().catch(() => {});

        await interaction.reply({
            content: `✅ Categoria selecionada: **${categoria.label}**. Agora você já pode enviar mensagens neste canal.`,
            flags: MessageFlags.Ephemeral
        });

        setTimeout(() => {
            interaction.deleteReply().catch(() => {});
        }, 5000);

        await canal.send({
            components: criarPainelAtendimento(chave),
            flags: MessageFlags.IsComponentsV2
        });

        const logs = await interaction.guild.channels
            .fetch(CANAL_LOGS_TICKETS)
            .catch(() => null);

        if (logs?.isTextBased()) {
            await logs.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x7137B8)
                        .setTitle('📂 Categoria definida')
                        .addFields(
                            {
                                name: 'Ticket',
                                value: `${canal}`,
                                inline: true
                            },
                            {
                                name: 'Categoria',
                                value: `${categoria.emoji} ${categoria.label}`,
                                inline: true
                            },
                            {
                                name: 'Aberto por',
                                value: `<@${dados.owner}>`
                            }
                        )
                        .setTimestamp()
                ]
            });
        }

    } catch (erro) {
        console.error('Erro ao selecionar categoria:', erro);

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ Não consegui liberar o ticket. Confira as permissões do bot.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
}

// AÇÃO DE FECHAR TICKET

async function acaoAdmin(interaction) {
    const canal = interaction.channel;
    const dados = lerDados(canal);

    if (!dados || dados.categoria === 'pendente') {
        return interaction.reply({
            content: '❌ Este canal ainda não é um ticket ativo.',
            flags: MessageFlags.Ephemeral
        });
    }

    if (!ehAdmin(interaction)) {
        return interaction.reply({
            content: '⛔ Somente administradores autorizados podem fechar tickets.',
            flags: MessageFlags.Ephemeral
        });
    }

    await interaction.deferReply({
        flags: MessageFlags.Ephemeral
    });

    try {
        const mensagens = [];
        let before;

        for (let pagina = 0; pagina < 10; pagina++) {
            const lote = await canal.messages.fetch({
                limit: 100,
                ...(before ? { before } : {})
            });

            if (!lote.size) break;

            mensagens.push(...lote.values());
            before = lote.last().id;

            if (lote.size < 100) break;
        }

        mensagens.sort(
            (a, b) => a.createdTimestamp - b.createdTimestamp
        );

        const linhas = mensagens.map(mensagem => {
            const quando = new Date(
                mensagem.createdTimestamp
            ).toLocaleString('pt-BR', {
                timeZone: 'America/Sao_Paulo'
            });

            const anexos = [
                ...mensagem.attachments.values()
            ].map(anexo =>
                `[Anexo: ${anexo.name || 'arquivo'}] ${anexo.url}`
            ).join('\n');

            return (
                `[${quando}] ${mensagem.author.tag} (${mensagem.author.id}):\n` +
                `${mensagem.content || ''}` +
                `${anexos ? '\n' + anexos : ''}`
            );
        });

        const transcript = [
            `Transcrição do ticket ${canal.name}`,
            `Canal: ${canal.id}`,
            `Autor: ${dados.owner}`,
            `Categoria: ${CATEGORIAS[dados.categoria]?.label || dados.categoria}`,
            `Encerrado por: ${interaction.user.id}`,
            '',
            ...linhas
        ].join('\n\n');

        const arquivo = new AttachmentBuilder(
            Buffer.from(transcript, 'utf8'),
            {
                name: `transcricao-${canal.id}.txt`
            }
        );

        const aberto = new Date(dados.criado);
        const fechado = new Date();

        const embed = new EmbedBuilder()
            .setColor(0x7137B8)
            .setTitle('🔒 Ticket encerrado')
            .setDescription('Atendimento encerrado pela equipe.')
            .addFields(
                {
                    name: 'Ticket',
                    value: `#${canal.name} (${canal.id})`
                },
                {
                    name: 'Aberto por',
                    value: `<@${dados.owner}>`,
                    inline: true
                },
                {
                    name: 'Categoria',
                    value: CATEGORIAS[dados.categoria]?.label || dados.categoria,
                    inline: true
                },
                {
                    name: 'Encerrado por',
                    value: `${interaction.user} (${interaction.user.id})`,
                    inline: true
                },
                {
                    name: 'Aberto em',
                    value: `<t:${Math.floor(aberto.getTime() / 1000)}:F>`
                },
                {
                    name: 'Encerrado em',
                    value: `<t:${Math.floor(fechado.getTime() / 1000)}:F>`
                },
                {
                    name: 'Mensagens na transcrição',
                    value: String(mensagens.length),
                    inline: true
                }
            )
            .setTimestamp(fechado);

        await enviarLog(
            interaction.guild,
            embed,
            [arquivo]
        );

        await interaction.editReply({
            content: '✅ Ticket encerrado. A transcrição e todas as informações foram enviadas aos logs. O canal será removido em 5 segundos.'
        });

        await canal.send(
            '🔒 Ticket encerrado por um administrador. Este canal será removido em instantes.'
        );

        setTimeout(() => {
            canal.delete(
                'Ticket encerrado; transcrição registrada.'
            ).catch(console.error);
        }, 5000);

    } catch (erro) {
        console.error('Erro ao encerrar ticket:', erro);

        await interaction.editReply({
            content: '❌ Não consegui encerrar. O canal foi mantido para evitar perda do histórico.'
        });
    }
}

// COMANDO E INTERAÇÕES

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Publica o painel de abertura de tickets'),

    async execute(interaction) {
        if (!ehAdmin(interaction)) {
            return interaction.reply({
                content: '⛔ Somente a equipe autorizada pode publicar o painel.',
                flags: MessageFlags.Ephemeral
            });
        }

        return interaction.reply({
            components: [
                criarPainelSuporte(),
                criarBotaoAbrir()
            ],
            flags: MessageFlags.IsComponentsV2
        });
    },

    async handleInteraction(interaction, client) {
        if (interaction.isButton()) {
            const acoes = {
                'ticket:abrir': () => criarTicket(interaction, client),
                'ticket:encerrar': () => acaoAdmin(interaction)
            };

            const executar = acoes[interaction.customId];

            if (executar) {
                await executar();
                return true;
            }
        }

        if (
            interaction.isStringSelectMenu() &&
            interaction.customId === 'ticket:categoria'
        ) {
            await selecionarCategoria(interaction);
            return true;
        }

        return false;
    }
};
