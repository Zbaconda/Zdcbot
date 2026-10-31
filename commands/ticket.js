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
const BANNER_SUPORTE = 'https://media.discordapp.net/attachments/1559056011375943784/1563610129893425222/file_00000000e724820e8223219b519005ff.png?ex=6ae03b29&is=6adee9a9&hm=f55a74f77676b8b748a134340e59fbd57792069df4a2285ab33abf542ef9cf45&=&format=webp&quality=lossless';

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

function ehAdministradorTicket(interaction) {
    return Boolean(
        interaction.member?.roles?.cache?.has(CARGO_ADMIN_TICKETS)
    );
}

function criarPainelSuporte() {
    const container = new ContainerBuilder()
        .setAccentColor(0x7137B8)
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL(BANNER_SUPORTE)
            )
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '# <:zodiaco:1559378755158548520>  𝑺uporte — 𝓩odiaco'
            )
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '<a:blackwoiz:1565855581674283140> 𝓢eja bem-vindo(a) à nossa central de atendimento! Estamos aqui para ajudar você da melhor maneira possível\n\n' +
                '> <:3_wiisp:1565855585369596046>  **A**ntes de iniciar, pedimos que leia atentamente as orientações e descreva sua solicitação de forma clara e objetiva. Assim, nossa equipe poderá compreender melhor sua necessidade e oferecer o auxílio adequado.\n\n' +
                '> <:3_wiisp:1565855585369596046> **M**antenha a cordialidade durante todo o atendimento e aguarde até que um membro da equipe esteja disponível para responder. Sua paciência é muito importante!\n\n' +
                '> <:3_wiisp:1565855585369596046>  **P**ara iniciar, basta clicar em "Abrir", selecionar uma das opções e iniciar seu atendimento. Nossa equipe estará à disposição para ajudar!\n\n' +
                '-# > <:3_wiisp:1565855585369596046>  **A**gradecemos pela compreensão, confiança e preferência. Será um prazer receber você por aqui!\n\n' +
                '**Com carinho, equipe 𝓩odiaco.** <a:ggwinsz_branco:1565855557103915098>'
            )
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket:abrir')
                    .setLabel('Abrir')
                    .setEmoji('🎫')
                    .setStyle(ButtonStyle.Primary)
            )
        );

    return container;
}

function criarContainerSelecao() {
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

    return {
        content: '🎫 **Escolha a categoria do seu atendimento**\nSelecione uma das opções abaixo para continuar. Depois disso, você poderá enviar suas mensagens neste canal.',
        components: [new ActionRowBuilder().addComponents(menu)],
        allowedMentions: { parse: [] }
    };
}

function criarContainerTicket(categoria) {
    const container = new ContainerBuilder()
        .setAccentColor(0x7137B8)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# ${categoria.emoji} ${categoria.label.toUpperCase()}\nSeu ticket foi aberto com sucesso!\n\nOlá! Descreva sua solicitação com detalhes e aguarde nossa equipe. Mantenha a cordialidade durante o atendimento.`
            )
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '🔒 **Canal privado**\nApenas você e a equipe autorizada podem visualizar este atendimento.'
            )
        )
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket:encerrar')
                    .setLabel('Encerrar ticket')
                    .setEmoji('🔒')
                    .setStyle(ButtonStyle.Secondary)
            )
        );

    return container;
}

