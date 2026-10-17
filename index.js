require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');

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
    ChannelSelectMenuBuilder
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// CONFIGURAÇÕES DA ZODÍACO
const CATEGORIA_CALL = '1560763293994323999';
const CARGO_BOOSTER = '1559367297053757551';

const cooldowns = new Map();

// SISTEMA DE CALLS TEMPORÁRIAS
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

                console.log(
                    `Call temporária excluída: ${canalAtual.name}`
                );

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

client.commands = new Collection();

// CARREGAR COMANDOS
const commandsPath = path.join(__dirname, 'commands');

if (fs.existsSync(commandsPath)) {
    const files = fs.readdirSync(commandsPath)
        .filter(file => file.endsWith('.js'));

    for (const file of files) {
        try {
            const command = require(
                path.join(commandsPath, file)
            );

            if (command.data && command.execute) {
                client.commands.set(
                    command.data.name,
                    command
                );

                console.log(
                    `Comando carregado: ${command.data.name}`
                );
            } else {
                console.log(
                    `⚠️ ${file} precisa de data e execute.`
                );
            }
        } catch (error) {
            console.error(`Erro ao carregar ${file}:`, error);
        }
    }
}

client.once('clientReady', readyClient => {
    console.log(`Bot online como ${readyClient.user.tag}`);
});

