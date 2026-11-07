// Node.js - CommonJS - discord.js v14
// Criação automática de salas Free Fire

const {
    SlashCommandBuilder,
    MessageFlags
} = require('discord.js');

const FF = require('./freefireCore');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('criar-sala')
        .setDescription('Cria uma sala de Free Fire e escolhe um adversário')
        .addUserOption(option => option
            .setName('adversario')
            .setDescription('Escolha quem será seu adversário')
            .setRequired(true)
        ),

    async execute(interaction) {
        if (!FF.isFreeFireChannel(interaction)) {
            return FF.responderContainer(
                interaction,
                `Use este comando em <#${FF.CHANNEL_ID}>.`
            );
        }

        const adversario = interaction.options.getUser('adversario');

        if (
            !adversario ||
            adversario.bot ||
            adversario.id === interaction.user.id
        ) {
            return FF.responderContainer(
                interaction,
                'Escolha outro membro como seu adversário.'
            );
        }

        await interaction.deferReply({
            flags: MessageFlags.Ephemeral
        });

        try {
            await FF.createMatch({
                guild: interaction.guild,
                channel: interaction.channel,
                creator: interaction.user,
                adversary: adversario
            });

            return interaction.editReply({
                content: '',
                components: [
                    FF.makeContainer(
                        'A sala foi criada e publicada no canal Free Fire. Os dois participantes já podem confirmar presença.'
                    )
                ],
                flags: MessageFlags.IsComponentsV2
            });
        } catch (error) {
            console.error(
                '[FREE FIRE] Erro ao criar sala pelo slash:',
                error
            );

            return interaction.editReply({
                content: '',
                components: [
                    FF.makeContainer(
                        error.publicMessage ||
                        error.message ||
                        'Não foi possível criar a sala pela NixFF.'
                    )
                ],
                flags: MessageFlags.IsComponentsV2
            });
        }
    }
};
