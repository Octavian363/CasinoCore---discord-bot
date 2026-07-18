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

// Prevents user spam during ongoing animations
const activeGames = new Set();

// Global rolling jackpot (stores in memory, starts at 50,000)
let globalJackpot = 50000;

// Dynamic automated global events
let activeEvent = null; 

// --- ECONOMIC CONFIGURATIONS ---
const shopItems = [
    { id: "vip_bronze", name: "Bronze VIP Pass", price: 5000, multiplier: 1.1, desc: "Permanent 1.1x payout booster for Daily/Weekly claims!" },
    { id: "vip_silver", name: "Silver VIP Pass", price: 15000, multiplier: 1.3, desc: "Permanent 1.3x payout booster for Daily/Weekly claims!" },
    { id: "vip_gold", name: "Gold VIP Pass", price: 50000, multiplier: 1.5, desc: "Permanent 1.5x payout booster for Daily/Weekly claims!" },
    { id: "lucky_charm", name: "Lucky Charm", price: 2000, multiplier: 1.0, desc: "Unlocks unique server badges and luck achievements!" }
];

// --- DATA MANAGEMENT ENGINE ---
function loadData() {
    if (!fs.existsSync(ECONOMY_FILE)) {
        fs.writeFileSync(ECONOMY_FILE, JSON.stringify({}), 'utf8');
    }
    const data = fs.readFileSync(ECONOMY_FILE, 'utf8');
    return JSON.parse(data || '{}');
}

function saveData(data) {
    fs.writeFileSync(ECONOMY_FILE, JSON.stringify(data, null, 4), 'utf8');
}

function getUserData(userId) {
    const data = loadData();
    
    if (!data[userId]) {
        data[userId] = { 
            balance: 1000, bank: 0, loan: 0, loanDueDate: null,
            lastDaily: null, lastWeekly: null, lastCrime: null, lastWork: null, lastRentCollect: null,
            vipLevel: "None", xpMultiplier: 1.0, prestige: 0, prestigeBadges: [],
            skills: { luck: 1, strength: 1, intelligence: 1 }, skillPoints: 0, level: 1, xp: 0,
            inventory: [], properties: {}, achievements: [],
            missions: { slotsSpun: 0, pokerPlayed: 0, blackjackPlayed: 0, crimeAttempted: 0, completedToday: false },
            weeklyQuests: { slotsSpun: 0, blackjackPlayed: 0, duelsWon: 0, claimed: false }
        };
        saveData(data);
    }

    const user = data[userId];
    if (user.bank === undefined) user.bank = 0;
    if (user.loan === undefined) user.loan = 0;
    if (!user.skills) user.skills = { luck: 1, strength: 1, intelligence: 1 };
    if (!user.properties || Array.isArray(user.properties)) user.properties = {};
    if (!user.inventory) user.inventory = [];
    if (!user.achievements) user.achievements = [];
    if (!user.missions) user.missions = { slotsSpun: 0, pokerPlayed: 0, blackjackPlayed: 0, crimeAttempted: 0, completedToday: false };
    if (!user.weeklyQuests) user.weeklyQuests = { slotsSpun: 0, blackjackPlayed: 0, duelsWon: 0, claimed: false };

    return user;
}

function updateUserData(userId, updatedObj) {
    const data = loadData();
    data[userId] = updatedObj;
    saveData(data);
}

function updateBalance(userId, amount) {
    const user = getUserData(userId);
    user.balance += amount;
    updateUserData(userId, user);
}

function addXP(userId, amount, channel) {
    const user = getUserData(userId);
    let eventMultiplier = (activeEvent && activeEvent.type === 'double_xp') ? 2 : 1;
    user.xp += amount * eventMultiplier;
    
    const xpNeeded = user.level * 1000;
    if (user.xp >= xpNeeded) {
        user.xp -= xpNeeded;
        user.level += 1;
        user.skillPoints += 1;
        channel.send(`🎉 **${client.users.cache.get(userId)?.username || 'Player'}** leveled up to **Level ${user.level}** and earned **1 Skill Point**!`).catch(() => {});
    }
    updateUserData(userId, user);
}

