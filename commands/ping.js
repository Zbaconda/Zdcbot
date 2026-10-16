const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Responde com Pong! e mostra a latência do bot'),

    async execute(interaction) {
        const { resource } = await interaction.reply({ content: '🏓 Calculando...', withResponse: true });
        const latency = resource.message.createdTimestamp - interaction.createdTimestamp;
        await interaction.editReply(`🏓 Pong! Latência: **${latency}ms** | API: **${interaction.client.ws.ping}ms**`);
    },
};
