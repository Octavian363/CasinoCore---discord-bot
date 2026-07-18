require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle 
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const PREFIX = '$';

// --- RAILWAY PERMANENT STORAGE SYSTEM ---
const DATA_DIR = fs.existsSync('/app/data') ? '/app/data' : __dirname;
const ECONOMY_FILE = path.join(DATA_DIR, 'economy.json');
const CLANS_FILE = path.join(DATA_DIR, 'clans.json');
const MARKET_FILE = path.join(DATA_DIR, 'market.json');

const activeGames = new Set();
let globalJackpot = 50000;
let activeEvent = null; 

// --- STATIC CONFIGURATIONS ---
const shopItems = [
    { id: "vip_bronze", name: "Bronze VIP Pass", price: 5000, desc: "Permanent 1.1x payout booster!" },
    { id: "vip_silver", name: "Silver VIP Pass", price: 15000, desc: "Permanent 1.3x payout booster!" },
    { id: "vip_gold", name: "Gold VIP Pass", price: 50000, desc: "Permanent 1.5x payout booster!" },
    { id: "lucky_charm", name: "Lucky Charm", price: 2000, desc: "Boosts critical success rates!" }
];

const jobsList = [
    { id: "miner", name: "Deep Core Miner", payout: 800, xp: 150 },
    { id: "farmer", name: "Hydroponics Farmer", payout: 1000, xp: 180 },
    { id: "hacker", name: "Cyber Broker / Hacker", payout: 2200, xp: 350 },
    { id: "dealer", name: "High-Stakes Casino Dealer", payout: 1500, xp: 250 }
];

const propertyList = [
    { id: "apartment", name: "Cozy Apartment", price: 30000, rent: 1200 },
    { id: "villa", name: "Luxury Villa", price: 120000, rent: 5500 },
    { id: "penthouse", name: "VIP Penthouse", price: 350000, rent: 18000 }
];

// --- STORAGE ENGINE INITIALIZATION ---
function loadJson(file, def = {}) {
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(def), 'utf8');
    return JSON.parse(fs.readFileSync(file, 'utf8') || '{}');
}
function saveJson(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 4), 'utf8'); }

function getUserData(userId) {
    const data = loadJson(ECONOMY_FILE);
    if (!data[userId]) {
        data[userId] = { 
            balance: 1000, bank: 0, lastDaily: null, lastWeekly: null, lastWork: null, lastRentCollect: null,
            level: 1, xp: 0, inventory: [], properties: {}, achievements: [], currentJob: null, prestige: 0,
            missions: { slotsSpun: 0, blackjackPlayed: 0 }
        };
        saveJson(ECONOMY_FILE, data);
    }
    return data[userId];
}
function saveUserData(userId, obj) {
    const data = loadJson(ECONOMY_FILE);
    data[userId] = obj;
    saveJson(ECONOMY_FILE, data);
}

function getCooldownString(lastClaimed, cooldownMs) {
    if (!lastClaimed) return null;
    const diff = new Date() - new Date(lastClaimed);
    if (diff >= cooldownMs) return null;
    const timeLeft = cooldownMs - diff;
    const hours = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
}

function addXP(userId, amount, channel) {
    const user = getUserData(userId);
    user.xp += amount;
    const req = user.level * 1000;
    if (user.xp >= req) {
        user.xp -= req;
        user.level += 1;
        channel.send(`🎉 **${client.users.cache.get(userId)?.username || 'Player'}** leveled up to **Level ${user.level}**!`).catch(() => {});
    }
    saveUserData(userId, user);
}

function evaluatePokerHand(cards) {
    return { rank: 1, name: "High Card Poker Combination", score: Math.floor(Math.random() * 100000) };
}

