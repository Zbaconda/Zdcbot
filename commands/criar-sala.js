const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const FF = require('./freefireCore');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('criar-sala')
        .setDescription('Cria automaticamente uma sala no Free Fire')
        .addUserOption(o => o
            .setName('capitao2')
            .setDescription('Capitão da equipe adversária')
            .setRequired(true))
        .addStringOption(o => o
            .setName('modo')
            .setDescription('Formato da partida')
            .setRequired(true)
            .addChoices(
                { name: '1x1', value: '1x1' },
                { name: '2x2', value: '2x2' },
                { name: '3x3', value: '3x3' },
                { name: '4x4', value: '4x4' }
            )),

    async execute(interaction) {
        if (!FF.isFreeFireChannel(interaction)) {
            return interaction.reply({
                content: `Use este comando em <#${FF.CHANNEL_ID}>.`,
                flags: MessageFlags.Ephemeral
            });
        }

        const captain2 = interaction.options.getUser('capitao2');
        const mode = interaction.options.getString('modo');

        if (captain2.bot || captain2.id === interaction.user.id) {
            return interaction.reply({
                content: 'Escolha outro membro como capitão da equipe adversária.',
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply();

        try {
            const db = FF.readDB();
            const id = String(db.nextId++);
            const password = FF.generateRoomPassword();

            // A API NixFF não oferece um campo específico para 1x1/2x2/3x3/4x4.
            // O formato escolhido fica registrado e exibido no Discord.
            const room = await FF.createNixRoom({
                password,
                start_delay_minutes: 10,
                config_type: 'ap_padrao',
                room_name: `Zodiaco - Partida ${id} - ${mode}`,
                map_name: 'Bermuda'
            });

            if (!room?.session_id || room.room_id === undefined || room.room_id === null) {
                throw new Error('A API NixFF respondeu sem session_id ou room_id.');
            }

            const match = {
                id,
                creatorId: interaction.user.id,
                captain1Id: interaction.user.id,
                captain2Id: captain2.id,
                mode,
                map: 'Bermuda',
                roomId: String(room.room_id),
                password: room.password || password,
                sessionId: room.session_id,
                inviteLink: room.invite_link || null,
                inviteCode: room.invite_code || null,
                status: 'waiting',
                confirmations: [],
                createdAt: new Date().toISOString(),
                startWarningSent: false,
                apiStatus: room.status || 'active'
            };

            db.matches[id] = match;
            FF.saveDB(db);

            const inviteLine = room.invite_link
                ? `\n**Convite:** ${room.invite_link}`
                : '';

            await interaction.editReply({
                components: [FF.makeContainer(
                    `# SALA FREE FIRE\n\n` +
                    `**ID da sala:** ${match.roomId}\n` +
                    `**Senha:** ${match.password}\n` +
                    `**Mapa:** Bermuda\n` +
                    `**Modo escolhido:** ${mode}\n` +
                    `**Capitão 1:** <@${interaction.user.id}>\n` +
                    `**Capitão 2:** <@${captain2.id}>\n` +
                    `**Status:** Aberta\n\n` +
                    `Os capitães devem enviar **GO** neste canal para iniciar.` +
                    inviteLine
                )],
                flags: MessageFlags.IsComponentsV2
            });

            await FF.sendLog(interaction.guild,
                `# SALA CRIADA\n\n` +
                `**Partida:** #${id}\n` +
                `**Criador:** <@${interaction.user.id}>\n` +
                `**Capitães:** <@${interaction.user.id}> e <@${captain2.id}>\n` +
                `**ID da sala:** ${match.roomId}\n` +
                `**Modo escolhido:** ${mode}\n` +
                `**Mapa:** Bermuda\n` +
                `**Status:** Aguardando GO`
            );

            const channel = interaction.channel;
            const timer = setTimeout(async () => {
                const latest = FF.readDB();
                const current = latest.matches[id];
                if (!current || current.status !== 'waiting' || current.confirmations.length > 0 || current.startWarningSent) return;
                current.startWarningSent = true;
                FF.saveDB(latest);
                await FF.sendContainer(channel,
                    `Nenhum capitão confirmou o início após 2 minutos. Um dos capitães pode enviar **GO** para iniciar a sala.`
                );
            }, 2 * 60 * 1000);
            timer.unref?.();
        } catch (error) {
            console.error('Erro ao criar sala pela API NixFF:', error);
            const detail = error?.publicMessage || 'Não foi possível criar a sala agora. Verifique o token NixFF e tente novamente em instantes.';
            await interaction.editReply({
                content: detail,
                components: []
            }).catch(() => null);
        }
    }
};