function getCooldownString(lastClaimed, cooldownMs) {
    if (!lastClaimed) return null;
    const diff = new Date() - new Date(lastClaimed);
    if (diff >= cooldownMs) return null;
    
    const timeLeft = cooldownMs - diff;
    const hours = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
    return `${hours}h ${minutes}m ${seconds}s`;
}

function evaluatePokerHand(cards) {
    const valueMap = { '2':2, '3':3, '4':4, '5':5, '6':6, '7':7, '8':8, '9':9, 'T':10, 'J':11, 'Q':12, 'K':13, 'A':14 };
    const parsed = cards.map(c => ({ val: valueMap[c[0]], suit: c[1] })).sort((a,b) => b.val - a.val);
    const valueCounts = {};
    const suitCounts = {};
    
    parsed.forEach(c => {
        valueCounts[c.val] = (valueCounts[c.val] || 0) + 1;
        suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
    });

    const counts = Object.entries(valueCounts).map(([v, count]) => ({ val: parseInt(v), count })).sort((a,b) => b.count - a.count || b.val - a.val);
    const flushSuit = Object.keys(suitCounts).find(s => suitCounts[s] >= 5);
    const isFlush = !!flushSuit;

    let uniqueVals = [...new Set(parsed.map(c => c.val))].sort((a,b) => b - a);
    let isStraight = false;
    let straightHigh = 0;
    
    if (uniqueVals.includes(14)) uniqueVals.push(1);
    uniqueVals = [...new Set(uniqueVals)].sort((a,b) => b - a);

    for (let i = 0; i <= uniqueVals.length - 5; i++) {
        if (uniqueVals[i] - uniqueVals[i+4] === 4) {
            isStraight = true;
            straightHigh = uniqueVals[i];
            break;
        }
    }

    if (isFlush && isStraight) {
        const flushCards = parsed.filter(c => c.suit === flushSuit).map(c => c.val);
        if (flushCards.includes(14) && flushCards.includes(13) && flushCards.includes(12) && flushCards.includes(11) && flushCards.includes(10)) {
            return { rank: 10, name: "Royal Flush", score: 1000000 };
        }
        return { rank: 9, name: "Straight Flush", score: 900000 + straightHigh };
    }
    if (counts[0].count === 4) return { rank: 8, name: "Four of a Kind", score: 800000 + counts[0].val };
    if (counts[0].count === 3 && counts[1] && counts[1].count >= 2) return { rank: 7, name: "Full House", score: 700000 + counts[0].val };
    if (isFlush) return { rank: 6, name: "Flush", score: 600000 + parsed[0].val };
    if (isStraight) return { rank: 5, name: "Straight", score: 500000 + straightHigh };
    if (counts[0].count === 3) return { rank: 4, name: "Three of a Kind", score: 400000 + counts[0].val };
    if (counts[0].count === 2 && counts[1] && counts[1].count === 2) return { rank: 3, name: "Two Pair", score: 300000 + counts[0].val };
    if (counts[0].count === 2) return { rank: 2, name: "One Pair", score: 200000 + counts[0].val };
    return { rank: 1, name: "High Card", score: 100000 + parsed[0].val };
}

// Global Automated Event Loop
setInterval(() => {
    if (!activeEvent && Math.random() < 0.20) {
        const types = [
            { name: "Happy Hour (+50% returns on casino games!)", type: "happy_hour", duration: 15 * 60 * 1000 },
            { name: "Double XP (2x XP from all jobs and crimes!)", type: "double_xp", duration: 15 * 60 * 1000 }
        ];
        const chosen = types[Math.floor(Math.random() * types.length)];
        activeEvent = { name: chosen.name, type: chosen.type, endsAt: Date.now() + chosen.duration };
    } else if (activeEvent && Date.now() > activeEvent.endsAt) {
        activeEvent = null;
    }
}, 5 * 60 * 1000);

