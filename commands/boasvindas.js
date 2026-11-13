const {
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlags
} = require('discord.js');

// ======================================================
// CONFIGURAÇÕES
// ======================================================

const CANAL_BOAS_VINDAS_ID = '1570657702051319908';
const TEMPO_MENSAGEM = 7000; // 7 segundos

// ======================================================
// BOAS-VINDAS
// ======================================================

module.exports = {
    name: 'boasvindas',

    async handleMemberAdd(membro) {
        if (membro.user.bot) return;

        const canal = await membro.guild.channels
            .fetch(CANAL_BOAS_VINDAS_ID)
            .catch(() => null);

        if (!canal || !canal.isTextBased()) return;

        const painel = new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# <:zodiaco:1559716108292849684> Seja bem-vindo(a), ${membro}!\n` +
                `Que bom ter você na **${membro.guild.name}**. Fique à vontade!`
            )
        );

        const mensagem = await canal.send({
            components: [painel],
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { users: [membro.id] }
        }).catch(erro => {
            console.error('Erro ao enviar boas-vindas:', erro);
            return null;
        });

        if (!mensagem) return;

        setTimeout(() => {
            mensagem.delete().catch(() => null);
        }, TEMPO_MENSAGEM);
    }
};
