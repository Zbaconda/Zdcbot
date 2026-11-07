require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { REST, Routes } = require('discord.js');

const commands = [];

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
const filePath = path.join(commandsPath, file);

try {
    const command = require(filePath);

    if (
        command &&
        command.data &&
        typeof command.data.toJSON === 'function' &&
        typeof command.execute === 'function'
    ) {
        commands.push(command.data.toJSON());
        console.log(`Comando registrado: ${command.data.name}`);
    }
} catch (error) {
    console.error(`Erro ao carregar ${file}:`, error);
}

}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
try {
console.log("Registrando ${commands.length} comando(s)...");

    const data = await rest.put(
        Routes.applicationGuildCommands(
            process.env.CLIENT_ID,
            process.env.GUILD_ID
        ),
        { body: commands }
    );

    console.log(`${data.length} comando(s) registrado(s) com sucesso!`);
} catch (error) {
    console.error('Erro ao registrar comandos:', error);
}

})();
