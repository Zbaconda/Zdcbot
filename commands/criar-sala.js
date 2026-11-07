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
        .setDescription('Cria automaticamente uma sala no Free Fire')

        .addUserOption(option => option
            .setName('capitao2')
            .setDescription('Capitão da equipe adversária')
            .setRequired(true)
        )

        .addStringOption(option => option
            .setName('modo')
            .setDescription('Formato da partida')
            .setRequired(true)

            .addChoices(
                {
                    name: '1x1',
                    value: '1x1'
                },
                {
                    name: '2x2',
                    value: '2x2'
                },
                {
                    name: '3x3',
                    value: '3x3'
                },
                {
                    name: '4x4',
                    value: '4x4'
                }
            )
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

        const captain2 =
            interaction.options.getUser('capitao2');

        const mode =
            interaction.options.getString('modo');

        // ==================================================
        // VERIFICAR ADVERSÁRIO
        // ==================================================

        if (
            captain2.bot ||
            captain2.id === interaction.user.id
        ) {
            return interaction.reply({
                content:
                    'Escolha outro membro como capitão da equipe adversária.',

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

            const room = await FF.createNixRoom({

                password,

                start_delay_minutes: 5,

                config_type: 'ap_padrao',

                room_name:
                    `Zodiaco - Partida ${id} - ${mode}`,

                map_name: 'Bermuda',

                '1500_ouro': false,

                carregamento: false

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

                captain1Id: interaction.user.id,

                captain2Id: captain2.id,

                mode,

                map: 'Bermuda',

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

                        `**Mapa:** Bermuda\n` +

                        `**Modo escolhido:** ${mode}\n` +

                        `**Capitão 1:** <@${interaction.user.id}>\n` +

                        `**Capitão 2:** <@${captain2.id}>\n` +

                        `**Status:** Aberta\n\n` +

                        `Os dois capitães devem enviar **GO** neste canal para confirmar o início.` +

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

                `**Capitães:** <@${interaction.user.id}> e <@${captain2.id}>\n` +

                `**ID da sala:** ${match.roomId}\n` +

                `**Senha:** ${match.password}\n` +

                `**Modo escolhido:** ${mode}\n` +

                `**Mapa:** Bermuda\n` +

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

                    `Nenhum capitão confirmou o início após 2 minutos. Um dos capitães pode enviar **GO** para iniciar a confirmação da partida.`
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