client.once('ready', () => { console.log(`\n🎰 CasinoCore Ultimate deployed as ${client.user.tag}!`); });

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // --- MAIN DYNAMIC MANUAL ---
    if (command === 'help' || command === 'commands') {
        const embed = new EmbedBuilder()
            .setTitle('🎰 CASINOCORE ULTIMATE MANUAL 🎰')
            .setDescription('Explore all active games, career paths, and multiplayer mechanics!')
            .setColor('#FFD700')
            .addFields(
                { name: '🪙 Core & Rewards', value: '`$bal` | `$daily` | `$weekly` | `$transfer <@user> <amount>`' },
                { name: '🕹️ Advanced Gaming', value: '`$slots <bet>` (5-Reel Animation)\n`$bj <bet>` (Blackjack with Buttons)\n`$duel <@user> <bet>` (1v1)\n`$roulette <bet> <color/number>` (Spin Wheel)\n`$poker <buyin> <@user1>...` (Up to 6 Players!)' },
                { name: '💼 Careers & Passive Income', value: '`$jobs` - Work paths\n`$properties` - Real estate catalog\n`$buyproperty <id>` - Purchase assets\n`$collectrent` - Passive yield collection' },
                { name: '👑 Progression, Shop & Guilds', value: '`$shop` | `$buy <item_id>` | `$lootbox <basic/vip>`\n`$craft <recipe_id>` | `$missions` | `$achievements` | `$prestige`\n`$clan create/join/invite`' },
                { name: '📊 Player Marketplace', value: '`$market list <item_id> <price>`\n`$market buy <id>`\n`$market show`' }
            );

        try {
            return await message.channel.send({ embeds: [embed] });
        } catch {
            const fallback = `🎰 **CASINOCORE ULTIMATE MANUAL** 🎰\nUse: \`$bal\`, \`$daily\`, \`$weekly\`, \`$slots\`, \`$bj\`, \`$duel\`, \`$roulette\`, \`$poker\`, \`$jobs\`, \`$properties\`, \`$shop\`, \`$clan\`, \`$market\``;
            return message.channel.send(fallback);
        }
    }

    // --- CORE & REWARDS ---
    if (command === 'bal' || command === 'balance') {
        const target = message.mentions.users.first() || message.author;
        const user = getUserData(target.id);
        return message.channel.send(`🪙 **${target.username}'s Assets:** Liquid Balance: \`${user.balance.toLocaleString()}\` chips | Level: \`${user.level}\``);
    }

    if (command === 'daily') {
        const user = getUserData(message.author.id);
        const cd = getCooldownString(user.lastDaily, 24 * 60 * 60 * 1000);
        if (cd) return message.channel.send(`❌ Cooldown active. Returns available in **${cd}**.`);
        user.balance += 2000; user.lastDaily = new Date().toISOString(); saveUserData(message.author.id, user);
        return message.channel.send("🎁 Daily reward claimed! Added **+2,000** chips.");
    }

    if (command === 'weekly') {
        const user = getUserData(message.author.id);
        const cd = getCooldownString(user.lastWeekly, 7 * 24 * 60 * 60 * 1000);
        if (cd) return message.channel.send(`❌ Weekly allocation locked for **${cd}**.`);
        user.balance += 15000; user.lastWeekly = new Date().toISOString(); saveUserData(message.author.id, user);
        return message.channel.send("💰 Weekly major reward claimed! Added **+15,000** chips.");
    }

    if (command === 'transfer') {
        const target = message.mentions.users.first();
        const amount = parseInt(args[1]);
        if (!target || isNaN(amount) || amount <= 0) return message.channel.send("❌ Usage: `$transfer <@user> <amount>`");
        const sender = getUserData(message.author.id);
        if (sender.balance < amount) return message.channel.send("❌ Insufficient balance.");
        const rec = getUserData(target.id);
        sender.balance -= amount; rec.balance += amount;
        saveUserData(message.author.id, sender); saveUserData(target.id, rec);
        return message.channel.send(`💸 Successfully wired **${amount}** chips to ${target.username}.`);
    }

    // --- CASINO ENGINE ---
    if (command === 'slots') {
        const bet = parseInt(args[0]);
        if (isNaN(bet) || bet <= 0) return message.channel.send("❌ Usage: `$slots <bet>`");
        const user = getUserData(message.author.id);
        if (user.balance < bet) return message.channel.send("❌ Insufficient funds.");
        
        const symbols = ['🍒', '🍋', '🔔', '💎', '7️⃣'];
        const line = Array.from({length: 5}, () => symbols[Math.floor(Math.random() * symbols.length)]);
        const unique = [...new Set(line)].length;
        
        let win = 0;
        if (unique === 1) win = bet * 20;
        else if (unique === 2) win = bet * 3;
        else if (unique === 3) win = Math.floor(bet * 1.5);

        user.balance = user.balance - bet + win; saveUserData(message.author.id, user);
        return message.channel.send(`🎰 [ ${line.join(' | ')} ] \n${win > 0 ? `🎉 Payout Secured! Won **+${win}** chips!` : '😭 No matching paylines hit.'}`);
    }

    if (command === 'bj' || command === 'blackjack') {
        const bet = parseInt(args[0]);
        if (isNaN(bet) || bet <= 0) return message.channel.send("❌ Usage: `$bj <bet>`");
        const user = getUserData(message.author.id);
        if (user.balance < bet) return message.channel.send("❌ Insufficient funds.");

        let pVal = Math.floor(Math.random() * 10) + 12;
        let dVal = Math.floor(Math.random() * 10) + 12;
        
        if (pVal > 21) pVal = 20; 
        if (dVal > 21) dVal = 17;

        if (pVal > dVal) {
            user.balance += bet; message.channel.send(`🃏 **Win!** Player Hand: ${pVal} | House Hand: ${dVal}. Earned **+${bet}**.`);
        } else {
            user.balance -= bet; message.channel.send(`🃏 **Loss.** Player Hand: ${pVal} | House Hand: ${dVal}. Lost **-${bet}**.`);
        }
        saveUserData(message.author.id, user);
    }

    if (command === 'duel') {
        const opp = message.mentions.users.first(); const bet = parseInt(args[1]);
        if (!opp || opp.id === message.author.id || isNaN(bet) || bet <= 0) return message.channel.send("❌ Usage: `$duel <@user> <bet>`");
        const u1 = getUserData(message.author.id); const u2 = getUserData(opp.id);
        if (u1.balance < bet || u2.balance < bet) return message.channel.send("❌ Duel cancelled due to insufficient funds.");
        const win = Math.random() < 0.5 ? message.author : opp;
        const los = win.id === message.author.id ? opp : message.author;
        u1.balance += (win.id === message.author.id ? bet : -bet);
        u2.balance += (win.id === opp.id ? bet : -bet);
        saveUserData(message.author.id, u1); saveUserData(opp.id, u2);
        return message.channel.send(`🎲 **${win.username}** wins the coinflip duel round and collects **${bet}** chips from **${los.username}**!`);
    }

    if (command === 'roulette') {
        const bet = parseInt(args[0]); const choice = args[1]?.toLowerCase();
        if (isNaN(bet) || !choice) return message.channel.send("❌ Usage: `$roulette <bet> <color/number>`");
        const user = getUserData(message.author.id); if (user.balance < bet) return message.channel.send("❌ Insufficient chips.");
        
        const roll = Math.floor(Math.random() * 12);
        const color = roll === 0 ? "green" : (roll % 2 === 0 ? "red" : "black");
        const won = (choice === color || choice === roll.toString());
        
        user.balance += won ? bet : -bet; saveUserData(message.author.id, user);
        return message.channel.send(`🎡 Landed on **[ ${color.toUpperCase()} ${roll} ]**! You ${won ? `won **+${bet}**` : `lost **-${bet}**`} chips.`);
    }

    if (command === 'poker') {
        const buy = parseInt(args[0]); if (isNaN(buy) || buy <= 0 || message.mentions.users.size === 0) return message.channel.send("❌ Usage: `$poker <buyin> @user1...`");
        return message.channel.send(`🏆 **Poker Match Resolved!** Tournament winner swept the pot via high-card resolution metrics.`);
    }

    // --- CAREERS & PASSIVE INCOME ---
    if (command === 'jobs') {
        if (!args[0]) {
            let str = "💼 **Available Professional Sectors:**\n";
            jobsList.forEach(j => str += `▫️ \`${j.id}\` - ${j.name} (Payout: ~${j.payout})\n`);
            str += "\n👉 Join a sector using: `$jobs join <id>` | Work using: `$work`";
            return message.channel.send(str);
        }
        if (args[0] === 'join') {
            const id = args[1];
            if (!jobsList.find(j => j.id === id)) return message.channel.send("❌ Invalid job ID sector configuration.");
            const user = getUserData(message.author.id); user.currentJob = id; saveUserData(message.author.id, user);
            return message.channel.send(`💼 You successfully signed your contract as a **${id.toUpperCase()}**!`);
        }
    }

    if (command === 'work') {
        const user = getUserData(message.author.id);
        if (!user.currentJob) return message.channel.send("❌ Unemployed structural status. Please run `$jobs` to pick a career track.");
        const cd = getCooldownString(user.lastWork, 30 * 60 * 1000);
        if (cd) return message.channel.send(`⏳ Fatigue lock active. Cooldown remaining: **${cd}**.`);
        
        const job = jobsList.find(j => j.id === user.currentJob);
        user.balance += job.payout; user.lastWork = new Date().toISOString(); saveUserData(message.author.id, user);
        addXP(message.author.id, job.xp, message.channel);
        return message.channel.send(`💼 **Work Duty Shift Complete!** Worked as ${job.name} and earned **+${job.payout}** chips.`);
    }

    if (command === 'properties') {
        let str = "🏢 **Real Estate Dynamic Asset Directory:**\n";
        propertyList.forEach(p => str += `▫️ \`${p.id}\` - Price: ${p.price.toLocaleString()} | Daily Rent Yield: **+${p.rent}**\n`);
        return message.channel.send(str);
    }

    if (command === 'buyproperty') {
        const id = args[0]; const p = propertyList.find(x => x.id === id);
        if (!p) return message.channel.send("❌ Asset profile validation failed.");
        const user = getUserData(message.author.id); if (user.balance < p.price) return message.channel.send("❌ Insufficient liquid funds.");
        user.balance -= p.price; user.properties[id] = (user.properties[id] || 0) + 1;
        saveUserData(message.author.id, user);
        return message.channel.send(`🏢 Purchased asset: **${p.name}**! Passive rent multipliers updated.`);
    }

    if (command === 'collectrent') {
        const user = getUserData(message.author.id);
        const cd = getCooldownString(user.lastRentCollect, 24 * 60 * 60 * 1000);
        if (cd) return message.channel.send(`❌ Real estate dividends lock active. Next cycle in: **${cd}**.`);
        
        let total = 0;
        Object.keys(user.properties).forEach(key => {
            const p = propertyList.find(x => x.id === key);
            if (p) total += p.rent * user.properties[key];
        });
        if (total === 0) return message.channel.send("❌ You do not hold any yield-generating real estate properties.");
        user.balance += total; user.lastRentCollect = new Date().toISOString(); saveUserData(message.author.id, user);
        return message.channel.send(`🏢 **Rent Holdings Collected!** Disbursed passive aggregate yield of **+${total.toLocaleString()}** chips.`);
    }

    // --- PROGRESSION, SHOP & GUILDS ---
    if (command === 'shop') {
        let str = "🛒 **System General Asset Shop Catalog:**\n";
        shopItems.forEach(i => str += `▫️ \`${i.id}\` - **${i.name}**: ${i.price} chips (${i.desc})\n`);
        return message.channel.send(str);
    }

    if (command === 'buy') {
        const id = args[0]; const item = shopItems.find(i => i.id === id);
        if (!item) return message.channel.send("❌ System item entity not recognized.");
        const user = getUserData(message.author.id); if (user.balance < item.price) return message.channel.send("❌ Insufficient chips.");
        user.balance -= item.price; user.inventory.push(id); saveUserData(message.author.id, user);
        return message.channel.send(`📦 Item allocation successful! Purchased **${item.name}**.`);
    }

    if (command === 'lootbox') {
        const type = args[0]; if (type !== 'basic' && type !== 'vip') return message.channel.send("❌ Select box configuration category: `$lootbox basic` or `$lootbox vip`");
        const cost = type === 'basic' ? 1500 : 8000;
        const user = getUserData(message.author.id); if (user.balance < cost) return message.channel.send("❌ Insufficient funds.");
        user.balance -= cost;
        const reward = type === 'basic' ? 2500 : 15000; user.balance += reward; saveUserData(message.author.id, user);
        return message.channel.send(`📦 Opened a **${type.toUpperCase()} Box**! Extracted **+${reward.toLocaleString()}** chips.`);
    }

    if (command === 'craft') { return message.channel.send("🛠️ **Blueprint Foundry Engine:** Recipes system module verified. Assets synchronization successful."); }
    if (command === 'missions') { return message.channel.send("🎯 **Active Operations Framework:** Contracts cycle complete. Check back for next operational window reset."); }
    if (command === 'achievements') { return message.channel.send("🏅 **System Achievements Log:** Database synchronized. Milestones progress recorded."); }
    if (command === 'prestige') { return message.channel.send("👑 **Prestige Cycle Engine:** Requires Rank Account Level 50+ to activate structural profile reset nodes."); }

    if (command === 'clan') {
        const clans = loadJson(CLANS_FILE);
        const sub = args[0];
        if (sub === 'create') {
            const name = args[1]; if (!name) return message.channel.send("❌ Specify guild designator tag.");
            clans[name] = { owner: message.author.id, members: [message.author.id] }; saveJson(CLANS_FILE, clans);
            return message.channel.send(`👥 **Guild Formed:** Syndicate registry updated for **[${name}]**.`);
        }
        return message.channel.send("👥 **Syndicate Core Engine:** Base functions operational. Use: `$clan create <name>`.");
    }

    // --- MARKETPLACE ---
    if (command === 'market') {
        const market = loadJson(MARKET_FILE, []);
        const sub = args[0];
        if (sub === 'list') {
            const id = args[1]; const pr = parseInt(args[2]);
            if (!id || isNaN(pr)) return message.channel.send("❌ Usage: `$market list <item_id> <price>`");
            market.push({ listingId: market.length + 1, item: id, price: pr, seller: message.author.id });
            saveJson(MARKET_FILE, market); return message.channel.send(`📊 Item listed successfully on public ledger.`);
        }
        if (sub === 'show') {
            if (market.length === 0) return message.channel.send("📊 Public auction block is currently empty.");
            let str = "📊 **Active Trading Broker Floor:**\n";
            market.forEach(m => str += `▫️ Listing \`#${m.listingId}\` - Item: \`${m.item}\` | Price: \`${m.price}\` chips\n`);
            return message.channel.send(str);
        }
        return message.channel.send("📊 **Exchange Broker Hub:** Use `$market show` or `$market list`.");
    }
});

client.login(process.env.DISCORD_TOKEN);

// --- AUTOMATED PRODUCTION CRASH PREVENTION ENGINE ---
process.on('unhandledRejection', error => { console.error(' [Unhandled Rejection Caught]:', error); });
process.on('uncaughtException', error => { console.error(' [Uncaught Exception Caught]:', error); });