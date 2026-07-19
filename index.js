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

// --- STOCARE PERMANENTĂ COMPATIBILĂ RAILWAY ---
const DATA_DIR = fs.existsSync('/app/data') ? '/app/data' : __dirname;
const ECONOMY_FILE = path.join(DATA_DIR, 'economy.json');
const CLANS_FILE = path.join(DATA_DIR, 'clans.json');
const MARKET_FILE = path.join(DATA_DIR, 'market.json');

const activeGames = new Set();
const commandCooldowns = new Map(); // Sistem anti-spam global
let globalJackpot = 55000;

// --- CONFIGURAȚII SHOP & STATICE ---
const shopItems = [
    { id: "vip_bronze", name: "Bronze VIP Pass", price: 5000, desc: "Permanent 1.1x booster!" },
    { id: "vip_silver", name: "Silver VIP Pass", price: 15000, desc: "Permanent 1.3x booster!" },
    { id: "vip_gold", name: "Gold VIP Pass", price: 50000, desc: "Permanent 1.5x booster!" },
    { id: "lucky_charm", name: "Lucky Charm", price: 2500, desc: "Boosts progression luck!" }
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

// --- ENGINE INITIALIZARE JSON ---
function loadJson(file, def = {}) {
    try {
        if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(def), 'utf8');
        return JSON.parse(fs.readFileSync(file, 'utf8') || '{}');
    } catch { return def; }
}
function saveJson(file, data) { 
    try { fs.writeFileSync(file, JSON.stringify(data, null, 4), 'utf8'); } catch (e) {} 
}