async function criarTicket(interaction, client) {
    const categoriaDiscord = await interaction.guild.channels
        .fetch(CATEGORIA_TICKETS_ID)
        .catch(() => null);

    if (
        !categoriaDiscord ||
        categoriaDiscord.type !== ChannelType.GuildCategory
    ) {
        return interaction.reply({
            content: '❌ A categoria configurada para os tickets não foi encontrada. Confira se a categoria configurada existe e se o bot tem acesso a ela.',
            flags: MessageFlags.Ephemeral
        });
    }

    const existentes = interaction.guild.channels.cache.filter(canal =>
        canal.type === ChannelType.GuildText &&
        canal.topic?.includes(`ticket_owner=${interaction.user.id}`)
    );

    if (existentes.size > 0) {
        return interaction.reply({
            content: `⚠️ Você já possui um ticket aberto: ${existentes.first()}`,
            flags: MessageFlags.Ephemeral
        });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const nome = interaction.user.username
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 18) || 'membro';

    const criadoEm = new Date().toISOString();
    const topic = `ticket_owner=${interaction.user.id};ticket_category=pendente;ticket_created=${criadoEm}`;

    try {
        const canal = await interaction.guild.channels.create({
            name: `ticket-abertura-${nome}`,
            type: ChannelType.GuildText,
            parent: categoriaDiscord.id,
            topic,
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
                    deny: [PermissionFlagsBits.SendMessages]
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
                        PermissionFlagsBits.AttachFiles
                    ]
                }
            ],
            reason: `Ticket iniciado por ${interaction.user.tag}`
        });

        await canal.send({
            content: `${interaction.user}`,
            ...criarContainerSelecao(),
            allowedMentions: { users: [interaction.user.id] }
        });

        // Registra a abertura imediatamente no canal de logs.
        const canalLogs = await interaction.guild.channels
            .fetch(CANAL_LOGS_TICKETS)
            .catch(() => null);

        if (canalLogs?.isTextBased()) {
            const logAbertura = new EmbedBuilder()
                .setColor(0x7137B8)
                .setTitle('🎫 Novo ticket aberto')
                .addFields(
                    { name: 'Aberto por', value: `${interaction.user} (${interaction.user.id})`, inline: false },
                    { name: 'Canal', value: `${canal}`, inline: true },
                    { name: 'Categoria', value: 'Aguardando seleção', inline: true },
                    { name: 'Aberto em', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
                )
                .setTimestamp();

            await canalLogs.send({ embeds: [logAbertura] }).catch(erro => {
                console.error('Não consegui registrar a abertura do ticket:', erro);
            });
        } else {
            console.warn('Canal de logs de tickets não encontrado ou não é textual.');
        }

        await interaction.editReply({
            content: `✅ Seu canal de atendimento foi criado: ${canal}\nSelecione uma categoria dentro dele para começar.`
        });
    } catch (erro) {
        console.error('Erro ao criar ticket:', erro);
        await interaction.editReply({
            content: '❌ Não consegui criar seu ticket. Verifique se o bot tem Gerenciar canais e se a categoria permite criar canais.'
        });
    }
}

function extrairDadosTicket(canal) {
    const topic = canal.topic || '';
    const owner = topic.match(/ticket_owner=(\d+)/)?.[1];
    const categoria = topic.match(/ticket_category=([a-z]+)/)?.[1] || 'pendente';
    const criado = topic.match(/ticket_created=([^;]+)/)?.[1];

    if (!owner || !criado) return null;
    return { owner, categoria, criado };
}

async function gerarTranscricao(canal) {
    const mensagens = [];
    let antesDe;

    // Busca até 1.000 mensagens, em lotes de 100, incluindo as mais antigas.
    for (let pagina = 0; pagina < 10; pagina++) {
        const lote = await canal.messages.fetch({
            limit: 100,
            ...(antesDe ? { before: antesDe } : {})
        });

        if (lote.size === 0) break;

        mensagens.push(...lote.values());
        antesDe = lote.last().id;

        if (lote.size < 100) break;
    }

    mensagens.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    const linhas = mensagens.map(msg => {
        const data = new Date(msg.createdTimestamp).toLocaleString('pt-BR', {
            timeZone: 'America/Sao_Paulo'
        });
        const autor = `${msg.author.tag} (${msg.author.id})`;
        const texto = (msg.content || '').replace(/\r/g, '');
        const anexos = [...msg.attachments.values()]
            .map(anexo => `[Anexo: ${anexo.name || 'arquivo'}] ${anexo.url}`)
            .join('\n');

        return `[${data}] ${autor}:\n${texto}${anexos ? `\n${anexos}` : ''}`;
    });

    return {
        total: mensagens.length,
        conteudo: [
            `Transcrição do ticket #${canal.name}`,
            `Canal ID: ${canal.id}`,
            `Servidor: ${canal.guild.name} (${canal.guild.id})`,
            '',
            ...linhas
        ].join('\n\n')
    };
}

