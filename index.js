
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
    PermissionsBitField
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');

if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath)
        .filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        try {
            const command = require(path.join(commandsPath, file));

            if (command.data && command.execute) {
                client.commands.set(command.data.name, command);
                console.log(`✅ Comando carregado: ${command.data.name}`);
            } else {
                console.log(`⚠️ ${file} precisa de data e execute.`);
            }
        } catch (error) {
            console.error(`❌ Erro ao carregar ${file}:`, error);
        }
    }
}

client.once('clientReady', readyClient => {
    console.log(`🤖 Bot online como ${readyClient.user.tag}`);
});

client.on('interactionCreate', async interaction => {

    // Formulário de limite da call
    if (
        interaction.isModalSubmit() &&
        interaction.customId === 'modal_limite_call'
    ) {
        try {
            const membro = await interaction.guild.members.fetch(
                interaction.user.id
            );

            const canal = membro.voice.channel;

            if (
                !canal ||
                ![
                    ChannelType.GuildVoice,
                    ChannelType.GuildStageVoice
                ].includes(canal.type)
            ) {
                return interaction.reply({
                    content: '❌ Entre em um canal de voz antes de alterar o limite.',
                    ephemeral: true
                });
            }

            const botMember = await interaction.guild.members.fetchMe();

            if (
                !canal.permissionsFor(botMember).has(
                    PermissionsBitField.Flags.ManageChannels
                )
            ) {
                return interaction.reply({
                    content: '❌ Não tenho permissão para gerenciar esse canal de voz.',
                    ephemeral: true
                });
            }

            const valor = interaction.fields
                .getTextInputValue('limite_pessoas')
                .trim();

            if (!/^\d+$/.test(valor)) {
                return interaction.reply({
                    content: '❌ Digite um número inteiro entre 0 e 99. Use 0 para remover o limite.',
                    ephemeral: true
                });
            }

            const limite = Number(valor);

            if (limite > 99) {
                return interaction.reply({
                    content: '❌ O limite máximo é 99 pessoas.',
                    ephemeral: true
                });
            }

            await canal.setUserLimit(
                limite,
                `Limite alterado por ${interaction.user.tag}`
            );

            return interaction.reply({
                content: limite === 0
                    ? '✅ Limite da call removido com sucesso!'
                    : `✅ Limite da call atualizado! Agora permite até **${limite} pessoa(s)**.`,
                ephemeral: true
            });

        } catch (error) {
            console.error('Erro ao atualizar limite:', error);

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ Não consegui atualizar o limite. Verifique as permissões do bot.',
                    ephemeral: true
                });
            }
        }

        return;
    }

    // Menu de cargos
    if (interaction.isStringSelectMenu()) {

        if (interaction.customId === 'selecionar_cargo') {
            const command = client.commands.get('cargos');

            if (!command || typeof command.handleSelect !== 'function') {
                return interaction.reply({
                    content: '❌ A função de seleção não foi encontrada.',
                    ephemeral: true
                });
            }

            try {
                await command.handleSelect(interaction);
            } catch (error) {
                console.error('Erro no menu de cargos:', error);

                const resposta = {
                    content: '❌ Ocorreu um erro ao selecionar o cargo.',
                    ephemeral: true
                };

                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(resposta);
                } else {
                    await interaction.reply(resposta);
                }
            }

            return;
        }

        // Painel de ferramentas de call
        if (interaction.customId === 'controle_call') {
            try {
                const membro = await interaction.guild.members.fetch(
                    interaction.user.id
                );

                if (!membro.voice.channelId) {
                    return interaction.reply({
                        content:
                            '❌ Você não pode usar esta opção!\n' +
                            'Entre em uma call antes de utilizar esta ferramenta.',
                        ephemeral: true
                    });
                }

                const ferramenta = interaction.values[0];

                // Abrir formulário da opção Quantidade
                if (ferramenta === 'quantidade') {
                    const modal = new ModalBuilder()
                        .setCustomId('modal_limite_call')
                        .setTitle('Limite de pessoas da call');

                    const campo = new TextInputBuilder()
                        .setCustomId('limite_pessoas')
                        .setLabel('Digite o limite (0 a 99)')
                        .setPlaceholder('Exemplo: 5. Digite 0 para remover o limite.')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMinLength(1)
                        .setMaxLength(2);

                    modal.addComponents(
                        new ActionRowBuilder().addComponents(campo)
                    );

                    return interaction.showModal(modal);
                }

                // As outras ferramentas continuam em configuração
                return interaction.reply({
                    content:
                        `🔧 Você selecionou **${ferramenta.replace(/_/g, ' ')}**.\n\n` +
                        '⚠️ Esta ferramenta ainda está sendo configurada.',
                    ephemeral: true
                });

            } catch (error) {
                console.error('Erro no painel de call:', error);

                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: '❌ Não consegui verificar sua call. Tente novamente.',
                        ephemeral: true
                    });
                }
            }

            return;
        }
    }

    // Comandos slash
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error('Erro no comando:', error);

        const resposta = {
            content: '❌ Houve um erro ao executar esse comando!',
            ephemeral: true
        };

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(resposta);
        } else {
            await interaction.reply(resposta);
        }
    }
});

if (!process.env.DISCORD_TOKEN) {
    console.error('❌ Token não encontrado nas variáveis de ambiente.');
} else {
    client.login(process.env.DISCORD_TOKEN).catch(error => {
        console.error('❌ Falha ao conectar o bot:', error.message);
    });
}
