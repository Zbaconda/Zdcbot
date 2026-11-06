const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const FF = require('./freefireCore');
module.exports = {
    data: new SlashCommandBuilder().setName('wo').setDescription('Registra derrota por W.O. (administradores)')
        .addUserOption(o => o.setName('jogador').setDescription('Jogador que recebeu W.O.').setRequired(true))
        .addStringOption(o => o.setName('motivo').setDescription('Motivo do W.O.').setRequired(true)
            .addChoices(
                { name: 'Não compareceu', value: 'Não compareceu' },
                { name: 'Saiu da partida', value: 'Saiu da partida' },
                { name: 'Quebra das regras', value: 'Quebra das regras' },
                { name: 'Equipamento proibido', value: 'Equipamento proibido' }
            )),
    async execute(interaction) {
        if (!FF.isFreeFireChannel(interaction)) return interaction.reply({ content: `Use este comando em <#${FF.CHANNEL_ID}>.`, flags: MessageFlags.Ephemeral });
        if (!FF.isAdmin(interaction.member)) return interaction.reply({ content: 'Somente administradores podem usar este comando.', flags: MessageFlags.Ephemeral });
        const user = interaction.options.getUser('jogador');
        const reason = interaction.options.getString('motivo');
        const db = FF.readDB();
        const p = FF.getPlayer(db, user.id);
        p.losses++; p.wo++; p.matches++; p.streak = 0;
        p.history.unshift({ matchId: 'W.O.', result: 'Derrota por W.O.', points: 0, reason, date: new Date().toISOString() });
        p.history = p.history.slice(0,30);
        FF.saveDB(db);
        await interaction.reply({ components: [FF.makeContainer(`# W.O. REGISTRADO\n\n**Jogador:** ${user}\n**Motivo:** ${reason}\n**Sequência de vitórias:** zerada\n**Pontos:** preservados`)], flags: MessageFlags.IsComponentsV2 });
        await FF.sendLog(interaction.guild, `# W.O. REGISTRADO\n\n**Jogador:** ${user}\n**Responsável:** ${interaction.user}\n**Motivo:** ${reason}`);
    }
};
