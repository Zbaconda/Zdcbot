const {
    ContainerBuilder,
    TextDisplayBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    MessageFlags
} = require('discord.js');

const CARGO_GAMES = '1568363282082046083';
const CANAL_FREE_FIRE = '1568364484098269194';
const CANAL_REGISTROS = '1559889239192240128';

function container(texto) {
    return new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(texto)
    );
}

module.exports = {
    name: 'setgame',

    async handleMessage(mensagem) {
        if (mensagem.author.bot || !mensagem.guild) return false;
        if (mensagem.content.trim().toLowerCase() !== 'z?setgame') return false;

        const painel = container(
            '# GAMES\n\n' +
            'Escolha seu cargo para seu jogo abaixo.'
        );

        const menu = new StringSelectMenuBuilder()
            .setCustomId('setgame:games')
            .setPlaceholder('Escolha seu jogo')
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions({
                label: 'Free Fire',
                description: 'Receber o cargo GAMES',
                value: 'free_fire'
            });

        await mensagem.channel.send({
            components: [
                painel,
                new ActionRowBuilder().addComponents(menu)
            ],
            flags: MessageFlags.IsComponentsV2
        });

        return true;
    },

    async handleInteraction(interaction) {
        if (
            !interaction.isStringSelectMenu() ||
            interaction.customId !== 'setgame:games'
        ) return false;

        if (interaction.values[0] !== 'free_fire') {
            await interaction.reply({
                content: 'Opção inválida.',
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        await interaction.deferReply({
            flags: MessageFlags.Ephemeral
        });

        try {
            const membro = await interaction.guild.members.fetch(
                interaction.user.id
            );

            const cargo = await interaction.guild.roles.fetch(CARGO_GAMES);

            if (!cargo) {
                await interaction.editReply({
                    content: 'O cargo GAMES não foi encontrado. Avise a equipe.'
                });
                return true;
            }

            if (!membro.roles.cache.has(CARGO_GAMES)) {
                await membro.roles.add(
                    cargo,
                    'Cargo escolhido pelo painel z?setgame'
                );
            }

            await interaction.editReply({
                content: 'Você recebeu o cargo com sucesso.'
            });

            const logs = await interaction.guild.channels.fetch(
                CANAL_REGISTROS
            ).catch(() => null);

            if (logs?.isTextBased()) {
                await logs.send({
                    components: [
                        container(
                            '# CARGO GAMES ENTREGUE\n\n' +
                            `**Membro:** ${interaction.user} (\`${interaction.user.id}\`)\n` +
                            `**Jogo:** Free Fire\n` +
                            `**Cargo:** <@&${CARGO_GAMES}>\n` +
                            `**Canal de destino:** <#${CANAL_FREE_FIRE}>\n` +
                            `**Data:** <t:${Math.floor(Date.now() / 1000)}:F>`
                        )
                    ],
                    flags: MessageFlags.IsComponentsV2
                });
            }

        } catch (erro) {
            console.error('Erro no painel setgame:', erro);

            await interaction.editReply({
                content: 'Não consegui entregar o cargo. Confira a permissão Gerenciar cargos e a posição do cargo do bot.'
            });
        }

        return true;
    }
};