async function encerrarTicket(interaction) {
    const canal = interaction.channel;
    const dados = extrairDadosTicket(canal);

    if (!dados) {
        await interaction.reply({
            content: '❌ Este canal não foi reconhecido como um ticket.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    if (!ehAdministradorTicket(interaction)) {
        await interaction.reply({
            content: '⛔ Somente membros com o cargo de administrador autorizado podem encerrar tickets.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const categoria = CATEGORIAS[dados.categoria];
        const transcricao = await gerarTranscricao(canal);
        const fechadoEm = new Date();
        const abertoEm = new Date(dados.criado);
        const duracaoMin = Math.max(0, Math.round((fechadoEm - abertoEm) / 60000));

        const arquivo = new AttachmentBuilder(
            Buffer.from(transcricao.conteudo, 'utf8'),
            { name: `transcricao-${canal.id}.txt` }
        );

        const logs = await canal.guild.channels
            .fetch(CANAL_LOGS_TICKETS)
            .catch(() => null);

        if (!logs || !logs.isTextBased()) {
            await interaction.editReply({
                content: '❌ Não encontrei o canal de logs configurado. O ticket não foi apagado.'
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(0x7137B8)
            .setTitle('🎫 Ticket encerrado')
            .setDescription('O atendimento foi finalizado e sua transcrição está anexada.')
            .addFields(
                { name: 'ID do ticket', value: canal.id, inline: true },
                { name: 'Aberto por', value: `<@${dados.owner}> (${dados.owner})`, inline: false },
                { name: 'Categoria', value: categoria ? `${categoria.emoji} ${categoria.label}` : 'Não selecionada', inline: true },
                { name: 'Aberto em', value: `<t:${Math.floor(abertoEm.getTime() / 1000)}:F>`, inline: false },
                { name: 'Encerrado por', value: `${interaction.user} (${interaction.user.id})`, inline: false },
                { name: 'Encerrado em', value: `<t:${Math.floor(fechadoEm.getTime() / 1000)}:F>`, inline: false },
                { name: 'Duração', value: `${duracaoMin} minuto(s)`, inline: true },
                { name: 'Mensagens na transcrição', value: String(transcricao.total), inline: true }
            )
            .setTimestamp(fechadoEm);

        await logs.send({
            embeds: [embed],
            files: [arquivo]
        });

        await interaction.editReply({
            content: '✅ Ticket encerrado e transcrição enviada ao canal de logs. Este canal será removido em alguns segundos.'
        });

        await canal.send('🔒 Este ticket foi encerrado por um administrador. O canal será removido em instantes.');
        setTimeout(() => {
            canal.delete('Ticket encerrado; transcrição registrada no canal de logs.')
                .catch(erro => console.error('Erro ao apagar canal do ticket:', erro));
        }, 5000);
    } catch (erro) {
        console.error('Erro ao encerrar ticket:', erro);
        await interaction.editReply({
            content: '❌ Ocorreu um erro ao encerrar o ticket. O canal foi mantido para evitar perda do atendimento.'
        });
    }
}

async function selecionarCategoria(interaction) {
    const canal = interaction.channel;
    const dados = extrairDadosTicket(canal);

    if (!dados || dados.owner !== interaction.user.id) {
        return interaction.reply({
            content: '❌ Somente a pessoa que abriu este ticket pode escolher a categoria.',
            flags: MessageFlags.Ephemeral
        });
    }

    if (dados.categoria !== 'pendente') {
        return interaction.reply({
            content: '⚠️ A categoria deste ticket já foi definida.',
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
        await canal.setName(`ticket-${chave}-${interaction.user.username
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '-')
            .replace(/-+/g, '-')
            .slice(0, 18) || 'membro'}`);

        await canal.setTopic(
            `ticket_owner=${dados.owner};ticket_category=${chave};ticket_created=${dados.criado}`
        );

        await canal.permissionOverwrites.edit(interaction.user.id, {
            ViewChannel: true,
            ReadMessageHistory: true,
            SendMessages: true,
            AttachFiles: true
        });

        await interaction.update({
            content: `✅ Categoria selecionada: **${categoria.label}**. Agora você já pode enviar mensagens neste canal.`,
            components: []
        });

        await canal.send({
            components: [criarContainerTicket(categoria)],
            flags: MessageFlags.IsComponentsV2
        });
    } catch (erro) {
        console.error('Erro ao selecionar categoria do ticket:', erro);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ Não consegui configurar a categoria. Verifique as permissões do bot.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Publica o painel de abertura de tickets'),

    async execute(interaction) {
        if (!ehAdministradorTicket(interaction)) {
            return interaction.reply({
                content: '⛔ Somente a equipe autorizada pode publicar o painel de suporte.',
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.reply({
            components: [criarPainelSuporte()],
            flags: MessageFlags.IsComponentsV2
        });
    },

    async handleInteraction(interaction, client) {
        if (interaction.isButton()) {
            if (interaction.customId === 'ticket:abrir') {
                await criarTicket(interaction, client);
                return true;
            }

            if (interaction.customId === 'ticket:encerrar') {
                await encerrarTicket(interaction);
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
