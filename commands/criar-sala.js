const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const FF = require('./freefireCore');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('criar-sala')
        .setDescription('Registra uma sala e inicia as confirmações dos capitães')
        .addUserOption(o => o.setName('capitao2').setDescription('Capitão da equipe 2').setRequired(true))
        .addStringOption(o => o.setName('modo').setDescription('Formato da partida').setRequired(true)
            .addChoices(
                { name: '1x1', value: '1x1' },
                { name: '2x2', value: '2x2' },
                { name: '3x3', value: '3x3' },
                { name: '4x4', value: '4x4' }
            ))
        .addStringOption(o => o.setName('id_sala').setDescription('ID da sala do Free Fire').setRequired(true))
        .addStringOption(o => o.setName('senha').setDescription('Senha da sala').setRequired(true)),

    async execute(interaction) {
        if (!FF.isFreeFireChannel(interaction)) {
            return interaction.reply({
                content: `Use este comando em <#${FF.CHANNEL_ID}>.`,
                flags: MessageFlags.Ephemeral
            });
        }
        const captain2 = interaction.options.getUser('capitao2');
        const mode = interaction.options.getString('modo');
        const roomId = interaction.options.getString('id_sala').trim();
        const password = interaction.options.getString('senha').trim();
        if (captain2.bot || captain2.id === interaction.user.id) {
            return interaction.reply({ content: 'Escolha outro membro como capitão da equipe 2.', flags: MessageFlags.Ephemeral });
        }
        const db = FF.readDB();
        const id = String(db.nextId++);
        const match = {
            id, creatorId: interaction.user.id, captain1Id: interaction.user.id,
            captain2Id: captain2.id, mode, map: 'Bermuda',
            roomId, password, status: 'waiting', confirmations: [],
            createdAt: new Date().toISOString(), startWarningSent: false
        };
        db.matches[id] = match;
        FF.saveDB(db);
        await interaction.reply({
            components: [FF.makeContainer(
                `# SALA FREE FIRE\n\n` +
                `**ID da sala:** ${roomId}\n` +
                `**Senha:** ${password}\n` +
                `**Mapa:** Bermuda\n` +
                `**Modo:** ${mode}\n` +
                `**Capitão 1:** <@${interaction.user.id}>\n` +
                `**Capitão 2:** <@${captain2.id}>\n` +
                `**Status:** 🟢 Aguardando GO\n\n` +
                `Os dois capitães devem enviar **GO** neste canal para iniciar.`
            )],
            flags: MessageFlags.IsComponentsV2
        });
        const channel = interaction.channel;
        const timer = setTimeout(async () => {
            const latest = FF.readDB();
            const current = latest.matches[id];
            if (!current || current.status !== 'waiting' || current.confirmations.length > 0 || current.startWarningSent) return;
            current.startWarningSent = true;
            FF.saveDB(latest);
            await FF.sendContainer(channel,
                `⏳ Nenhum capitão confirmou o início da partida após 2 minutos. Você pode iniciar a partida digitando **GO** no chat!`
            );
        }, 2 * 60 * 1000);
        timer.unref?.();
        await FF.sendLog(interaction.guild,
            `# SALA CRIADA\n\n**Partida:** #${id}\n**Criador:** <@${interaction.user.id}>\n**Capitães:** <@${interaction.user.id}> e <@${captain2.id}>\n**Modo:** ${mode}\n**Mapa:** Bermuda\n**Status:** Aguardando GO`
        );
    }
};
