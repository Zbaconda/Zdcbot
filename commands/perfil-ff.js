const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const FF = require('./freefireCore');
module.exports = {
    data: new SlashCommandBuilder().setName('perfil-ff').setDescription('Mostra seu perfil de Free Fire')
        .addUserOption(o => o.setName('jogador').setDescription('Jogador para consultar').setRequired(false)),
    async execute(interaction) {
        if (!FF.isFreeFireChannel(interaction)) return interaction.reply({ content: `Use este comando em <#${FF.CHANNEL_ID}>.`, flags: MessageFlags.Ephemeral });
        const user = interaction.options.getUser('jogador') || interaction.user;
        const p = FF.getPlayer(FF.readDB(), user.id);
        const rate = p.matches ? ((p.wins / p.matches) * 100).toFixed(1) : '0.0';
        await interaction.reply({ components: [FF.makeContainer(
            `# PERFIL FREE FIRE\n\n**Jogador:** ${user}\n**Vitórias:** ${p.wins}\n**Derrotas:** ${p.losses}\n**Derrotas por W.O.:** ${p.wo}\n**Pontos:** ${p.points}\n**Sequência atual:** ${p.streak}\n**Melhor sequência:** ${p.bestStreak}\n**Partidas:** ${p.matches}\n**Taxa de vitórias:** ${rate}%`
        )], flags: MessageFlags.IsComponentsV2 });
    }
};