// MONITORAR ENTRADAS E SAÍDAS DAS CALLS
client.on(
    'voiceStateUpdate',
    async (estadoAnterior, estadoNovo) => {
        try {
            const canalAnterior = estadoAnterior.channel;
            const canalNovo = estadoNovo.channel;

            // Alguém entrou: cancelar a exclusão.
            if (
                canalNovo &&
                callsTemporarias.has(canalNovo.id)
            ) {
                cancelarExclusaoCall(canalNovo.id);
            }

            // Alguém saiu: verificar se a call ficou vazia.
            if (
                canalAnterior &&
                canalAnterior.id !== canalNovo?.id &&
                callsTemporarias.has(canalAnterior.id)
            ) {
                const canalAtualizado =
                    await estadoAnterior.guild.channels
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
            console.error(
                'Erro ao monitorar calls:',
                error
            );
        }
    }
);

// FUNÇÕES AUXILIARES
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

async function verificarCooldown(
    interaction,
    membro,
    ferramenta
) {
    const segundos = tempoCooldown(membro, ferramenta);

    if (segundos === 0) return true;

    const chave =
        `${interaction.guildId}:${interaction.user.id}:${ferramenta}`;

    const agora = Date.now();
    const expiracao = cooldowns.get(chave) || 0;

    if (agora < expiracao) {
        const restante = Math.ceil(
            (expiracao - agora) / 1000
        );

        await responderErro(
            interaction,
            `⏳ Aguarde **${restante} segundo(s)** antes de usar essa ferramenta novamente.`
        );

        return false;
    }

    cooldowns.set(chave, agora + segundos * 1000);

    return true;
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

function criarModal(
    id,
    titulo,
    campoId,
    rotulo,
    exemplo
) {
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

    const canal = await guild.channels.fetch(id)
        .catch(() => null);

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

// EVENTOS DE INTERAÇÃO
client.on('interactionCreate', async interaction => {
    try {
        if (!interaction.inGuild()) return;

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

            const alvoId = interaction.values[0];

            const alvo = await buscarMembro(
                interaction.guild,
                alvoId
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

            const seletorCanal =
                new ChannelSelectMenuBuilder()
                    .setCustomId(`mover_canal:${alvo.id}`)
                    .setPlaceholder('Escolha a call de destino')
                    .setChannelTypes(
                        ChannelType.GuildVoice,
                        ChannelType.GuildStageVoice
                    )
                    .setMinValues(1)
                    .setMaxValues(1);

            return interaction.update({
                content: `👤 Membro selecionado: **${alvo.user.username}**\n\n🔊 Agora escolha a call de destino:`,
                components: [
                    new ActionRowBuilder()
                        .addComponents(seletorCanal)
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

            const alvo = await buscarMembro(
                interaction.guild,
                alvoId
            );

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

            const botMembro =
                await interaction.guild.members.fetchMe();

            if (!botMembro.permissions.has(
                PermissionFlagsBits.MoveMembers
            )) {
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

            if (!await verificarCooldown(
                interaction,
                membro,
                'mover'
            )) {
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

        // FORMULÁRIOS
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

            // ALTERAR LIMITE DA CALL
            if (interaction.customId === 'modal_limite_call') {
                const valor = interaction.fields
                    .getTextInputValue('limite_pessoas')
                    .trim();

                if (
                    !/^\d{1,2}$/.test(valor) ||
                    Number(valor) > 99
                ) {
                    return responderErro(
                        interaction,
                        '❌ Digite um número entre 0 e 99.'
                    );
                }

                const botMembro =
                    await interaction.guild.members.fetchMe();

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

            // MUTAR MEMBRO (BOOSTER)
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

                const botMembro =
                    await interaction.guild.members.fetchMe();

                if (!botMembro.permissions.has(
                    PermissionFlagsBits.MuteMembers
                )) {
                    return responderErro(
                        interaction,
                        '❌ Preciso da permissão Silenciar membros.'
                    );
                }

                if (!await verificarCooldown(
                    interaction,
                    membro,
                    'mutar'
                )) {
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

        // MENU DE CARGOS EXISTENTE
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
                    const categoria =
                        await interaction.guild.channels
                            .fetch(CATEGORIA_CALL)
                            .catch(() => null);

                    if (!categoria ||
                        categoria.type !== ChannelType.GuildCategory) {
                        return responderErro(
                            interaction,
                            '❌ A categoria configurada não foi encontrada. Verifique o ID.'
                        );
                    }

                    const botMembro =
                        await interaction.guild.members.fetchMe();

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

                    const novoCanal =
                        await interaction.guild.channels.create({
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

                    // Registrar call temporária.
                    callsTemporarias.add(novoCanal.id);

                    // Tentar mover o criador para a call.
                    if (
                        botMembro.permissions.has(
                            PermissionFlagsBits.MoveMembers
                        ) &&
                        novoCanal.permissionsFor(botMembro)
                            ?.has(PermissionFlagsBits.Connect)
                    ) {
                        try {
                            await membro.voice.setChannel(novoCanal);
                        } catch (error) {
                            console.error(
                                'A call foi criada, mas não consegui mover o usuário:',
                                error
                            );
                        }
                    }

                    // Se a call estiver vazia, iniciar contagem.
                    if (novoCanal.members.size === 0) {
                        agendarExclusaoCall(novoCanal);
                    }

                    return interaction.reply({
                        content: `✅ Sua call **${nome}** foi criada!`,
                        ephemeral: true
                    });
                }

                // OUTRAS FERRAMENTAS EXIGEM ESTAR EM CALL
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
                    const seletorMembro =
                        new UserSelectMenuBuilder()
                            .setCustomId('mover_membro')
                            .setPlaceholder(
                                'Selecione o membro que deseja mover'
                            )
                            .setMinValues(1)
                            .setMaxValues(1);

                    return interaction.reply({
                        content: '👥 **Selecione o membro que deseja mover:**',
                        components: [
                            new ActionRowBuilder()
                                .addComponents(seletorMembro)
                        ],
                        ephemeral: true
                    });
                }

                // MUTAR
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

                    const botMembro =
                        await interaction.guild.members.fetchMe();

                    if (!botMembro.permissions.has(
                        PermissionFlagsBits.MuteMembers
                    )) {
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

                // FECHAR A CALL
                if (ferramenta === 'privar_call') {
                    const canal = membro.voice.channel;

                    const botMembro =
                        await interaction.guild.members.fetchMe();

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

                // ABRIR A CALL
                if (ferramenta === 'desprivar_call') {
                    const canal = membro.voice.channel;

                    const botMembro =
                        await interaction.guild.members.fetchMe();

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

        // COMANDOS SLASH EXISTENTES
        if (!interaction.isChatInputCommand()) return;

        const comando = client.commands.get(
            interaction.commandName
        );

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

// LIGAR BOT
if (!process.env.DISCORD_TOKEN) {
    console.error(
        'Token não encontrado nas variáveis de ambiente.'
    );
} else {
    client.login(process.env.DISCORD_TOKEN).catch(error => {
        console.error(
            'Falha ao conectar o bot:',
            error.message
        );
    });
}