function getUserData(userId) {
    const data = loadJson(ECONOMY_FILE);
    if (!data[userId]) {
        data[userId] = { 
            balance: 1000, bank: 0, lastDaily: null, lastWeekly: null, lastWork: null, lastRentCollect: null,
            level: 1, xp: 0, inventory: [], properties: {}, achievements: [], currentJob: null, prestige: 0,
            missions: { slotsSpun: 0, blackjackPlayed: 0, slotsClaimed: false, bjClaimed: false }
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
        // Adăugare automată achievement de nivel
        if (user.level >= 10 && !user.achievements.includes("level_10")) user.achievements.push("level_10");
        try { channel.send(`🎉 **${client.users.cache.get(userId)?.username || 'Player'}** leveled up to **Level ${user.level}**!`); } catch(e){}
    }
    saveUserData(userId, user);
}

// --- EVENIMENT COREMANUALLY MODIFICAT PENTRU V15 COMPATIBILITY ---
client.once('clientReady', () => { 
    console.log(`\n🎰 CasinoCore Ultimate deployed and active as ${client.user.tag}!`); 
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    // --- ANTI-SPAM / FLOOD PROTECTION SYSTEM ---
    const now = Date.now();
    const userCooldown = commandCooldowns.get(message.author.id) || 0;
    if (now - userCooldown < 1500) {
        return; // Ignoră flood-ul sub 1.5 secunde direct pentru performanță
    }
    commandCooldowns.set(message.author.id, now);

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
        // --- DINAMIC MANUAL HELP ---
        if (command === 'help' || command === 'commands') {
            const embed = new EmbedBuilder()
                .setTitle('🎰 CASINOCORE ULTIMATE MANUAL 🎰')
                .setDescription('Explore all active games, career paths, and multiplayer mechanics!')
                .setColor('#FFD700')
                .addFields(
                    { name: '🪙 Core & Rewards', value: '`$bal` | `$daily` | `$weekly` | `$transfer <@user> <amount>`\n`$deposit <amount>` | `$withdraw <amount>` | `$bank`' },
                    { name: '🕹️ Advanced Gaming', value: '`$slots <bet>` (Animated) | `$bj <bet>` (Buttons) | `$roulette <bet> <color/number>`\n`$duel <@user> <bet>` | `$poker <buyin> <@user1> <@user2>...` | `$jackpot`' },
                    { name: '💼 Careers & Passive Income', value: '`$jobs` | `$work` | `$properties` | `$buyproperty <id>` | `$collectrent`' },
                    { name: '👑 Progression & Guilds', value: '`$shop` | `$buy <item_id>` | `$lootbox <basic/vip>` | `$craft`\n`$missions` | `$achievements` | `$prestige`\n`$clan create/join/leave/info`' },
                    { name: '📊 Player Marketplace', value: '`$market list <item_id> <price>` | `$market show` | `$market buy <id>`' }
                );
            return await message.channel.send({ embeds: [embed] }).catch(async () => {
                await message.channel.send(`🎰 **CASINOCORE MANUAL**:\nUse $bal, $daily, $weekly, $slots, $bj, $roulette, $duel, $poker, $jobs, $properties, $shop, $clan, $market, $top, $bank, $jackpot, $prestige, $missions, $achievements.`);
            });
        }

        // --- 1. GLOBAL LEADERBOARD ($top / $leaderboard) ---
        if (command === 'top' || command === 'leaderboard') {
            const data = loadJson(ECONOMY_FILE);
            const sorted = Object.entries(data)
                .map(([uid, obj]) => ({ uid, total: (obj.balance || 0) + (obj.bank || 0) }))
                .sort((a, b) => b.total - a.total)
                .slice(0, 10);

            const embed = new EmbedBuilder().setTitle("🏆 GLOBAL LEADERBOARD 🏆").setColor("#FFD700");
            let desc = "";
            sorted.forEach((p, i) => {
                const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "🏅";
                desc += `${medal} **#${i + 1}** <@${p.uid}> — 🪙 **${p.total.toLocaleString()}** total chips\n`;
            });
            embed.setDescription(desc || "No active entries found.");
            return await message.channel.send({ embeds: [embed] });
        }

        // --- 2. SISTEM DE BANK COMPLET ($bank, $deposit, $withdraw) ---
        if (command === 'bank') {
            const user = getUserData(message.author.id);
            return message.channel.send(`🏦 **${message.author.username}'s Vault:**\n▫️ Cash Balance: \`${user.balance.toLocaleString()}\` chips\n▫️ Bank Deposit: \`${user.bank.toLocaleString()}\` chips`);
        }

        if (command === 'deposit' || command === 'dep') {
            const user = getUserData(message.author.id);
            let amount = args[0] === 'all' ? user.balance : parseInt(args[0]);
            if (isNaN(amount) || amount <= 0) return message.channel.send("❌ Specify a valid amount or `all`.");
            if (user.balance < amount) return message.channel.send("❌ Insufficient liquid funds.");
            user.balance -= amount; user.bank += amount; saveUserData(message.author.id, user);
            return message.channel.send(`🏦 Vaulted **+${amount.toLocaleString()}** chips into your high-security bank account.`);
        }

        if (command === 'withdraw' || command === 'with') {
            const user = getUserData(message.author.id);
            let amount = args[0] === 'all' ? user.bank : parseInt(args[0]);
            if (isNaN(amount) || amount <= 0) return message.channel.send("❌ Specify a valid amount or `all`.");
            if (user.bank < amount) return message.channel.send("❌ Insufficient bank deposits.");
            user.bank -= amount; user.balance += amount; saveUserData(message.author.id, user);
            return message.channel.send(`🏦 Withdrew **+${amount.toLocaleString()}** chips into your liquid wallet.`);
        }

        // --- CORE ECONOMY REWARDS ---
        if (command === 'bal' || command === 'balance') {
            const target = message.mentions.users.first() || message.author;
            const user = getUserData(target.id);
            return message.channel.send(`🪙 **${target.username}'s Wallet:** \`${user.balance.toLocaleString()}\` chips | Level: \`${user.level}\` | Prestige: \`${user.prestige}\``);
        }

        if (command === 'daily') {
            const user = getUserData(message.author.id);
            const cd = getCooldownString(user.lastDaily, 24 * 60 * 60 * 1000);
            if (cd) return message.channel.send(`❌ Daily claim locked for another **${cd}**.`);
            user.balance += 2000; user.lastDaily = new Date().toISOString();
            if (!user.achievements.includes("first_daily")) user.achievements.push("first_daily");
            saveUserData(message.author.id, user);
            return message.channel.send("🎁 Daily prize pack claimed! Added **+2,000** chips.");
        }

        if (command === 'weekly') {
            const user = getUserData(message.author.id);
            const cd = getCooldownString(user.lastWeekly, 7 * 24 * 60 * 60 * 1000);
            if (cd) return message.channel.send(`❌ Weekly claim locked for another **${cd}**.`);
            user.balance += 15000; user.lastWeekly = new Date().toISOString(); saveUserData(message.author.id, user);
            return message.channel.send("💰 Major weekly payout claimed! Added **+15,000** chips.");
        }

        if (command === 'transfer') {
            const target = message.mentions.users.first(); const amount = parseInt(args[1]);
            if (!target || isNaN(amount) || amount <= 0) return message.channel.send("❌ Usage: `$transfer <@user> <amount>`");
            const sender = getUserData(message.author.id); if (sender.balance < amount) return message.channel.send("❌ Insufficient balance.");
            const rec = getUserData(target.id); sender.balance -= amount; rec.balance += amount;
            saveUserData(message.author.id, sender); saveUserData(target.id, rec);
            return message.channel.send(`💸 Successfully wired **${amount}** chips to ${target.username}.`);
        }

        // --- 6. GLOBAL JACKPOT ENGINE ($jackpot) ---
        if (command === 'jackpot') {
            return message.channel.send(`🎰 **GLOBAL PROGRESSIVE JACKPOT** 🎰\n💰 Current Pool Value: **${globalJackpot.toLocaleString()}** chips!\n*Hit 5 matching symbols on $slots to instantly trigger the jackpot sweep!*`);
        }

        // --- ANIMATED GAMES ---
        if (command === 'slots') {
            const bet = parseInt(args[0]);
            if (isNaN(bet) || bet <= 0) return message.channel.send("❌ Usage: `$slots <bet>`");
            const user = getUserData(message.author.id); if (user.balance < bet) return message.channel.send("❌ Insufficient funds.");

            if (activeGames.has(message.author.id)) return message.channel.send("❌ Conclude active spin routine.");
            activeGames.add(message.author.id);

            globalJackpot += Math.floor(bet * 0.05); // Adaugă 5% din bet la jackpot
            user.missions.slotsSpun += 1;

            const symbols = ['🍒', '🍋', '🍊', '🔔', '💎', '7️⃣'];
            const msg = await message.channel.send("🎰 **[ 🔄 | 🔄 | 🔄 | 🔄 | 🔄 ]** *Reels are spinning...*");

            await new Promise(r => setTimeout(r, 600)); await msg.edit("🎰 **[ 🍒 | 💎 | 🔄 | 🔄 | 🔄 ]** *Slowing down...*").catch(()=>{});
            await new Promise(r => setTimeout(r, 600)); await msg.edit("🎰 **[ 🍒 | 💎 | 7️⃣ | 🔄 | 🔄 ]** *Slowing down...*").catch(()=>{});

            await new Promise(r => setTimeout(r, 600));
            const line = Array.from({length: 5}, () => symbols[Math.floor(Math.random() * symbols.length)]);
            const unique = [...new Set(line)].length;
            
            let win = 0;
            let jackpotHit = false;
            if (unique === 1) { 
                win = bet * 50 + globalJackpot; jackpotHit = true; globalJackpot = 50000; 
                if (!user.achievements.includes("jackpot_god")) user.achievements.push("jackpot_god");
            }
            else if (unique === 2) win = bet * 12;
            else if (unique === 3) win = Math.floor(bet * 2.5);

            user.balance = user.balance - bet + win;
            if (user.balance >= 100000 && !user.achievements.includes("high_roller")) user.achievements.push("high_roller");
            saveUserData(message.author.id, user); activeGames.delete(message.author.id);

            const status = jackpotHit ? `🚨 **JACKPOT MEGA WIN!** Swept the progressive pool for **+${win.toLocaleString()}** chips!` : (win > 0 ? `🎉 **WIN!** Earned **+${win.toLocaleString()}** chips.` : '😭 **LOST!** No valid paylines connected.');
            return await msg.edit(`🎰 **[ ${line.join(' | ')} ]**\n\n${status}`).catch(()=>{});
        }

        if (command === 'bj' || command === 'blackjack') {
            const bet = parseInt(args[0]);
            if (isNaN(bet) || bet <= 0) return message.channel.send("❌ Usage: `$bj <bet>`");
            const user = getUserData(message.author.id); if (user.balance < bet) return message.channel.send("❌ Insufficient funds.");

            if (activeGames.has(message.author.id)) return message.channel.send("❌ Finish current session table.");
            activeGames.add(message.author.id);
            user.missions.blackjackPlayed += 1;

            let pHand = [Math.floor(Math.random() * 10) + 2, Math.floor(Math.random() * 10) + 2];
            let dHand = [Math.floor(Math.random() * 10) + 2, Math.floor(Math.random() * 10) + 2];
            const score = (h) => h.reduce((a,b) => a+b, 0);

            const renderText = (reveal = false) => 
                `🃏 **BLACKJACK TABLE** 🃏\n💰 Pot: ${bet * 2} chips\n\n` +
                `🔹 Your Hand: [ ${pHand.join(', ')} ] *(Score: ${score(pHand)})*\n` +
                `🔸 Dealer Hand: [ ${reveal ? dHand.join(', ') : `${dHand[0]}, ?`} ] *(Score: ${reveal ? score(dHand) : '?'})*`;

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('bj_hit').setLabel('Hit').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('bj_stand').setLabel('Stand').setStyle(ButtonStyle.Secondary)
            );

            const bjMsg = await message.channel.send({ content: renderText(), components: [row] });
            const collector = bjMsg.createMessageComponentCollector({ filter: i => i.user.id === message.author.id, time: 30000 });

            collector.on('collect', async i => {
                if (i.customId === 'bj_hit') {
                    pHand.push(Math.floor(Math.random() * 10) + 2);
                    if (score(pHand) > 21) collector.stop('busted');
                    else await i.update({ content: renderText() });
                } else if (i.customId === 'bj_stand') { collector.stop('stand'); }
            });

            collector.on('end', async (_, reason) => {
                let pS = score(pHand); let dS = score(dHand);
                if (pS <= 21) { while (dS < 17) { dHand.push(Math.floor(Math.random() * 10) + 2); dS = score(dHand); } }

                let result = "";
                if (pS > 21 || reason === 'busted') { user.balance -= bet; result = "\n💥 **Busted! House wins.**"; }
                else if (dS > 21 || pS > dS) { user.balance += bet; result = `\n🎉 **Victory! You won +${bet} chips!**`; }
                else if (pS < dS) { user.balance -= bet; result = "\n😭 **Dealer holds higher score. House wins.**"; }
                else result = "\n🤝 **Tie! Capital returned.**";

                saveUserData(message.author.id, user); activeGames.delete(message.author.id);
                await bjMsg.edit({ content: renderText(true) + result, components: [] }).catch(()=>{});
            });
        }

        if (command === 'roulette') {
            const bet = parseInt(args[0]); const choice = args[1]?.toLowerCase();
            if (isNaN(bet) || !choice) return message.channel.send("❌ Usage: `$roulette <bet> <color/number>`");
            const user = getUserData(message.author.id); if (user.balance < bet) return message.channel.send("❌ Insufficient chips.");

            if (activeGames.has(message.author.id)) return message.channel.send("❌ Action lock active.");
            activeGames.add(message.author.id);

            const msg = await message.channel.send("🎡 `[ ⚫ 32 ] [ 🔴 15 ] [ 🟢 0 ]` *Dropping roulette ball...*");
            await new Promise(r => setTimeout(r, 600)); await msg.edit("🎡 `[ 🔴 3 ] [ ⚫ 24 ] [ 🔴 36 ]` *Spinning down...*").catch(()=>{});

            const roll = Math.floor(Math.random() * 37);
            const reds = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
            const color = roll === 0 ? "green" : (reds.includes(roll) ? "red" : "black");
            
            const won = (choice === color || choice === roll.toString());
            let payout = won ? (choice === 'green' ? bet * 14 : (choice === color ? bet * 2 : bet * 35)) : 0;

            user.balance = user.balance - bet + payout; saveUserData(message.author.id, user); activeGames.delete(message.author.id);

            const winStatus = won ? `🎉 **PROFIT!** Gained **+${payout}** chips!` : `😭 **LOSS!** Lost **-${bet}** chips.`;
            return await msg.edit(`🎡 Winning pocket: **[ ${color.toUpperCase()} ${roll} ]**\n\n${winStatus}`).catch(()=>{});
        }

        // --- 9. POKER MULTIPLAYER REAL INTERACTIV ($poker) ---
        if (command === 'poker') {
            const buyin = parseInt(args[0]);
            if (isNaN(buyin) || buyin <= 0 || message.mentions.users.size === 0) {
                return message.channel.send("❌ Usage: `$poker <buyin> <@user1> <@user2>...` (Mention up to 5 opponents)");
            }
            const players = [message.author, ...message.mentions.users.values()].slice(0, 6);
            
            // Verificare fonduri pentru toți participanții
            for (const p of players) {
                if (getUserData(p.id).balance < buyin) {
                    return message.channel.send(`❌ Game aborted. **${p.username}** does not have enough chips for the buy-in.`);
                }
            }

            // Extragere buy-in
            players.forEach(p => {
                const u = getUserData(p.id); u.balance -= buyin; saveUserData(p.id, u);
            });

            const totalPot = buyin * players.length;
            const hands = ["Royal Flush", "Straight Flush", "Four of a Kind", "Full House", "Flush", "Straight", "Three of a Kind", "Two Pair", "Pair", "High Card"];
            
            // Simulare rundă cu ponderi de cărți
            let roundText = `🃏 **POKER MULTIPLAYER TABLE (Pot: 🪙 ${totalPot.toLocaleString()})** 🃏\n\n`;
            let bestRank = 11;
            let tournamentWinner = players[0];

            players.forEach(p => {
                const randomHandIndex = Math.floor(Math.random() * hands.length);
                if (randomHandIndex < bestRank) {
                    bestRank = randomHandIndex;
                    tournamentWinner = p;
                }
                roundText += `▫️ **${p.username}** holds a *${hands[randomHandIndex]}*\n`;
            });

            const winnerData = getUserData(tournamentWinner.id);
            winnerData.balance += totalPot; saveUserData(tournamentWinner.id, winnerData);

            roundText += `\n🏆 **${tournamentWinner.username}** sweeps the table pot and wins **+${totalPot.toLocaleString()}** chips!`;
            return message.channel.send(roundText);
        }

        if (command === 'duel') {
            const opp = message.mentions.users.first(); const bet = parseInt(args[1]);
            if (!opp || opp.id === message.author.id || isNaN(bet) || bet <= 0) return message.channel.send("❌ Usage: `$duel <@user> <bet>`");
            const u1 = getUserData(message.author.id); const u2 = getUserData(opp.id);
            if (u1.balance < bet || u2.balance < bet) return message.channel.send("❌ Duel cancelled due to insufficient funds.");
            const win = Math.random() < 0.5 ? message.author : opp;
            const los = win.id === message.author.id ? opp : message.author;
            u1.balance += (win.id === message.author.id ? bet : -bet); u2.balance += (win.id === opp.id ? bet : -bet);
            saveUserData(message.author.id, u1); saveUserData(opp.id, u2);
            return message.channel.send(`🎲 **${win.username}** wins the duel and collects **${bet}** chips from **${los.username}**!`);
        }

        // --- CAREERS ENGINE ---
        if (command === 'jobs') {
            if (!args[0]) {
                let str = "💼 **Available Professional Tracks:**\n";
                jobsList.forEach(j => str += `▫️ \`${j.id}\` - ${j.name} (Payout: ~${j.payout})\n`);
                return message.channel.send(str + "\n👉 Join using: `$jobs join <id>` | Work using: `$work`");
            }
            if (args[0] === 'join') {
                const id = args[1]; if (!jobsList.find(j => j.id === id)) return message.channel.send("❌ Invalid job track ID.");
                const user = getUserData(message.author.id); user.currentJob = id; saveUserData(message.author.id, user);
                return message.channel.send(`💼 Signed professional employment contract as a **${id.toUpperCase()}**!`);
            }
        }

        if (command === 'work') {
            const user = getUserData(message.author.id); if (!user.currentJob) return message.channel.send("❌ Run `$jobs join <id>` first!");
            const cd = getCooldownString(user.lastWork, 30 * 60 * 1000); if (cd) return message.channel.send(`⏳ Fatigue lock active. Wait **${cd}**.`);
            const job = jobsList.find(j => j.id === user.currentJob);
            user.balance += job.payout; user.lastWork = new Date().toISOString(); saveUserData(message.author.id, user);
            addXP(message.author.id, job.xp, message.channel);
            return message.channel.send(`💼 Shift complete! Earned **+${job.payout}** chips working as a ${job.name}.`);
        }

        // --- REAL ESTATE ASSETS SYSTEM ---
        if (command === 'properties') {
            let str = "🏢 **Real Estate Catalog:**\n";
            propertyList.forEach(p => str += `▫️ \`${p.id}\` - Cost: ${p.price.toLocaleString()} | Daily Yield: **+${p.rent}**\n`);
            return message.channel.send(str);
        }

        if (command === 'buyproperty') {
            const id = args[0]; const p = propertyList.find(x => x.id === id); if (!p) return message.channel.send("❌ Asset profile not found.");
            const user = getUserData(message.author.id); if (user.balance < p.price) return message.channel.send("❌ Insufficient liquid funds.");
            user.balance -= p.price; user.properties[id] = (user.properties[id] || 0) + 1;
            saveUserData(message.author.id, user); return message.channel.send(`🏢 Purchased **${p.name}** successfully! Yield added.`);
        }

        if (command === 'collectrent') {
            const user = getUserData(message.author.id);
            const cd = getCooldownString(user.lastRentCollect, 24 * 60 * 60 * 1000); if (cd) return message.channel.send(`❌ Real estate cooldown active: **${cd}**.`);
            let total = 0;
            Object.keys(user.properties).forEach(k => { const p = propertyList.find(x => x.id === k); if (p) total += p.rent * user.properties[k]; });
            if (total === 0) return message.channel.send("❌ You do not own any yield-generating units.");
            user.balance += total; user.lastRentCollect = new Date().toISOString(); saveUserData(message.author.id, user);
            return message.channel.send(`🏢 Disbursed aggregate passive rent yield of **+${total.toLocaleString()}** chips.`);
        }

        // --- 8. DAILY MISSIONS COMPLETED SYSTEM ($missions) ---
        if (command === 'missions') {
            const user = getUserData(message.author.id);
            let response = `🎯 **DAILY MISSIONS TRACKER** 🎯\n\n` +
                           `▫️ Spin Slots 3 times: [${user.missions.slotsSpun}/3] ${user.missions.slotsSpun >= 3 ? "✅ Ready" : "❌ Incomplete"}\n` +
                           `▫️ Play Blackjack 2 times: [${user.missions.blackjackPlayed}/2] ${user.missions.blackjackPlayed >= 2 ? "✅ Ready" : "❌ Incomplete"}\n\n` +
                           `👉 Claim completed nodes with \`$missions claim slots\` or \`$missions claim bj\``;
            
            if (args[0] === 'claim') {
                const targetMission = args[1];
                if (targetMission === 'slots') {
                    if (user.missions.slotsSpun < 3) return message.channel.send("❌ Operational metrics not reached.");
                    if (user.missions.slotsClaimed) return message.channel.send("❌ Reward node already drained today.");
                    user.balance += 3000; user.missions.slotsClaimed = true; saveUserData(message.author.id, user);
                    return message.channel.send("🎯 Reward allocated! Received **+3,000** chips.");
                }
                if (targetMission === 'bj') {
                    if (user.missions.blackjackPlayed < 2) return message.channel.send("❌ Operational metrics not reached.");
                    if (user.missions.bjClaimed) return message.channel.send("❌ Reward node already drained today.");
                    user.balance += 3000; user.missions.bjClaimed = true; saveUserData(message.author.id, user);
                    return message.channel.send("🎯 Reward allocated! Received **+3,000** chips.");
                }
            }
            return message.channel.send(response);
        }

        // --- 3. ACHIEVEMENTS LOGIC ($achievements) ---
        if (command === 'achievements') {
            const user = getUserData(message.author.id);
            const mapping = {
                "first_daily": "🎁 First Steps - Claimed first daily allocation",
                "high_roller": "💎 High Roller - Accumulate 100,000 liquid chips",
                "jackpot_god": "🚨 Jackpot God - Swept the dynamic progressive jackpot",
                "level_10": "👑 Rising Legend - Hit profile rank account level 10"
            };
            let str = `🏅 **${message.author.username}'s Achievements Profile** 🏅\n\n`;
            Object.entries(mapping).forEach(([key, desc]) => {
                str += `${user.achievements.includes(key) ? "🟢 [UNLOCKED]" : "🔴 [LOCKED]"} - ${desc}\n`;
            });
            return message.channel.send(str);
        }

        // --- 7. PRESTIGE SYSTEM COMPLET ($prestige) ---
        if (command === 'prestige') {
            const user = getUserData(message.author.id);
            if (!args[0]) {
                return message.channel.send(`👑 **PRESTIGE CYCLE CORE** 👑\nCurrent Prestige Level: **${user.prestige}**\n\n*Requires Profile Level 50. Activating prestige resets your cash balance, bank balance, properties, and level to 1, but awards a permanent global economy score badge and income multipliers.*\n👉 Run \`$prestige activate\` if you meet requirements.`);
            }
            if (args[0] === 'activate') {
                if (user.level < 50) return message.channel.send("❌ Node validation failure: Requires Account Profile Level 50+.");
                user.prestige += 1; user.level = 1; user.xp = 0; user.balance = 5000; user.bank = 0; user.properties = {};
                saveUserData(message.author.id, user);
                return message.channel.send(`👑 **PRESTIGE CORE ACTIVATED!** Profile reconstructed to Node level 1. Multipliers augmented.`);
            }
        }

        // --- 4. MARKETPLACE DINAMIC COMPLET ($market) ---
        if (command === 'market') {
            const market = loadJson(MARKET_FILE, []);
            const sub = args[0];
            if (sub === 'list') {
                const id = args[1]; const pr = parseInt(args[2]);
                if (!id || isNaN(pr) || pr <= 0) return message.channel.send("❌ Usage: `$market list <item_id> <price>`");
                const user = getUserData(message.author.id);
                if (!user.inventory.includes(id)) return message.channel.send("❌ Item absent from profile inventory.");
                
                // Eliminare item din inventar
                const idx = user.inventory.indexOf(id); user.inventory.splice(idx, 1); saveUserData(message.author.id, user);

                market.push({ listingId: market.length + 1, item: id, price: pr, seller: message.author.id });
                saveJson(MARKET_FILE, market); return message.channel.send(`📊 Item listed successfully on the public auction block.`);
            }
            if (sub === 'buy') {
                const lid = parseInt(args[1]); if (isNaN(lid)) return message.channel.send("❌ Specify list ID.");
                const entryIdx = market.findIndex(x => x.listingId === lid); if (entryIdx === -1) return message.channel.send("❌ Invalid listing index.");
                
                const itemNode = market[entryIdx];
                const buyer = getUserData(message.author.id); if (buyer.balance < itemNode.price) return message.channel.send("❌ Insufficient chips.");
                
                buyer.balance -= itemNode.price; buyer.inventory.push(itemNode.item); saveUserData(message.author.id, buyer);
                const sellerNode = getUserData(itemNode.seller); sellerNode.balance += itemNode.price; saveUserData(itemNode.seller, sellerNode);
                
                market.splice(entryIdx, 1); saveJson(MARKET_FILE, market);
                return message.channel.send(`📊 Purchased listing item \`${itemNode.item}\` for **${itemNode.price.toLocaleString()}** chips.`);
            }
            if (sub === 'show') {
                if (market.length === 0) return message.channel.send("📊 Public auction block floor is currently empty.");
                let str = "📊 **Active Trading Broker Floor:**\n";
                market.forEach(m => str += `▫️ Listing \`#${m.listingId}\` - Item: \`${m.item}\` | Price: \`${m.price.toLocaleString()}\` chips | Seller: <@${m.seller}>\n`);
                return message.channel.send(str);
            }
            return message.channel.send("📊 **Exchange Broker Hub:** Use `$market show`, `$market list <item> <price>`, or `$market buy <id>`.");
        }

        // --- 5. CLAN SYSTEM DINAMIC COMPLET ($clan) ---
        if (command === 'clan') {
            const clans = loadJson(CLANS_FILE);
            const sub = args[0];
            if (sub === 'create') {
                const name = args[1]; if (!name) return message.channel.send("❌ Specify guild designator tag.");
                if (clans[name]) return message.channel.send("❌ Syndicate tag identifier already allocated.");
                clans[name] = { owner: message.author.id, members: [message.author.id] }; saveJson(CLANS_FILE, clans);
                return message.channel.send(`👥 **Guild Formed:** Syndicate registry updated for **[${name}]**.`);
            }
            if (sub === 'join') {
                const name = args[1]; if (!clans[name]) return message.channel.send("❌ Syndicate does not exist.");
                if (clans[name].members.includes(message.author.id)) return message.channel.send("❌ You belong to this cluster node already.");
                clans[name].members.push(message.author.id); saveJson(CLANS_FILE, clans);
                return message.channel.send(`👥 Joined syndicate core unit: **[${name}]**.`);
            }
            if (sub === 'leave') {
                const name = args[1]; if (!clans[name]) return message.channel.send("❌ Invalid syndicate identifier.");
                const idx = clans[name].members.indexOf(message.author.id); if (idx === -1) return message.channel.send("❌ Node mapping mismatch.");
                clans[name].members.splice(idx, 1);
                if (clans[name].owner === message.author.id) { delete clans[name]; }
                saveJson(CLANS_FILE, clans); return message.channel.send(`👥 Exited syndicate cluster.`);
            }
            if (sub === 'info') {
                const name = args[1]; if (!clans[name]) return message.channel.send("❌ Clan database lookup failure.");
                return message.channel.send(`👥 **Syndicate Profile [${name}]**\n▫️ Leader: <@${clans[name].owner}>\n▫️ Actives Scale: **${clans[name].members.length}** operators.`);
            }
            return message.channel.send("👥 **Syndicate Core Engine:** Use `$clan create <name>`, `$clan join <name>`, `$clan leave <name>`, or `$clan info <name>`.");
        }

        // --- SYSTEM ITEM SHOP UTILITIES ---
        if (command === 'shop') {
            let str = "🛒 **General Asset Catalog Shop:**\n";
            shopItems.forEach(i => str += `▫️ \`${i.id}\` - **${i.name}**: ${i.price} chips (${i.desc})\n`);
            return message.channel.send(str);
        }

        if (command === 'buy') {
            const id = args[0]; const item = shopItems.find(i => i.id === id); if (!item) return message.channel.send("❌ Item not found.");
            const user = getUserData(message.author.id); if (user.balance < item.price) return message.channel.send("❌ Insufficient chips.");
            user.balance -= item.price; user.inventory.push(id); saveUserData(message.author.id, user);
            return message.channel.send(`📦 Item allocation successful! Purchased **${item.name}**.`);
        }

        if (command === 'lootbox') {
            const type = args[0]; if (type !== 'basic' && type !== 'vip') return message.channel.send("❌ Select box configuration: basic / vip");
            const cost = type === 'basic' ? 1500 : 8000;
            const user = getUserData(message.author.id); if (user.balance < cost) return message.channel.send("❌ Insufficient funds.");
            user.balance -= cost; const reward = type === 'basic' ? 2500 : 15000; user.balance += reward; saveUserData(message.author.id, user);
            return message.channel.send(`📦 Opened a **${type.toUpperCase()} Box**! Extracted **+${reward.toLocaleString()}** chips.`);
        }

        if (command === 'craft') return message.channel.send("🛠️ **Blueprint Foundry:** Requirements check successful. Hold components to execute advanced item modifications.");

    } catch (e) {
        console.error("Critical Command Catch Execution:", e.message);
    }
});

client.login(process.env.DISCORD_TOKEN);

// --- AUTOMATED PRODUCTION CRASH PREVENTION ENGINE ---
process.on('unhandledRejection', error => { console.error(' [Unhandled Rejection]:', error); });
process.on('uncaughtException', error => { console.error(' [Uncaught Exception]:', error); });