client.once('ready', () => {
    console.log(`\n🎰 CasinoCore Ultimate successfully deployed as ${client.user.tag}!`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const getEventMultiplier = () => (activeEvent && activeEvent.type === "happy_hour") ? 1.5 : 1.0;

    // --- MAIN HELP UTILITY WITH EMBED FALLBACK SAFETY ---
    if (command === 'help' || command === 'commands') {
        const embed = new EmbedBuilder()
            .setTitle('🎰 CASINOCORE ULTIMATE MANUAL 🎰')
            .setDescription('All automated structural economic loops are fully live!')
            .setColor('#FFD700')
            .addFields(
                { name: '🪙 Wallet & Secure Vault', value: '`$bal` | `$dep <amount>` | `$with <amount>` | `$daily` | `$work`' },
                { name: '🕹️ Animated Casino Modules', value: '`$slots <bet>` (Visual Reels)\n`$bj <bet>` (Interactive UI Buttons)\n`$roulette <bet> <selection>` (Red/Black/Green/Number)' },
                { name: '👥 Multiplayer Challenge System', value: '`$poker <buyin> @users` (Real Odds Evaluator)\n`$duel <@user> <bet>` (Coinflip)' }
            );

        try {
            return await message.channel.send({ embeds: [embed] });
        } catch (err) {
            // Backup plain text format if the channel doesn't allow Embed Links
            const fallbackText = 
                `🎰 **CASINOCORE ULTIMATE MANUAL** 🎰\n\n` +
                `🪙 **Wallet & Vault:** \`$bal\`, \`$dep <amount>\`, \`$with <amount>\`, \`$daily\`, \`$work\`\n` +
                `🕹️ **Casino Games:** \`$slots <bet>\`, \`$bj <bet>\`, \`$roulette <bet> <selection>\`\n` +
                `👥 **Multiplayer:** \`$poker <buyin> @users\`, \`$duel <@user> <bet>\`\n\n` +
                `⚠️ *Note: Grant the bot "Embed Links" permission for the graphical UI!*`;
            
            return await message.channel.send(fallbackText).catch(e => console.error("Could not send fallback text:", e));
        }
    }

    // --- VAULT & BANK OPERATIONS ---
    if (command === 'dep' || command === 'deposit') {
        const user = getUserData(message.author.id);
        let amount = args[0] === 'all' ? user.balance : parseInt(args[0]);
        if (isNaN(amount) || amount <= 0 || user.balance < amount) return message.channel.send("❌ Invalid deposit configuration or insufficient cash balance.");
        user.balance -= amount; user.bank += amount; updateUserData(message.author.id, user);
        return message.channel.send(`🏦 Vault Updated: Deposited **${amount.toLocaleString()}** chips securely.`);
    }

    if (command === 'with' || command === 'withdraw') {
        const user = getUserData(message.author.id);
        let amount = args[0] === 'all' ? user.bank : parseInt(args[0]);
        if (isNaN(amount) || amount <= 0 || user.bank < amount) return message.channel.send("❌ Insufficient funds detected inside your bank vault.");
        user.bank -= amount; user.balance += amount; updateUserData(message.author.id, user);
        return message.channel.send(`🏦 Vault Updated: Withdrew **${amount.toLocaleString()}** chips into liquid cash.`);
    }

    if (command === 'bal' || command === 'balance') {
        const target = message.mentions.members.first() || message.member;
        const user = getUserData(target.id);
        
        try {
            const embed = new EmbedBuilder()
                .setTitle(`🪙 Financial Ledger: ${target.displayName}`)
                .setColor('#DAA520')
                .addFields(
                    { name: 'Liquid Cash', value: `🪙 **${user.balance.toLocaleString()}**`, inline: true },
                    { name: 'Vault Holdings', value: `🏦 **${user.bank.toLocaleString()}**`, inline: true },
                    { name: 'Account Tier', value: `⭐ **Lv. ${user.level}** (${user.xp} XP)`, inline: true }
                );
            return message.channel.send({ embeds: [embed] });
        } catch {
            return message.channel.send(`🪙 **${target.displayName}'s Balance:** Cash: \`${user.balance.toLocaleString()}\` chips | Vault: \`${user.bank.toLocaleString()}\` chips.`);
        }
    }

    // --- SLOT MACHINE ANIMATED ENGINE ---
    if (command === 'slots') {
        if (activeGames.has(message.author.id)) return message.channel.send("❌ Please wait for your current slot simulation sequence to finish execution!");
        const bet = parseInt(args[0]);
        if (isNaN(bet) || bet <= 0) return message.channel.send('❌ Usage Parameter Error: `$slots <bet>`');
        
        const user = getUserData(message.author.id);
        if (user.balance < bet) return message.channel.send("❌ Request Terminated: Insufficient chips.");

        activeGames.add(message.author.id);
        globalJackpot += Math.ceil(bet * 0.05);

        const symbols = ['🍒', '🍋', '🍊', '🍇', '🔔', '💎', '7️⃣'];
        
        try {
            const embed = new EmbedBuilder().setTitle("🎰 SLOT MACHINE 🎰").setColor("#FFD700")
                .setDescription("The slot reels are spinning...").addFields({ name: "Screen Display", value: "🎰 **[ 🔄 | 🔄 | 🔄 ]**" });

            const spinMessage = await message.channel.send({ embeds: [embed] });

            await new Promise(r => setTimeout(r, 800));
            embed.setFields({ name: "Screen Display", value: "🎰 **[ 🍒 | 🍇 | 🔄 ]**" });
            await spinMessage.edit({ embeds: [embed] });

            await new Promise(r => setTimeout(r, 800));
            const r1 = symbols[Math.floor(Math.random() * symbols.length)];
            const r2 = symbols[Math.floor(Math.random() * symbols.length)];
            const r3 = symbols[Math.floor(Math.random() * symbols.length)];

            let winAmount = 0; let desc = "";
            if (r1 === r2 && r2 === r3) {
                winAmount = r1 === '💎' ? (bet * 10 + globalJackpot) : (bet * 5);
                winAmount = Math.round(winAmount * getEventMultiplier());
                desc = `🎉 **TRIPLE JACKPOT HIT!** You hit matching lines and won **${winAmount.toLocaleString()}** chips!`;
                if (r1 === '💎') globalJackpot = 50000;
            } else if (r1 === r2 || r2 === r3 || r1 === r3) {
                winAmount = Math.round(bet * 1.5 * getEventMultiplier());
                desc = `💵 Double match detected! Payout tier hit: **${winAmount.toLocaleString()}** chips.`;
            } else {
                desc = `😭 No matches landed on the paylines. Lost **${bet.toLocaleString()}** chips.`;
            }

            user.balance = user.balance - bet + winAmount;
            user.missions.slotsSpun += 1;
            updateUserData(message.author.id, user);

            embed.setFields({ name: "Final Outcome", value: `🎰 **[ ${r1} | ${r2} | ${r3} ]**` }).setDescription(desc);
            await spinMessage.edit({ embeds: [embed] });
        } catch (err) {
            // Text fallback if embeds fail mid-game
            const r1 = symbols[Math.floor(Math.random() * symbols.length)];
            const r2 = symbols[Math.floor(Math.random() * symbols.length)];
            const r3 = symbols[Math.floor(Math.random() * symbols.length)];
            let state = (r1 === r2 && r2 === r3) ? "WIN" : "LOST";
            if(state === "WIN") user.balance += bet * 3; else user.balance -= bet;
            updateUserData(message.author.id, user);
            message.channel.send(`🎰 [ ${r1} | ${r2} | ${r3} ] — You ${state === "WIN" ? "won chips!" : "lost your bet."}`);
        }
        activeGames.delete(message.author.id);
    }

    // --- ROULETTE REEL ---
    if (command === 'roulette') {
        const bet = parseInt(args[0]);
        const selection = args[1]?.toLowerCase();
        if (isNaN(bet) || bet <= 0 || !selection) return message.channel.send("❌ Configuration Error: Use `$roulette <bet> <color/number>`");

        const user = getUserData(message.author.id);
        if (user.balance < bet) return message.channel.send("❌ Balance check failed: Insufficient chips.");
        activeGames.add(message.author.id);

        const colors = { red: [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36], black: [2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35] };
        const winNum = Math.floor(Math.random() * 37);
        const winColor = winNum === 0 ? "green" : (colors.red.includes(winNum) ? "red" : "black");

        let won = (selection === winColor || parseInt(selection) === winNum);
        let payout = won ? (selection === "green" ? bet * 14 : (selection === winColor ? bet * 2 : bet * 35)) : 0;
        payout = Math.round(payout * getEventMultiplier());

        user.balance = user.balance - bet + payout;
        updateUserData(message.author.id, user);

        try {
            const embed = new EmbedBuilder()
                .setTitle("🎡 ROULETTE WHEEL WHEEL RESOLUTION 🎡")
                .setFields({ name: "Winning Drop Pocket", value: `🌟 **[ ${winColor.toUpperCase()} ${winNum} ]** 🌟` })
                .setDescription(won ? `🎉 Successful Wager! You won **${payout.toLocaleString()}** chips!` : `😭 Wager Failed. You lost **${bet}** chips.`)
                .setColor(won ? "#228B22" : "#B22222");
            await message.channel.send({ embeds: [embed] });
        } catch {
            message.channel.send(`🎡 The wheel landed on **${winColor.toUpperCase()} ${winNum}**. You ${won ? `WON ${payout}` : "LOST your bet"}.`);
        }
        activeGames.delete(message.author.id);
    }

    // --- INTERACTIVE BLACKJACK ---
    if (command === 'bj' || command === 'blackjack') {
        if (activeGames.has(message.author.id)) return message.channel.send("❌ Active match state detected. Clear your active table session first!");
        const bet = parseInt(args[0]);
        if (isNaN(bet) || bet <= 0) return message.channel.send('❌ Usage Parameter Error: `$bj <bet>`');

        const user = getUserData(message.author.id);
        if (user.balance < bet) return message.channel.send("❌ Insufficient chips to match initial table entry bet.");

        activeGames.add(message.author.id);
        let pHand = [Math.floor(Math.random() * 10) + 2, Math.floor(Math.random() * 10) + 2];
        let dHand = [Math.floor(Math.random() * 10) + 2, Math.floor(Math.random() * 10) + 2];

        const score = (h) => h.reduce((a,b) => a+b, 0);
        
        try {
            const genEmbed = (reveal = false) => new EmbedBuilder().setTitle("🃏 BLACKJACK TABLE 🃏").setColor("#2F4F4F")
                .addFields(
                    { name: `Your Cards (Score: ${score(pHand)})`, value: `[ ${pHand.join(', ')} ]`, inline: true },
                    { name: `Dealer Upcard (Score: ${reveal ? score(dHand) : '?'})`, value: `[ ${reveal ? dHand.join(', ') : `${dHand[0]}, ?`} ]`, inline: true }
                );

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('hit').setLabel('🃏 Hit Card').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('stand').setLabel('🛑 Stand State').setStyle(ButtonStyle.Secondary)
            );

            const bjMsg = await message.channel.send({ embeds: [genEmbed()], components: [row] });
            const collector = bjMsg.createMessageComponentCollector({ filter: i => i.user.id === message.author.id, time: 30000 });

            collector.on('collect', async i => {
                if (i.customId === 'hit') {
                    pHand.push(Math.floor(Math.random() * 10) + 2);
                    if (score(pHand) > 21) collector.stop('busted');
                    else await i.update({ embeds: [genEmbed()] });
                } else if (i.customId === 'stand') {
                    collector.stop('stand');
                }
            });

            collector.on('end', async (_, reason) => {
                let pS = score(pHand); let dS = score(dHand);
                if (pS <= 21) { while (dS < 17) { dHand.push(Math.floor(Math.random() * 10) + 2); dS = score(dHand); } }

                let fin = 0; let msgStr = "";
                if (pS > 21 || reason === 'busted') { fin = -bet; msgStr = "💥 Hand Busted! You crossed maximum values. Lost."; }
                else if (dS > 21 || pS > dS) { fin = Math.round(bet * getEventMultiplier()); msgStr = "🎉 Win Valuation Verified! Chips transferred."; }
                else if (pS < dS) { fin = -bet; msgStr = "😭 House beats player score threshold. Lost."; }
                else msgStr = "🤝 Split Push state. Chips returned.";

                user.balance += fin; updateUserData(message.author.id, user);
                await bjMsg.edit({ embeds: [genEmbed(true).setDescription(msgStr)], components: [] });
                activeGames.delete(message.author.id);
            });
        } catch {
            // Text-only fast blackjack simulator fallback if components fail
            let finalScore = score(pHand);
            if(finalScore > 15) {
                user.balance += bet; message.channel.send(`🃏 Blackjack Fast-mode: You won! Hand value: ${finalScore}`);
            } else {
                user.balance -= bet; message.channel.send(`🃏 Blackjack Fast-mode: Dealer won. Hand value: ${finalScore}`);
            }
            updateUserData(message.author.id, user);
            activeGames.delete(message.author.id);
        }
    }

    // --- TEXAS HOLD'EM POKER MATH ALGORITHM ---
    if (command === 'poker') {
        const buyIn = parseInt(args[0]); const targets = message.mentions.users;
        if (isNaN(buyIn) || buyIn <= 0 || targets.size === 0) return message.channel.send("❌ Syntax Error: Use `$poker <buyin> @player1 ...`");

        const list = [message.author, ...targets.values()];
        for (const p of list) {
            if (getUserData(p.id).balance < buyIn) return message.channel.send(`❌ Entry Refused: ${p.username} does not hold enough tournament chips.`);
        }

        const deck = [];
        ["2","3","4","5","6","7","8","9","T","J","Q","K","A"].forEach(v => ["H","D","C","S"].forEach(s => deck.push(v+s)));
        const comm = [deck.sort(()=>Math.random()-0.5).pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];

        let best = null; let winner = null;
        list.forEach(p => {
            const pD = getUserData(p.id); pD.balance -= buyIn; updateUserData(p.id, pD);
            const res = evaluatePokerHand([deck.pop(), deck.pop(), ...comm]);
            if (!best || res.score > best.score) { best = res; winner = p; }
        });

        const winData = getUserData(winner.id); winData.balance += (buyIn * list.length); updateUserData(winner.id, winData);
        return message.channel.send(`🏆 **Texas Hold'em Table Resolved!**\nCommunity Board Cards: ${comm.join(' ')}\n👑 Winner: **${winner.username}** claiming pot with a **${best.name}**!`);
    }

    // --- COINFLIP DUELS ---
    if (command === 'duel') {
        const opp = message.mentions.users.first(); const bet = parseInt(args[1]);
        if (!opp || isNaN(bet) || bet <= 0 || opp.id === message.author.id) return message.channel.send("❌ Configuration Error: Use `$duel @user <bet>`");

        const u1 = getUserData(message.author.id); const u2 = getUserData(opp.id);
        if (u1.balance < bet || u2.balance < bet) return message.channel.send("❌ Match Cancelled: One of the requested challengers lacks matching capital.");

        const win = Math.random() < 0.5 ? message.author : opp;
        const los = win.id === message.author.id ? opp : message.author;

        updateBalance(win.id, bet); updateBalance(los.id, -bet);
        return message.channel.send(`🎲 Duel Finished! **${win.username}** wins the 1v1 coinflip showdown and secures **${bet}** chips from **${los.username}**!`);
    }

    // --- SIMULATED ACTIVE CAREERS & REWARDS ---
    if (command === 'work') {
        const user = getUserData(message.author.id);
        const cooldown = getCooldownString(user.lastWork, 30 * 60 * 1000);
        if (cooldown) return message.channel.send(`⏳ Fatigue Limit Hit. Shift cooldown expires in: **${cooldown}**.`);

        const pay = Math.round((Math.floor(Math.random() * 1500) + 500) * getEventMultiplier());
        user.balance += pay; user.lastWork = new Date().toISOString();
        updateUserData(message.author.id, user); addXP(message.author.id, 200, message.channel);
        return message.channel.send(`💼 Shift Finished! You processed your shift duties and earned **+${pay}** chips.`);
    }

    if (command === 'daily') {
        const user = getUserData(message.author.id);
        const cd = getCooldownString(user.lastDaily, 24 * 60 * 60 * 1000);
        if (cd) return message.channel.send(`❌ Allowance Blocked. Next structural daily bonus allowance available in: **${cd}**.`);
        
        user.balance += 2000; user.lastDaily = new Date().toISOString(); updateUserData(message.author.id, user);
        return message.channel.send("🎁 Daily allowance credited successfully! Added **+2,000** chips to wallet.");
    }
});

client.login(process.env.DISCORD_TOKEN);

// --- AUTOMATED PRODUCTION CRASH PREVENTION ENGINE ---
process.on('unhandledRejection', error => {
    console.error(' [Crash Preventive Log - Unhandled Rejection Caught]:', error);
});

process.on('uncaughtException', error => {
    console.error(' [Crash Preventive Log - Uncaught Exception Caught]:', error);
});