const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const FF = require('./freefireCore');
module.exports = {
    data: new SlashCommandBuilder().setName('resultado').setDescription('Registra o vencedor de uma partida (administradores)')
        .addStringOption(o => o.setName('partida').setDescription('Número da partida').setRequired(true))
        .addStringOption(o => o.setName('equipe').setDescription('Equipe vencedora').setRequired(true)
            .addChoices({ name: 'Equipe 1', value: '1' }, { name: 'Equipe 2', value: '2' })),
    async execute(interaction) {
        if (!FF.isFreeFireChannel(interaction)) return interaction.reply({ content: `Use este comando em <#${FF.CHANNEL_ID}>.`, flags: MessageFlags.Ephemeral });
        if (!FF.isAdmin(interaction.member)) return interaction.reply({ content: 'Somente administradores podem registrar resultados.', flags: MessageFlags.Ephemeral });
        const id = interaction.options.getString('partida').replace(/^#/, '');
        const team = interaction.options.getString('equipe');
        const db = FF.readDB();
        const match = db.matches[id];
        if (!match || match.status === 'finished' || match.status === 'cancelled') return interaction.reply({ content: 'Partida não encontrada ou já encerrada.', flags: MessageFlags.Ephemeral });
        const winnerId = team === '1' ? match.captain1Id : match.captain2Id;
        const loserId = team === '1' ? match.captain2Id : match.captain1Id;
        const result = FF.applyWin(db, winnerId, loserId, match);
        await interaction.reply({ components: [FF.makeContainer(
            `# RESULTADO REGISTRADO\n\n**Partida:** #${id}\n**Vencedor:** <@${winnerId}>\n**Derrotado:** <@${loserId}>\n**Pontos da vitória:** +1${result.bonus ? `\n**Bônus de sequência:** +${result.bonus}` : ''}`
        )], flags: MessageFlags.IsComponentsV2 });
        await FF.sendLog(interaction.guild, `# PARTIDA FINALIZADA\n\n**Partida:** #${id}\n**Vencedor:** <@${winnerId}>\n**Derrotado:** <@${loserId}>`);
    }
};
