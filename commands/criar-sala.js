// Node.js - CommonJS - discord.js v14
// Comando de criação automática de salas Free Fire

const {
    SlashCommandBuilder,
    MessageFlags
} = require('discord.js');

const FF = require('./freefireCore');

module.exports = {

    data: new SlashCommandBuilder()
        .setName('criar-sala')
        .setDescription('Cria uma sala de Free Fire e escolhe um adversário')

        .addUserOption(option => option
            .setName('adversario')
            .setDescription('Escolha quem será seu adversário')
            .setRequired(true)
        ),

    async execute(interaction) {

        // ==================================================
        // VERIFICAR CANAL
        // ==================================================

        if (!FF.isFreeFireChannel(interaction)) {
            return interaction.reply({
                content:
                    `Use este comando em <#${FF.CHANNEL_ID}>.`,

                flags: MessageFlags.Ephemeral
            });
        }

        const adversario =
            interaction.options.getUser('adversario');

        // ==================================================
        // VERIFICAR ADVERSÁRIO
        // ==================================================

        if (
            !adversario ||
            adversario.bot ||
            adversario.id === interaction.user.id
        ) {
            return interaction.reply({
                content:
                    'Escolha outro membro como seu adversário.',

                flags: MessageFlags.Ephemeral
            });
        }

        // ==================================================
        // INICIAR INTERAÇÃO
        // ==================================================

        await interaction.deferReply();

        try {

            const db = FF.readDB();

            const id = String(db.nextId++);

            // Senha automática de dois dígitos.
            const password = FF.generateRoomPassword();

            // ==================================================
            // CRIAR SALA NA NIXFF
            // ==================================================

            await interaction.editReply({
                content:
                    'Criando sua sala no Free Fire pela NixFF...'
            });

            // Somente os campos essenciais.
            // AP Padrão e mapa padrão da NixFF.
            const room = await FF.createNixRoom({

                password,

                config_type: 'ap_padrao',

                start_delay_minutes: 5

            });

            // ==================================================
            // VALIDAR RESPOSTA
            // ==================================================

            if (
                !room ||
                !room.session_id ||
                room.room_id === undefined ||
                room.room_id === null
            ) {
                throw new Error(
                    'A API NixFF não retornou os dados necessários da sala.'
                );
            }

            // ==================================================
            // REGISTRAR PARTIDA
            // ==================================================

            const match = {

                id,

                creatorId: interaction.user.id,

                // Mantidos para compatibilidade com o GO
                // que já existe no index.js.
                captain1Id: interaction.user.id,
                captain2Id: adversario.id,

                // Nome novo utilizado pelo sistema.
                adversaryId: adversario.id,

                map: 'Padrão',

                configType: 'ap_padrao',

                roomId: String(room.room_id),

                password: String(
                    room.password || password
                ),

                sessionId: room.session_id,

                inviteLink: room.invite_link || null,

                inviteCode: room.invite_code || null,

                status: 'waiting',

                confirmations: [],

                createdAt: new Date().toISOString(),

                startWarningSent: false,

                apiStatus: room.status || 'active'

            };

            db.matches[id] = match;

            FF.saveDB(db);

            // ==================================================
            // CONVITE
            // ==================================================

            const inviteLine = room.invite_link
                ? `\n**Convite:** ${room.invite_link}`
                : '';

            // ==================================================
            // PUBLICAR SALA
            // ==================================================

            await interaction.editReply({

                content: '',

                components: [
                    FF.makeContainer(

                        `# SALA FREE FIRE\n\n` +

                        `**Partida:** #${id}\n` +

                        `**ID da sala:** ${match.roomId}\n` +

                        `**Senha:** ${match.password}\n` +

                        `**Configuração:** AP Padrão\n` +

                        `**Criador:** <@${interaction.user.id}>\n` +

                        `**Adversário:** <@${adversario.id}>\n` +

                        `**Confirmações:** 0/2\n` +

                        `**Status:** Aguardando confirmação\n\n` +

                        `Somente o criador e o adversário podem enviar **GO**.` +

                        inviteLine

                    )
                ],

                flags: MessageFlags.IsComponentsV2

            });

            // ==================================================
            // REGISTRAR LOG
            // ==================================================

            await FF.sendLog(
                interaction.guild,

                `# SALA CRIADA\n\n` +

                `**Partida:** #${id}\n` +

                `**Criador:** <@${interaction.user.id}>\n` +

                `**Adversário:** <@${adversario.id}>\n` +

                `**ID da sala:** ${match.roomId}\n` +

                `**Senha:** ${match.password}\n` +

                `**Configuração:** AP Padrão\n` +

                `**Session ID:** ${match.sessionId}\n` +

                `**Status:** Aguardando GO`

            );

            // ==================================================
            // AVISO DE CONFIRMAÇÃO
            // ==================================================

            const channel = interaction.channel;

            const timer = setTimeout(async () => {

                const latest = FF.readDB();

                const current = latest.matches[id];

                if (
                    !current ||
                    current.status !== 'waiting' ||
                    current.confirmations.length > 0 ||
                    current.startWarningSent
                ) {
                    return;
                }

                current.startWarningSent = true;

                FF.saveDB(latest);

                await FF.sendContainer(
                    channel,

                    `A partida #${id} ainda não recebeu confirmações. O criador ou o adversário pode enviar **GO**.`
                );

            }, 2 * 60 * 1000);

            timer.unref?.();

            console.log(
                `[FREE FIRE] Sala ${room.room_id} criada. Partida #${id}.`
            );

        } catch (error) {

            console.error(
                'Erro ao criar sala pela API NixFF:',
                error
            );

            const detail =
                error?.publicMessage ||
                'Não foi possível criar a sala. Verifique a integração NixFF.';

            await interaction.editReply({

                content: detail,

                components: [],

                flags: MessageFlags.Ephemeral

            }).catch(() => null);

        }
    }
};
