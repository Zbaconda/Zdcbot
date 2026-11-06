const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const FF = require('./freefireCore');
module.exports = {
    data: new SlashCommandBuilder().setName('ranking').setDescription('Mostra o ranking de Free Fire'),
    async execute(interaction) {
        if (!FF.isFreeFireChannel(interaction)) return interaction.reply({ content: `Use este comando em <#${FF.CHANNEL_ID}>.`, flags: MessageFlags.Ephemeral });
        const db = FF.readDB();
        const rows = Object.entries(db.players).sort((a,b) => b[1].points - a[1].points || b[1].wins - a[1].wins).slice(0, 10);
        const lines = rows.length ? rows.map(([id,p],i) => `**${i+1}.** <@${id}> — **${p.points} pts** · ${p.wins} vitórias`).join('\n') : 'Ainda não há jogadores no ranking.';
        await interaction.reply({ components: [FF.makeContainer(`# RANKING FREE FIRE\n\n${lines}`)], flags: MessageFlags.IsComponentsV2 });
    }
};
