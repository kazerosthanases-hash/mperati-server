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

// Discord server and team role constants
const GUILD_ID = '1494996186665586750';
const TEAM_ROLES = {
  team_1: '1496226567355891903',
  team_2: '1496226835388698744',
  team_3: '1497226073472106738',
  team_4: '1497226132976828456',
};

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Ensures the discord_users table exists in Supabase.
// Uses a raw SQL RPC call so the bot can self-provision the schema on first run.
async function ensureTableExists() {
  const { error } = await supabase.rpc('create_discord_users_if_not_exists');

  if (error) {
    // If the RPC doesn't exist yet, fall back to a direct table probe and log
    // a clear message so the operator knows manual setup may be required.
    if (error.code === 'PGRST202') {
      console.warn(
        'RPC "create_discord_users_if_not_exists" not found. ' +
        'Attempting to verify table existence via a direct query...'
      );

      const { error: probeError } = await supabase
        .from('discord_users')
        .select('discord_id')
        .limit(1);

      if (probeError && probeError.code === '42P01') {
        console.error(
          'Table "discord_users" does not exist and could not be created automatically. ' +
          'Please create it manually in Supabase with columns: ' +
          'discord_id (text, primary key), username (text), ' +
          'team_1 (bool), team_2 (bool), team_3 (bool), team_4 (bool).'
        );
      } else if (!probeError) {
        console.log('Table "discord_users" already exists — no action needed.');
      }
    } else {
      console.error('Error ensuring discord_users table exists:', error.message);
    }
  } else {
    console.log('discord_users table is ready.');
  }
}

// Returns an object describing which team roles a guild member currently holds.
function getUserTeams(member) {
  const teams = {};
  for (const [teamKey, roleId] of Object.entries(TEAM_ROLES)) {
    teams[teamKey] = member.roles.cache.has(roleId);
  }
  return teams;
}

// Upserts a member's role state into the discord_users table.
async function updateUserRoles(member) {
  const teams = getUserTeams(member);

  const { error } = await supabase.from('discord_users').upsert(
    {
      discord_id: member.id,
      username: member.user.username,
      ...teams,
    },
    { onConflict: 'discord_id' }
  );

  if (error) {
    console.error(
      `Failed to upsert roles for ${member.user.username} (${member.id}):`,
      error.message
    );
  } else {
    const activeTeams = Object.entries(teams)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(', ') || 'none';
    console.log(
      `Synced ${member.user.username} (${member.id}) — teams: ${activeTeams}`
    );
  }
}

// Bot ready event
client.once('ready', async () => {
  console.log(`Bot is running as ${client.user.tag}`);
  await ensureTableExists();
});

// Fires whenever a member's roles (or other attributes) change.
// Syncs the updated role state to Supabase immediately.
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  // Only process members from the target guild
  if (newMember.guild.id !== GUILD_ID) return;

  const oldRoleIds = new Set(oldMember.roles.cache.keys());
  const newRoleIds = new Set(newMember.roles.cache.keys());
  const trackedRoleIds = new Set(Object.values(TEAM_ROLES));

  // Check whether any tracked team role was added or removed
  const roleChanged = [...trackedRoleIds].some(
    (id) => oldRoleIds.has(id) !== newRoleIds.has(id)
  );

  if (!roleChanged) return;

  console.log(
    `Role change detected for ${newMember.user.username} (${newMember.id}) — syncing...`
  );
  await updateUserRoles(newMember);
});

// Fires when the bot joins a new guild.
// Syncs all existing members so the database starts in a consistent state.
client.on('guildCreate', async (guild) => {
  if (guild.id !== GUILD_ID) return;

  console.log(`Joined guild "${guild.name}" — performing initial member sync...`);

  try {
    const members = await guild.members.fetch();
    console.log(`Syncing ${members.size} members...`);

    for (const member of members.values()) {
      if (!member.user.bot) {
        await updateUserRoles(member);
      }
    }

    console.log('Initial member sync complete.');
  } catch (err) {
    console.error('Failed to sync members on guildCreate:', err);
  }
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
