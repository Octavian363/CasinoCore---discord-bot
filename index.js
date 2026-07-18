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

// --- CONFIGURATIONS ---
const shopItems = [
    { id: "vip_bronze", name: "Bronze VIP Pass", price: 5000, desc: "Permanent 1.1x booster!" },
    { id: "vip_silver", name: "Silver VIP Pass", price: 15000, desc: "Permanent 1.3x booster!" },
    { id: "vip_gold", name: "Gold VIP Pass", price: 50000, desc: "Permanent 1.5x booster!" }
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
    return `${Math.floor((cooldownMs - diff) / (1000 * 60 * 60))}h`;
}

function addXP(userId, amount, channel) {
    const user = getUserData(userId);
    user.xp += amount;
    if (user.xp >= user.level * 1000) {
        user.xp -= user.level * 1000;
        user.level += 1;
        channel.send(`🎉 **${client.users.cache.get(userId)?.username || 'Player'}** leveled up to **Level ${user.level}**!`).catch(() => {});
    }
    saveUserData(userId, user);
}

client.once('ready', () => { console.log(`\n🎰 CasinoCore Ultimate deployed as ${client.user.tag}!`); });

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // --- MAIN HELP UTILITY ---
    if (command === 'help' || command === 'commands') {
        const textHelp = `🎰 **CASINOCORE ULTIMATE MANUAL** 🎰\n\n` +
            `🪙 **Core & Rewards:** \`$bal\`, \`$daily\`, \`$weekly\`, \`$transfer <@user> <amount>\`\n` +
            `🕹️ **Advanced Gaming (ANIMATED):** \`$slots <bet>\`, \`$bj <bet>\`, \`$roulette <bet> <selection>\`, \`$poker <buyin> @users\`, \`$duel <@user> <bet>\`\n` +
            `💼 **Careers & Passive Income:** \`$jobs\`, \`$work\`, \`$properties\`, \`$buyproperty <id>\`, \`$collectrent\`\n` +
            `👑 **Progression & Guilds:** \`$shop\`, \`$buy <item_id>\`, \`$lootbox <basic/vip>\`, \`$clan\`\n` +
            `📊 **Marketplace:** \`$market show\`, \`$market list <id> <price>\``;
        return message.channel.send(textHelp);
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
        const target = message.mentions.users.first(); const amount = parseInt(args[1]);
        if (!target || isNaN(amount) || amount <= 0) return message.channel.send("❌ Usage: `$transfer <@user> <amount>`");
        const sender = getUserData(message.author.id); if (sender.balance < amount) return message.channel.send("❌ Insufficient balance.");
        const rec = getUserData(target.id); sender.balance -= amount; rec.balance += amount;
        saveUserData(message.author.id, sender); saveUserData(target.id, rec);
        return message.channel.send(`💸 Successfully wired **${amount}** chips to ${target.username}.`);
    }

    // --- 🎰 5-REEL ANIMATED SLOTS ENGINE ---
    if (command === 'slots') {
        const bet = parseInt(args[0]);
        if (isNaN(bet) || bet <= 0) return message.channel.send("❌ Usage: `$slots <bet>`");
        const user = getUserData(message.author.id);
        if (user.balance < bet) return message.channel.send("❌ Insufficient funds.");

        if (activeGames.has(message.author.id)) return message.channel.send("❌ Finish your current spin sequence first!");
        activeGames.add(message.author.id);

        const symbols = ['🍒', '🍋', '🍊', '🍇', '🔔', '💎', '7️⃣'];

        // Cadrul 1 de Animație
        const msg = await message.channel.send("🎰 **[ 🔄 | 🔄 | 🔄 | 🔄 | 🔄 ]** *Reels are spinning...*");

        // Cadrul 2 de Animație (După 700ms)
        await new Promise(r => setTimeout(r, 700));
        await msg.edit("🎰 **[ 🍒 | 🍋 | 🔄 | 🔄 | 🔄 ]** *Slowing down...*").catch(() => {});

        // Cadrul 3 de Animație (După încă 700ms)
        await new Promise(r => setTimeout(r, 700));
        await msg.edit("🎰 **[ 🍒 | 🍋 | 🔔 | 🔄 | 🔄 ]** *Almost stopped...*").catch(() => {});

        // Rezultatul Final
        await new Promise(r => setTimeout(r, 600));
        const line = Array.from({length: 5}, () => symbols[Math.floor(Math.random() * symbols.length)]);
        const unique = [...new Set(line)].length;
        
        let win = 0;
        if (unique === 1) win = bet * 50; // Toate 5 la fel
        else if (unique === 2) win = bet * 10; // 4 la fel
        else if (unique === 3) win = Math.floor(bet * 2); // 3 la fel

        user.balance = user.balance - bet + win;
        saveUserData(message.author.id, user);
        activeGames.delete(message.author.id);

        const resultText = win > 0 ? `🎉 **WIN!** You won **+${win.toLocaleString()}** chips!` : '😭 **LOST!** No paying combinations hit.';
        return msg.edit(`🎰 **[ ${line.join(' | ')} ]**\n\n${resultText}`).catch(() => {});
    }

    // --- 🎡 ANIMATED ROULETTE WHEEL ---
    if (command === 'roulette') {
        const bet = parseInt(args[0]); const choice = args[1]?.toLowerCase();
        if (isNaN(bet) || !choice) return message.channel.send("❌ Usage: `$roulette <bet> <color/number>`");
        const user = getUserData(message.author.id); if (user.balance < bet) return message.channel.send("❌ Insufficient chips.");

        if (activeGames.has(message.author.id)) return message.channel.send("❌ Active operation running.");
        activeGames.add(message.author.id);

        // Animație faza 1
        const msg = await message.channel.send("🎡 `[ 🔴 14 ] [ ⚫ 2 ] [ 🟢 0 ]` *Dropping the roulette ball...*");
        
        // Animație faza 2
        await new Promise(r => setTimeout(r, 800));
        await msg.edit("🎡 `[ ⚫ 35 ] [ 🔴 12 ] [ ⚫ 28 ]` *The wheel is losing momentum...*").catch(() => {});

        // Calcul Rezultat
        await new Promise(r => setTimeout(r, 800));
        const roll = Math.floor(Math.random() * 37);
        const redNumbers = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
        const color = roll === 0 ? "green" : (redNumbers.includes(roll) ? "red" : "black");
        
        const won = (choice === color || choice === roll.toString());
        let factor = choice === "green" ? 14 : (choice === color ? 2 : 35);
        let payout = won ? (bet * factor) : 0;

        user.balance = user.balance - bet + payout;
        saveUserData(message.author.id, user);
        activeGames.delete(message.author.id);

        const winStatus = won ? `🎉 **PROFIT!** Gained **+${payout.toLocaleString()}** chips!` : `😭 **LOSS!** Lost **-${bet.toLocaleString()}** chips.`;
        return msg.edit(`🎡 Winning pocket: **[ ${color.toUpperCase()} ${roll} ]**\n\n${winStatus}`).catch(() => {});
    }

    // --- 🃏 INTERACTIVE BUTTON BLACKJACK ---
    if (command === 'bj' || command === 'blackjack') {
        const bet = parseInt(args[0]);
        if (isNaN(bet) || bet <= 0) return message.channel.send("❌ Usage: `$bj <bet>`");
        const user = getUserData(message.author.id);
        if (user.balance < bet) return message.channel.send("❌ Insufficient funds.");

        if (activeGames.has(message.author.id)) return message.channel.send("❌ Finish your current game table first.");
        activeGames.add(message.author.id);

        let pHand = [Math.floor(Math.random() * 10) + 2, Math.floor(Math.random() * 10) + 2];
        let dHand = [Math.floor(Math.random() * 10) + 2, Math.floor(Math.random() * 10) + 2];
        const score = (h) => h.reduce((a,b) => a+b, 0);

        const renderText = (reveal = false) => 
            `🃏 **BLACKJACK TABLE SESSION** 🃏\n` +
            `💰 **Current Pot:** ${bet * 2} chips\n\n` +
            `🔹 **Your Hand:** [ ${pHand.join(', ')} ] *(Total Score: ${score(pHand)})*\n` +
            `🔸 **Dealer Hand:** [ ${reveal ? dHand.join(', ') : `${dHand[0]}, ?`} ] *(Total Score: ${reveal ? score(dHand) : '?'})*`;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('bj_hit').setLabel('🃏 Hit').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('bj_stand').setLabel('🛑 Stand').setStyle(ButtonStyle.Secondary)
        );

        const bjMsg = await message.channel.send({ content: renderText(), components: [row] });
        const collector = bjMsg.createMessageComponentCollector({ filter: i => i.user.id === message.author.id, time: 30000 });

        collector.on('collect', async i => {
            if (i.customId === 'bj_hit') {
                pHand.push(Math.floor(Math.random() * 10) + 2);
                if (score(pHand) > 21) collector.stop('busted');
                else await i.update({ content: renderText() });
            } else if (i.customId === 'bj_stand') {
                collector.stop('stand');
            }
        });

        collector.on('end', async (_, reason) => {
            let pS = score(pHand); let dS = score(dHand);
            if (pS <= 21) { while (dS < 17) { dHand.push(Math.floor(Math.random() * 10) + 2); dS = score(dHand); } }

            let resultMsg = "";
            if (pS > 21 || reason === 'busted') { user.balance -= bet; resultMsg = "\n💥 **Busted! You exceeded 21 points. House wins.**"; }
            else if (dS > 21 || pS > dS) { user.balance += bet; resultMsg = `\n🎉 **Victory! You beat the dealer and earned +${bet} chips!**`; }
            else if (pS < dS) { user.balance -= bet; resultMsg = "\n😭 **Dealer holds the higher score. House wins.**"; }
            else resultMsg = "\n🤝 **Tie split. Wagered capital returned to wallet.**";

            saveUserData(message.author.id, user);
            activeGames.delete(message.author.id);
            await bjMsg.edit({ content: renderText(true) + resultMsg, components: [] }).catch(() => {});
        });
    }

    // --- MULTIPLAYER POKER & DUEL ---
    if (command === 'duel') {
        const opp = message.mentions.users.first(); const bet = parseInt(args[1]);
        if (!opp || opp.id === message.author.id || isNaN(bet) || bet <= 0) return message.channel.send("❌ Usage: `$duel <@user> <bet>`");
        const u1 = getUserData(message.author.id); const u2 = getUserData(opp.id);
        if (u1.balance < bet || u2.balance < bet) return message.channel.send("❌ Insufficient funds.");
        const win = Math.random() < 0.5 ? message.author : opp;
        const los = win.id === message.author.id ? opp : message.author;
        u1.balance += (win.id === message.author.id ? bet : -bet);
        u2.balance += (win.id === opp.id ? bet : -bet);
        saveUserData(message.author.id, u1); saveUserData(opp.id, u2);
        return message.channel.send(`🎲 **${win.username}** wins the coinflip duel round and collects **${bet}** chips from **${los.username}**!`);
    }

    if (command === 'poker') {
        return message.channel.send(`🏆 **Poker Table Resolved!** Winner swept the board pot via cards high-valuation metrics.`);
    }

    // --- CAREERS ---
    if (command === 'jobs') {
        if (!args[0]) {
            let str = "💼 **Available Professional Sectors:**\n";
            jobsList.forEach(j => str += `▫️ \`${j.id}\` - ${j.name} (Payout: ~${j.payout})\n`);
            return message.channel.send(str + "\n👉 Join using: `$jobs join <id>` | Earn chips using: `$work`");
        }
        if (args[0] === 'join') {
            const id = args[1]; if (!jobsList.find(j => j.id === id)) return message.channel.send("❌ Invalid job ID.");
            const user = getUserData(message.author.id); user.currentJob = id; saveUserData(message.author.id, user);
            return message.channel.send(`💼 Joined contract career line as a **${id.toUpperCase()}**!`);
        }
    }

    if (command === 'work') {
        const user = getUserData(message.author.id); if (!user.currentJob) return message.channel.send("❌ Run `$jobs join <id>` first!");
        const cd = getCooldownString(user.lastWork, 30 * 60 * 1000); if (cd) return message.channel.send(`⏳ Cooldown remaining: **${cd}**.`);
        const job = jobsList.find(j => j.id === user.currentJob);
        user.balance += job.payout; user.lastWork = new Date().toISOString(); saveUserData(message.author.id, user);
        addXP(message.author.id, job.xp, message.channel);
        return message.channel.send(`💼 Work shift complete! Earned **+${job.payout}** chips.`);
    }

    // --- REAL ESTATE ASSETS SYSTEM ---
    if (command === 'properties') {
        let str = "🏢 **Real Estate Asset Catalog:**\n";
        propertyList.forEach(p => str += `▫️ \`${p.id}\` - Cost: ${p.price.toLocaleString()} | Daily Rent Yield: **+${p.rent}**\n`);
        return message.channel.send(str);
    }

    if (command === 'buyproperty') {
        const id = args[0]; const p = propertyList.find(x => x.id === id); if (!p) return message.channel.send("❌ Property not found.");
        const user = getUserData(message.author.id); if (user.balance < p.price) return message.channel.send("❌ Insufficient cash.");
        user.balance -= p.price; user.properties[id] = (user.properties[id] || 0) + 1;
        saveUserData(message.author.id, user); return message.channel.send(`🏢 Purchased **${p.name}**!`);
    }

    if (command === 'collectrent') {
        const user = getUserData(message.author.id);
        const cd = getCooldownString(user.lastRentCollect, 24 * 60 * 60 * 1000); if (cd) return message.channel.send(`❌ Rent active. Cooldown: **${cd}**.`);
        let total = 0;
        Object.keys(user.properties).forEach(k => { const p = propertyList.find(x => x.id === k); if (p) total += p.rent * user.properties[k]; });
        if (total === 0) return message.channel.send("❌ You don't own yield real estate property.");
        user.balance += total; user.lastRentCollect = new Date().toISOString(); saveUserData(message.author.id, user);
        return message.channel.send(`🏢 Disbursed passive rental yield profit of **+${total.toLocaleString()}** chips.`);
    }

    // --- ADDITIONAL PLACEHOLDERS SYSTEMS ---
    if (command === 'shop') {
        let str = "🛒 **System General Item Catalog Shop:**\n";
        shopItems.forEach(i => str += `▫️ \`${i.id}\` - **${i.name}**: ${i.price} chips\n`);
        return message.channel.send(str);
    }

    if (command === 'buy') {
        const id = args[0]; const item = shopItems.find(i => i.id === id); if (!item) return message.channel.send("❌ Item not found.");
        const user = getUserData(message.author.id); if (user.balance < item.price) return message.channel.send("❌ Insufficient chips.");
        user.balance -= item.price; user.inventory.push(id); saveUserData(message.author.id, user);
        return message.channel.send(`📦 Item allocation successful! Purchased **${item.name}**.`);
    }

    if (command === 'lootbox') {
        const type = args[0]; if (type !== 'basic' && type !== 'vip') return message.channel.send("❌ Select box: basic / vip");
        const cost = type === 'basic' ? 1500 : 8000;
        const user = getUserData(message.author.id); if (user.balance < cost) return message.channel.send("❌ Insufficient funds.");
        user.balance -= cost; const reward = type === 'basic' ? 2500 : 15000; user.balance += reward; saveUserData(message.author.id, user);
        return message.channel.send(`📦 Opened a **${type.toUpperCase()} Box**! Extracted **+${reward.toLocaleString()}** chips.`);
    }

    if (command === 'clan') return message.channel.send("👥 **Syndicate Core Engine:** Operational. Use: `$clan create <name>`.");
    if (command === 'market') return message.channel.send("📊 **Exchange Broker Hub:** Use `$market show` or `$market list`.");
});

client.login(process.env.DISCORD_TOKEN);

// --- AUTOMATED PRODUCTION CRASH PREVENTION ENGINE ---
process.on('unhandledRejection', error => { console.error(' [Unhandled Rejection]:', error); });
process.on('uncaughtException', error => { console.error(' [Uncaught Exception]:', error); });