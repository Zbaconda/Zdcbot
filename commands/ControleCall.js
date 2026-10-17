
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
                content: 'Somente administradores podem publicar este painel.',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('<:membros:1561108865863516232> FERRAMENTAS DE CALL')
            .setDescription(
                '**Precisa gerenciar sua call?**\n\n' +
                'Selecione uma ferramenta no menu abaixo para utilizar os recursos de voz da Zodíaco.\n\n' +
                '* **Criar call:** crie sua própria call.\n' +
                '* **Privar call (Lock):** bloqueie a entrada de outras pessoas.\n' +
                '* **Destrancar call (Unlock):** libere a entrada novamente.\n' +
                '* **Quantidade:** defina o limite de pessoas.\n' +
                '* **Mover:** mova um membro ou entre em outra call.\n' +
                '* **Desmutar:** permita que um membro volte a falar, conforme as permissões.\n' +
                '* **Mutar:** ferramenta exclusiva para Boosters.\n\n' +
                '**<:pureza_q:1561108867436257343> Tempo de espera**\n' +
                '• __Membros: 60 segundos__.\n' +
                '• __Boosters: 40 segundos__.\n' +
                '• __Criar call, Lock e Unlock__: ~~sem espera~~.\n\n' +
                'Utilize as ferramentas com responsabilidade! <:kxv:1561108869336530996>'
            )
            .setColor(0x2b2d31);

        const menu = new StringSelectMenuBuilder()
            .setCustomId('controle_call')
            .setPlaceholder('Selecione uma ferramenta...')
            .addOptions(
                {
                    label: 'Criar call',
                    description: 'Crie uma call com seu nick',
                    value: 'criar_call'
                },
                {
                    label: 'Lock (Privar call)',
                    description: 'Bloqueie a entrada de outras pessoas',
                    value: 'privar_call'
                },
                {
                    label: 'Unlock (Abrir call)',
                    description: 'Libere a entrada novamente',
                    value: 'desprivar_call'
                },
                {
                    label: 'Quantidade',
                    description: 'Defina o limite de membros',
                    value: 'quantidade'
                },
                {
                    label: 'Mover',
                    description: 'Mova um membro entre calls',
                    value: 'mover'
                },
                {
                    label: 'Desmutar',
                    description: 'Permita que alguém volte a falar',
                    value: 'desmutar'
                },
                {
                    label: 'Mutar (Booster)',
                    description: 'Ferramenta exclusiva para Boosters',
                    value: 'mutar'
                }
            );

        const row = new ActionRowBuilder().addComponents(menu);

        await interaction.reply({
            embeds: [embed],
            components: [row]
        });
    }
};
