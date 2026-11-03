const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags
} = require('discord.js');

const BANNER_BOOSTER = 'https://media.discordapp.net/attachments/1559056011375943784/1563610099312885830/file_000000002f8c820eb8fb0bc9360e3e3c.png?ex=6ae03b22&is=6adee9a2&hm=0b3f68bfacb28abac58be9907d66b2ffca838f1885b61ea9607005dcae5235c1&=&format=webp&quality=lossless';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('booster')
        .setDescription('Veja as vantagens de impulsionar a Zodíaco'),

    async execute(interaction) {
        const painel = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    '<:pureza_b:1565855574514475159> **VANTAGENS BOOSTERS**\n\n' +
                    'Impulsione nosso servidor e ajude a comunidade a crescer, garantindo benefícios exclusivos como forma de agradecimento pelo seu apoio. Confira as vantagens disponíveis para cada nível! <:a_whitedvils1113:1566811961629343774>\n\n' +
                    '**1 IMPULSO** <:zodiaco:1559716108292849684>\n\n' +
                    '> Cargo exclusivo Booster\n> Permissão para alterar apelidos\n> Permissão para silenciar membros\n\n' +
                    '**2 IMPULSOS** <:zodiaco:1559716108292849684>\n\n' +
                    '> Cargo personalizado\n> Canal de voz personalizado\n> Acesso ao registro de auditoria\n\n' +
                    '<:pureza_i:1565855578247397456> <:pureza_i:1565855578247397456> <:pureza_i:1565855578247397456>\n\n' +
                    'Agradecemos a cada pessoa que fortalece nosso servidor. Seu apoio faz a diferença e nos ajuda a tornar a Zodiaco um lugar cada vez melhor!'
                )
            )
            .addSeparatorComponents(new SeparatorBuilder())
            .addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL(BANNER_BOOSTER)
                )
            );

        return interaction.reply({
            components: [painel],
            flags: MessageFlags.IsComponentsV2
        });
    }
};
