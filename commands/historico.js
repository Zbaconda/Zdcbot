const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const FF = require('./freefireCore');
module.exports = {
    data: new SlashCommandBuilder().setName('historico').setDescription('Mostra o histórico de partidas')
        .addUserOption(o => o.setName('jogador').setDescription('Jogador para consultar').setRequired(false)),
    async execute(interaction) {
        if (!FF.isFreeFireChannel(interaction)) return interaction.reply({ content: `Use este comando em <#${FF.CHANNEL_ID}>.`, flags: MessageFlags.Ephemeral });
        const user = interaction.options.getUser('jogador') || interaction.user;
        const p = FF.getPlayer(FF.readDB(), user.id);
        const lines = p.history.slice(0, 10).map(h => {
            const date = Math.floor(new Date(h.date).getTime()/1000);
            return `**Partida #${h.matchId}** · ${h.result} · ${h.points > 0 ? '+' : ''}${h.points} pts · <t:${date}:d>`;
        });
        await interaction.reply({ components: [FF.makeContainer(`# HISTÓRICO DE ${user.username.toUpperCase()}\n\n${lines.length ? lines.join('\n') : 'Nenhuma partida registrada ainda.'}`)], flags: MessageFlags.IsComponentsV2 });
    }
};
