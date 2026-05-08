const { Client, GatewayIntentBits } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

// Validate required environment variables
const { DISCORD_BOT_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;

if (!DISCORD_BOT_TOKEN) {
  console.error('Missing required environment variable: DISCORD_BOT_TOKEN');
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing required environment variables: SUPABASE_URL and/or SUPABASE_ANON_KEY');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Bot ready event
client.once('ready', () => {
  console.log(`Bot is running as ${client.user.tag}`);
});

// Message handler
client.on('messageCreate', async (message) => {
  // Ignore messages from bots
  if (message.author.bot) return;

  // Simple acknowledgment — extend this with your own commands
  if (message.content === '!ping') {
    await message.reply('Pong!');
  }
});

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down...');
  client.destroy();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Log in to Discord
client.login(DISCORD_BOT_TOKEN).catch((err) => {
  console.error('Failed to log in to Discord:', err);
  process.exit(1);
});
