const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const FF = require('./freefireCore');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('criar-sala')
        .setDescription('Organiza uma partida de Free Fire 4v4')
        .addUserOption(option =>
            option
                .setName('adversario')
                .setDescription('Escolha o adversário')
                .setRequired(true)
        ),

    async execute(interaction) {
        if (!FF.isFreeFireChannel(interaction)) {
            return interaction.reply({
                content: `Utilize este comando em <#${FF.CHANNEL_ID}>.`,
                flags: MessageFlags.Ephemeral
            });
        }

        const adversario = interaction.options.getUser('adversario');

        if (
            adversario.bot ||
            adversario.id === interaction.user.id
        ) {
            return interaction.reply({
                content: 'Escolha outro membro como adversário.',
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply();

        try {
            const db = FF.readDB();
            const id = String(db.nextId++);

            const partida = {
                id,
                creatorId: interaction.user.id,
                captain1Id: interaction.user.id,
                captain2Id: adversario.id,
                mode: '4v4',
                roomId: null,
                password: null,
                sessionId: null,
                status: 'waiting',
                confirmations: [],
                createdAt: new Date().toISOString(),
                startWarningSent: false
            };

            db.matches[id] = partida;
            FF.saveDB(db);

            await interaction.editReply({
                components: [
                    FF.makeContainer(
                        `# PARTIDA FREE FIRE\n\n` +
                        `**Partida:** #${id}\n` +
                        `**Formato:** 4v4\n\n` +
                        `**Jogador 1:** <@${interaction.user.id}>\n` +
                        `**Adversário:** <@${adversario.id}>\n\n` +
                        `**Confirmações:** 0/2\n` +
                        `**Status:** Aguardando confirmação\n\n` +
                        `Somente os dois participantes podem enviar **GO**.\n\n` +
                        `Esta versão organiza a partida no Discord. Ela não cria uma sala real no Free Fire nem gera ID ou senha do jogo.`
                    )
                ],
                flags: MessageFlags.IsComponentsV2
            });

            await FF.sendLog(
                interaction.guild,
                `# PARTIDA REGISTRADA\n\n` +
                `**Partida:** #${id}\n` +
                `**Formato:** 4v4\n` +
                `**Criador:** <@${interaction.user.id}>\n` +
                `**Adversário:** <@${adversario.id}>\n` +
                `**Status:** Aguardando GO`
            );

            const channel = interaction.channel;

            const timer = setTimeout(async () => {
                const latest = FF.readDB();
                const current = latest.matches[id];

                if (
                    !current ||
                    current.status !== 'waiting' ||
                    current.confirmations.length > 0 ||
                    current.startWarningSent
                ) {
                    return;
                }

                current.startWarningSent = true;
                FF.saveDB(latest);

                await FF.sendContainer(
                    channel,
                    `Nenhum participante confirmou a partida #${id} após 2 minutos. Os dois jogadores ainda podem enviar **GO**.`
                );
            }, 120000);

            timer.unref?.();

        } catch (error) {
            console.error('Erro ao registrar partida:', error);

            await interaction.editReply({
                content: 'Não foi possível registrar a partida.',
                components: []
            }).catch(() => null);
        }
    }
};
