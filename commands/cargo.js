
const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder
} = require('discord.js');

const cargos = [
    { label: 'Win is win', value: '1559400783504478228' },
    { label: 'Still here', value: '1559388168413782036' },
    { label: 'The hell', value: '1559400831831248946' },
    { label: 'my boo', value: '1559391484728451143' },
    { label: 'pusheens', value: '1559400782212636774' },
    { label: 'princess', value: '1559400313897754684' },
    { label: 'cuttie', value: '1559391482408861806' },
    { label: 'bae', value: '1559400778102349846' },
    { label: 'luv', value: '1559400781554384997' },
    { label: 'suf', value: '1559400775971639386' }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cargos')
        .setDescription('Mostra o painel de cargos'),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('<:zodiaco:1559470811453333517> CARGOS')
            .setDescription(
                '**__Siga os passos abaixo para resgatar seu cargo decorativo.__**\n\n\n' +
                '* Você só pode obter um cargo por vez.\n\n' +
                '* Deseja trocar de cargo? O anterior será removido automaticamente.\n\n' +
                '* Para escolher um cargo, você deve estar com o link do servidor na bio. <a:zodiaco:1559470718142652439>'
            )
            .setColor(0x2b2d31);

        const menu = new StringSelectMenuBuilder()
            .setCustomId('selecionar_cargo')
            .setPlaceholder('Selecione um cargo...')
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(
                cargos.map(cargo => ({
                    label: cargo.label,
                    value: cargo.value
                }))
            );

        const row = new ActionRowBuilder().addComponents(menu);

        await interaction.reply({
            embeds: [embed],
            components: [row]
        });
    },

    async handleSelect(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const cargoEscolhido = interaction.values[0];

            if (!cargos.some(cargo => cargo.value === cargoEscolhido)) {
                return interaction.editReply('❌ Cargo inválido.');
            }

            const guildMember = await interaction.guild.members.fetch(
                interaction.user.id
            );

            const cargoAtual = cargos.find(cargo =>
                guildMember.roles.cache.has(cargo.value)
            );

            if (guildMember.roles.cache.has(cargoEscolhido)) {
                return interaction.editReply(
                    '❌ Você não pode ter esse cargo porque já possui ele!'
                );
            }

            if (cargoAtual) {
                await guildMember.roles.remove(cargoAtual.value);
            }

            await guildMember.roles.add(cargoEscolhido);

            const nomeCargo = cargos.find(
                cargo => cargo.value === cargoEscolhido
            ).label;

            return interaction.editReply(
                `✅ Você recebeu o cargo **${nomeCargo}**!`
            );

        } catch (error) {
            console.error('Erro ao selecionar cargo:', error);

            return interaction.editReply(
                '❌ Não consegui alterar seu cargo. Verifique se o bot tem permissão para gerenciar cargos e se o cargo do bot está acima dos cargos selecionáveis.'
            );
        }
    }
};
