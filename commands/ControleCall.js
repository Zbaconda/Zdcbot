
const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    PermissionFlagsBits
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('controlecall')
        .setDescription('Publica o painel de ferramentas de call')
        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        ),

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(
            PermissionFlagsBits.Administrator
        )) {
            return interaction.reply({
                content: '❌ Somente administradores podem publicar este painel.',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('🔊 FERRAMENTAS DE CALL')
            .setDescription(
                '**Precisa gerenciar sua call?**\n\n' +
                'Selecione uma ferramenta no menu abaixo para utilizar os recursos de voz da Zodíaco.\n\n' +
                '🔹 **Criar call:** crie sua própria call.\n' +
                '🔹 **Privar call:** controle quem pode entrar.\n' +
                '🔹 **Quantidade:** defina o limite de pessoas.\n' +
                '🔹 **Mover:** mova um membro ou entre em outra call.\n' +
                '🔹 **Desmutar:** permita que um membro volte a falar, conforme as permissões.\n' +
                '🔹 **Mutar:** ferramenta exclusiva para Boosters.\n\n' +
                '**⏱️ Tempo de espera**\n' +
                '• Membros: 60 segundos.\n' +
                '• Boosters: 40 segundos.\n' +
                '• Criar call e privar call: sem espera.\n\n' +
                'Utilize as ferramentas com responsabilidade! <a:zodiaco:1559734585347145840>'
            )
            .setColor(0x2b2d31);

        const menu = new StringSelectMenuBuilder()
            .setCustomId('controle_call')
            .setPlaceholder('Selecione uma ferramenta...')
            .addOptions(
                {
                    label: 'Criar call',
                    description: 'Crie uma call',
                    value: 'criar_call',
                    emoji: '🔊'
                },
                {
                    label: 'Privar call',
                    description: 'Controle o acesso à call',
                    value: 'privar_call',
                    emoji: '🔒'
                },
                {
                    label: 'Quantidade',
                    description: 'Defina o limite de membros',
                    value: 'quantidade',
                    emoji: '👥'
                },
                {
                    label: 'Mover',
                    description: 'Mova um membro entre calls',
                    value: 'mover',
                    emoji: '↔️'
                },
                {
                    label: 'Desmutar',
                    description: 'Permita que alguém volte a falar',
                    value: 'desmutar',
                    emoji: '🎙️'
                },
                {
                    label: 'Mutar (Booster)',
                    description: 'Ferramenta exclusiva para Boosters',
                    value: 'mutar',
                    emoji: '🔇'
                }
            );

        const row = new ActionRowBuilder().addComponents(menu);

        await interaction.reply({
            embeds: [embed],
            components: [row]
        });
    }
};
