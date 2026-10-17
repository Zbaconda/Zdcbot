
require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const {
    Client,
    Collection,
    GatewayIntentBits
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');

if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath)
        .filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        try {
            const command = require(path.join(commandsPath, file));

            if (command.data && command.execute) {
                client.commands.set(command.data.name, command);
                console.log(`✅ Comando carregado: ${command.data.name}`);
            } else {
                console.log(`⚠️ ${file} precisa de data e execute.`);
            }
        } catch (error) {
            console.error(`❌ Erro ao carregar ${file}:`, error);
        }
    }
}

client.once('clientReady', readyClient => {
    console.log(`🤖 Bot online como ${readyClient.user.tag}`);
});

client.on('interactionCreate', async interaction => {
    // Menu de cargos existente
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'selecionar_cargo') {
            const command = client.commands.get('cargos');

            if (!command || typeof command.handleSelect !== 'function') {
                return interaction.reply({
                    content: '❌ A função de seleção não foi encontrada.',
                    ephemeral: true
                });
            }

            try {
                await command.handleSelect(interaction);
            } catch (error) {
                console.error('Erro no menu de cargos:', error);

                const resposta = {
                    content: '❌ Ocorreu um erro ao selecionar o cargo.',
                    ephemeral: true
                };

                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(resposta);
                } else {
                    await interaction.reply(resposta);
                }
            }

            return;
        }

        // Menu de ferramentas de call
        if (interaction.customId === 'controle_call') {
            try {
                await interaction.reply({
                    content:
                        `🔧 Você selecionou **${interaction.values[0].replace(/_/g, ' ')}**.\n\n` +
                        '⚠️ Esta ferramenta ainda está sendo configurada.',
                    ephemeral: true
                });
            } catch (error) {
                console.error('Erro no painel de call:', error);
            }

            return;
        }
    }

    // Outros componentes ainda não configurados
    if (!interaction.isChatInputCommand()) return;

    // Comandos slash
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error('Erro no comando:', error);

        const resposta = {
            content: '❌ Houve um erro ao executar esse comando!',
            ephemeral: true
        };

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(resposta);
        } else {
            await interaction.reply(resposta);
        }
    }
});

if (!process.env.DISCORD_TOKEN) {
    console.error('❌ Token não encontrado nas variáveis de ambiente.');
} else {
    client.login(process.env.DISCORD_TOKEN).catch(error => {
        console.error('❌ Falha ao conectar o bot:', error.message);
    });
}
