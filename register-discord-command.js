const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_APPLICATION_ID;
const guildId = process.env.DISCORD_GUILD_ID;

const commands = [
  new SlashCommandBuilder()
    .setName('submit')
    .setDescription('Submit a video to the tracked list')
    .addStringOption(option =>
      option.setName('url')
        .setDescription('The video URL')
        .setRequired(true)
    )
    .toJSON()
];

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('Registering slash command...');
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );
    console.log('Slash command registered!');
  } catch (error) {
    console.error(error);
  }
})(); 