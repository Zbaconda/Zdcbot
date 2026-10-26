
const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder
} = require('discord.js');

const BANNER_PAINEL_CARGOS = 'https://media.discordapp.net/attachments/1559056011375943784/1563610129893425222/file_00000000e724820e8223219b519005ff.png?ex=6ae03b29&is=6adee9a9&hm=f55a74f77676b8b748a134340e59fbd57792069df4a2285ab33abf542ef9cf45&=&format=webp&quality=lossless';

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
            

.setTitle('Cargos - Zod')
.setDescription(
  'Siga os passos abaixo para ter uma melhor experiência!\n\n' +
  '<:zodiaco:1559627194903568464> Você só pode ter um cargo por vez.\n\n' +
  '<:zodiaco:1559627194903568464> Deseja trocar de cargo? O cargo anterior será removido automaticamente.\n\n' +
  '<:zodiaco:1559627194903568464> Para escolher um cargo, você deve estar com o link do servidor na bio.'
)
.setColor(0x2b2d31)
            .setImage(BANNER_PAINEL_CARGOS);



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
        // Responder imediatamente para evitar timeout
        await interaction.deferReply({ ephemeral: true });

        try {
            const membro = interaction.member;
            const cargoEscolhido = interaction.values[0];

            // Verificar se o cargo existe nesta lista
            if (!cargos.some(cargo => cargo.value === cargoEscolhido)) {
                return interaction.editReply('❌ Cargo inválido.');
            }

            // Buscar o membro e os cargos no servidor
            const guildMember = await interaction.guild.members.fetch(
                interaction.user.id
            );

            const cargoAtual = cargos.find(cargo =>
                guildMember.roles.cache.has(cargo.value)
            );

            // Impedir selecionar novamente o mesmo cargo
            if (guildMember.roles.cache.has(cargoEscolhido)) {
                return interaction.editReply(
                    '❌ Você não pode ter esse cargo porque já possui ele!'
                );
            }

            // Remover somente o cargo anterior desta lista
            if (cargoAtual) {
                await guildMember.roles.remove(cargoAtual.value);
            }

            // Adicionar o novo cargo
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
