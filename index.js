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

// --- STOCARE PERMANENTĂ PENTRU RAILWAY ---
// Dacă rulăm pe Railway, creăm fișierele în /app/data (un Volume persistat care nu se șterge la restart)
const DATA_DIR = fs.existsSync('/app/data') ? '/app/data' : __dirname;
const ECONOMY_FILE = path.join(DATA_DIR, 'economy.json');
const CLANS_FILE = path.join(DATA_DIR, 'clans.json');
const MARKET_FILE = path.join(DATA_DIR, 'market.json');

// Set pentru a preveni spam-ul (jocuri active)
const activeGames = new Set();

// Jackpot global (în memorie, pornește de la 50.000)
let globalJackpot = 50000;

// Evenimente globale active (în memorie)
let activeEvent = null; 

// --- CONFIGURAȚII ---
const shopItems = [
    { id: "vip_bronze", name: "Bronze VIP Pass", price: 5000, multiplier: 1.1, desc: "Multiplicator permanent de 1.1x la Daily/Weekly!" },
    { id: "vip_silver", name: "Silver VIP Pass", price: 15000, multiplier: 1.3, desc: "Multiplicator permanent de 1.3x la Daily/Weekly!" },
    { id: "vip_gold", name: "Gold VIP Pass", price: 50000, multiplier: 1.5, desc: "Multiplicator permanent de 1.5x la Daily/Weekly!" },
    { id: "lucky_charm", name: "Lucky Charm", price: 2000, multiplier: 1.0, desc: "Deblochează realizări speciale și ajută la noroc!" }
];

const jobList = [
    { id: "pilot", name: "Commercial Pilot", reqSkill: "intelligence", reqLevel: 3, payoutMin: 1200, payoutMax: 2500, desc: "Necesită Inteligență Lv. 3. Sigur și bine plătit." },
    { id: "trader", name: "Stock Trader", reqSkill: "intelligence", reqLevel: 5, payoutMin: 500, payoutMax: 5000, desc: "Necesită Inteligență Lv. 5. Risc mare, profit extrem." },
    { id: "magician", name: "Grand Magician", reqSkill: "luck", reqLevel: 4, payoutMin: 1000, payoutMax: 2200, desc: "Necesită Noroc Lv. 4. Generează recompense misterioase." },
    { id: "bodyguard", name: "VIP Bodyguard", reqSkill: "strength", reqLevel: 4, payoutMin: 1100, payoutMax: 2000, desc: "Necesită Forță Lv. 4. Apără țintele pentru bani siguri." }
];

const propertyList = [
    { id: "apartment", name: "Cozy Apartment", price: 30000, rent: 1200, desc: "Generează 1,200 chips zilnic." },
    { id: "villa", name: "Luxury Villa", price: 120000, rent: 5500, desc: "Generează 5,500 chips zilnic." },
    { id: "penthouse", name: "VIP Penthouse", price: 350000, rent: 18000, desc: "Generează 18,000 chips zilnic." }
];

const lootBoxes = {
    mythic: { price: 25000, name: "Mythic Box" },
    legendary: { price: 75000, name: "Legendary Box" }
};

// --- MANAGEMENT DATE (JSON SAFE) ---
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
        channel.send(`🎉 **${client.users.cache.get(userId)?.username || 'Jucătorul'}** a ajuns la **Nivelul ${user.level}** și a primit **1 Punct de Abilitate**!`);
    }
    updateUserData(userId, user);
}

function loadClans() {
    if (!fs.existsSync(CLANS_FILE)) fs.writeFileSync(CLANS_FILE, JSON.stringify({}), 'utf8');
    return JSON.parse(fs.readFileSync(CLANS_FILE, 'utf8') || '{}');
}
function saveClans(data) {
    fs.writeFileSync(CLANS_FILE, JSON.stringify(data, null, 4), 'utf8');
}

function loadMarket() {
    if (!fs.existsSync(MARKET_FILE)) fs.writeFileSync(MARKET_FILE, JSON.stringify([]), 'utf8');
    return JSON.parse(fs.readFileSync(MARKET_FILE, 'utf8') || '[]');
}
function saveMarket(data) {
    fs.writeFileSync(MARKET_FILE, JSON.stringify(data, null, 4), 'utf8');
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

function checkAchievements(userId) {
    const user = getUserData(userId);
    const earned = [];
    const unlock = (id, name) => {
        if (!user.achievements.includes(id)) {
            user.achievements.push(id);
            earned.push(name);
        }
    };
    if (user.balance >= 100000) unlock("high_roller", "💎 High Roller (100k+ chips)");
    if (user.inventory.includes("vip_gold")) unlock("golden_member", "🌟 Golden VIP Pass");
    if (user.missions.slotsSpun >= 10) unlock("slot_addict", "🎰 Slot Enthusiast");

    if (earned.length > 0) updateUserData(userId, user);
    return earned;
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

// Tick-er Evenimente Automate
setInterval(() => {
    if (!activeEvent && Math.random() < 0.20) {
        const types = [
            { name: "Happy Hour (+50% profit la jocuri!)", type: "happy_hour", duration: 15 * 60 * 1000 },
            { name: "Double XP (2x XP la activități!)", type: "double_xp", duration: 15 * 60 * 1000 }
        ];
        const chosen = types[Math.floor(Math.random() * types.length)];
        activeEvent = { name: chosen.name, type: chosen.type, endsAt: Date.now() + chosen.duration };
    } else if (activeEvent && Date.now() > activeEvent.endsAt) {
        activeEvent = null;
    }
}, 5 * 60 * 1000);

client.once('ready', () => {
    console.log(`\n🎰 CasinoCore Ultimate rulat cu succes ca ${client.user.tag}!`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const getEventMultiplier = () => (activeEvent && activeEvent.type === "happy_hour") ? 1.5 : 1.0;

    // --- COMANDĂ HELP ---
    if (command === 'help' || command === 'commands') {
        const embed = new EmbedBuilder()
            .setTitle('🎰 CASINOCORE ULTIMATE MANUAL 🎰')
            .setDescription('Toate sistemele avansate economice sunt active!')
            .setColor('#FFD700')
            .addFields(
                { name: '🪙 Portofel & Seif', value: '`$bal` | `$dep <sumă>` | `$with <sumă>` | `$loan <sumă>` | `$transfer` | `$prestige`' },
                { name: '🕹️ Jocuri Vizuale', value: '`$slots <bet>` (Animație live)\n`$bj <bet>` (Butoane interactive)\n`$roulette <bet> <opțiune>` (Red/Black/Green/Număr)' },
                { name: '👥 Multiplayer & Clane', value: '`$poker <buyin> @useri` (Evaluator Real)\n`$duel <@user> <bet>` | `$clan` | `$clanwar`' },
                { name: '💼 Carieră & Simulare', value: '`$work <job>` | `$crime` | `$properties` | `$skill` | `$lootbox` | `$market` | `$missions` | `$weekly`' }
            );
        return message.channel.send({ embeds: [embed] });
    }

    // --- BANCĂ & STATISTICI ---
    if (command === 'dep' || command === 'deposit') {
        const user = getUserData(message.author.id);
        let amount = args[0] === 'all' ? user.balance : parseInt(args[0]);
        if (isNaN(amount) || amount <= 0 || user.balance < amount) return message.channel.send("❌ Sumă invalidă sau fonduri insuficiente.");
        user.balance -= amount; user.bank += amount; updateUserData(message.author.id, user);
        return message.channel.send(`🏦 Ai depus **${amount.toLocaleString()}** chips în contul tău.`);
    }

    if (command === 'with' || command === 'withdraw') {
        const user = getUserData(message.author.id);
        let amount = args[0] === 'all' ? user.bank : parseInt(args[0]);
        if (isNaN(amount) || amount <= 0 || user.bank < amount) return message.channel.send("❌ Fonduri bancare insuficiente.");
        user.bank -= amount; user.balance += amount; updateUserData(message.author.id, user);
        return message.channel.send(`🏦 Ai retras **${amount.toLocaleString()}** chips.`);
    }

    if (command === 'bal' || command === 'balance') {
        const target = message.mentions.members.first() || message.member;
        const user = getUserData(target.id);
        const embed = new EmbedBuilder()
            .setTitle(`🪙 Portofelul lui ${target.displayName}`)
            .setColor('#DAA520')
            .addFields(
                { name: 'Bani Cash', value: `🪙 **${user.balance.toLocaleString()}**`, inline: true },
                { name: 'Bancă', value: `🏦 **${user.bank.toLocaleString()}**`, inline: true },
                { name: 'Nivel', value: `⭐ **Lv. ${user.level}** (${user.xp} XP)`, inline: true }
            );
        return message.channel.send({ embeds: [embed] });
    }

    // --- ANIMAȚIE PREMIUM: SLOTS ---
    if (command === 'slots') {
        if (activeGames.has(message.author.id)) return message.channel.send("❌ Termină jocul curent mai întâi!");
        const bet = parseInt(args[0]);
        if (isNaN(bet) || bet <= 0) return message.channel.send('❌ Utilizare: `$slots <sumă>`');
        
        const user = getUserData(message.author.id);
        if (user.balance < bet) return message.channel.send("❌ Nivel de chips insuficient.");

        activeGames.add(message.author.id);
        globalJackpot += Math.ceil(bet * 0.05);

        const symbols = ['🍒', '🍋', '🍊', '🍇', '🔔', '💎', '7️⃣'];
        const embed = new EmbedBuilder().setTitle("🎰 SLOT MACHINE 🎰").setColor("#FFD700")
            .setDescription("Rolele se învârt...").addFields({ name: "Ecran", value: "🎰 **[ 🔄 | 🔄 | 🔄 ]**" });

        const spinMessage = await message.channel.send({ embeds: [embed] });

        await new Promise(r => setTimeout(r, 900));
        embed.setFields({ name: "Ecran", value: "🎰 **[ 🍒 | 🍇 | 🔄 ]**" });
        await spinMessage.edit({ embeds: [embed] });

        await new Promise(r => setTimeout(r, 900));
        const r1 = symbols[Math.floor(Math.random() * symbols.length)];
        const r2 = symbols[Math.floor(Math.random() * symbols.length)];
        const r3 = symbols[Math.floor(Math.random() * symbols.length)];

        let winAmount = 0; let desc = "";
        if (r1 === r2 && r2 === r3) {
            winAmount = r1 === '💎' ? (bet * 10 + globalJackpot) : (bet * 5);
            winAmount = Math.round(winAmount * getEventMultiplier());
            desc = `🎉 **JACKPOT TRIPLUL!** Ai câștigat **${winAmount.toLocaleString()}** chips!`;
            if (r1 === '💎') globalJackpot = 50000;
        } else if (r1 === r2 || r2 === r3 || r1 === r3) {
            winAmount = Math.round(bet * 1.5 * getEventMultiplier());
            desc = `💵 Dublă găsită! Ai câștigat **${winAmount.toLocaleString()}** chips.`;
        } else {
            desc = `😭 Nicio potrivire. Ai pierdut **${bet.toLocaleString()}** chips.`;
        }

        user.balance = user.balance - bet + winAmount;
        user.missions.slotsSpun += 1;
        updateUserData(message.author.id, user);

        embed.setFields({ name: "Rezultat Final", value: `🎰 **[ ${r1} | ${r2} | ${r3} ]**` }).setDescription(desc);
        await spinMessage.edit({ embeds: [embed] });
        activeGames.delete(message.author.id);
    }

    // --- ANIMAȚIE PREMIUM: ROULETTE ---
    if (command === 'roulette') {
        const bet = parseInt(args[0]);
        const selection = args[1]?.toLowerCase();
        if (isNaN(bet) || bet <= 0 || !selection) return message.channel.send("❌ Utilizare: `$roulette <bet> <color/number>`");

        const user = getUserData(message.author.id);
        if (user.balance < bet) return message.channel.send("❌ Nu ai destui chips.");
        if (activeGames.has(message.author.id)) return message.channel.send("❌ Ai deja un joc în desfășurare.");

        activeGames.add(message.author.id);
        const embed = new EmbedBuilder().setTitle("🎡 ROULETTE WHEEL 🎡").setColor("#006400")
            .addFields({ name: "Roata se învârte...", value: "`[ 🔴 14 ] [ ⚫ 2 ] [ 🟢 0 ]`" });

        const msg = await message.channel.send({ embeds: [embed] });

        await new Promise(r => setTimeout(r, 1000));
        embed.setFields({ name: "Bila încetinește...", value: "`[ ⚫ 35 ] [ 🔴 12 ] [ 🟢 0 ]`" });
        await msg.edit({ embeds: [embed] });

        const colors = { red: [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36], black: [2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35] };
        const winNum = Math.floor(Math.random() * 37);
        const winColor = winNum === 0 ? "green" : (colors.red.includes(winNum) ? "red" : "black");

        let won = (selection === winColor || parseInt(selection) === winNum);
        let payout = won ? (selection === "green" ? bet * 14 : (selection === winColor ? bet * 2 : bet * 35)) : 0;
        payout = Math.round(payout * getEventMultiplier());

        user.balance = user.balance - bet + payout;
        updateUserData(message.author.id, user);

        embed.setFields({ name: "Rezultat", value: `🌟 **[ ${winColor.toUpperCase()} ${winNum} ]** 🌟` })
             .setDescription(won ? `🎉 Ai câștigat **${payout.toLocaleString()}** chips!` : `😭 Ai pierdut **${bet}** chips.`)
             .setColor(won ? "#228B22" : "#B22222");
        
        await msg.edit({ embeds: [embed] });
        activeGames.delete(message.author.id);
    }

    // --- BLACKJACK INTRACTIV (BUTOANE) ---
    if (command === 'bj' || command === 'blackjack') {
        if (activeGames.has(message.author.id)) return message.channel.send("❌ Termină jocul curent mai întâi!");
        const bet = parseInt(args[0]);
        if (isNaN(bet) || bet <= 0) return message.channel.send('❌ Utilizare: `$bj <sumă>`');

        const user = getUserData(message.author.id);
        if (user.balance < bet) return message.channel.send("❌ Fonduri insuficiente.");

        activeGames.add(message.author.id);
        let pHand = [Math.floor(Math.random() * 10) + 2, Math.floor(Math.random() * 10) + 2];
        let dHand = [Math.floor(Math.random() * 10) + 2, Math.floor(Math.random() * 10) + 2];

        const score = (h) => h.reduce((a,b) => a+b, 0);
        const genEmbed = (reveal = false) => new EmbedBuilder().setTitle("🃏 BLACKJACK TABLE 🃏").setColor("#2F4F4F")
            .addFields(
                { name: `Mâna Ta (Scor: ${score(pHand)})`, value: `[ ${pHand.join(', ')} ]`, inline: true },
                { name: `Dealer (Scor: ${reveal ? score(dHand) : '?'})`, value: `[ ${reveal ? dHand.join(', ') : `${dHand[0]}, ?`} ]`, inline: true }
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('hit').setLabel('🃏 Hit').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('stand').setLabel('🛑 Stand').setStyle(ButtonStyle.Secondary)
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
            if (pS > 21 || reason === 'busted') { fin = -bet; msgStr = "💥 Ai dat BUST! Ai pierdut."; }
            else if (dS > 21 || pS > dS) { fin = Math.round(bet * getEventMultiplier()); msgStr = "🎉 Ai câștigat!"; }
            else if (pS < dS) { fin = -bet; msgStr = "😭 Dealerul a câștigat."; }
            else msgStr = "🤝 Egalitate (Push).";

            user.balance += fin; updateUserData(message.author.id, user);
            await bjMsg.edit({ embeds: [genEmbed(true).setDescription(msgStr)], components: [] });
            activeGames.delete(message.author.id);
        });
    }

    // --- MOTOR POKER REAL ---
    if (command === 'poker') {
        const buyIn = parseInt(args[0]); const targets = message.mentions.users;
        if (isNaN(buyIn) || buyIn <= 0 || targets.size === 0) return message.channel.send("❌ Utilizare: `$poker <buyin> @player1 ...`");

        const list = [message.author, ...targets.values()];
        for (const p of list) {
            if (getUserData(p.id).balance < buyIn) return message.channel.send(`❌ ${p.username} nu are suficienți chips.`);
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
        return message.channel.send(`🏆 **Poker Texas Hold'em!**\nCommunity Cards: ${comm.join(' ')}\n👑 Câștigător: **${winner.username}** cu **${best.name}**! A luat tot potul!`);
    }

    // --- COINFLIP DUEL ---
    if (command === 'duel') {
        const opp = message.mentions.users.first(); const bet = parseInt(args[1]);
        if (!opp || isNaN(bet) || bet <= 0 || opp.id === message.author.id) return message.channel.send("❌ Utilizare: `$duel @user <bet>`");

        const u1 = getUserData(message.author.id); const u2 = getUserData(opp.id);
        if (u1.balance < bet || u2.balance < bet) return message.channel.send("❌ Unul dintre jucători nu are destui bani.");

        const win = Math.random() < 0.5 ? message.author : opp;
        const los = win.id === message.author.id ? opp : message.author;

        updateBalance(win.id, bet); updateBalance(los.id, -bet);
        return message.channel.send(`🎲 Duelul s-a încheiat! **${win.username}** a câștigat **${bet}** chips de la **${los.username}**!`);
    }

    // --- CARIERĂ & PASIV ---
    if (command === 'work') {
        const user = getUserData(message.author.id);
        const cooldown = getCooldownString(user.lastWork, 30 * 60 * 1000);
        if (cooldown) return message.channel.send(`⏳ Ești obosit. Poți lucra din nou peste: **${cooldown}**.`);

        const pay = Math.round((Math.floor(Math.random() * 1500) + 500) * getEventMultiplier());
        user.balance += pay; user.lastWork = new Date().toISOString();
        updateUserData(message.author.id, user); addXP(message.author.id, 200, message.channel);
        return message.channel.send(`💼 Ai terminat tura și ai primit **+${pay}** chips.`);
    }

    if (command === 'daily') {
        const user = getUserData(message.author.id);
        const cd = getCooldownString(user.lastDaily, 24 * 60 * 60 * 1000);
        if (cd) return message.channel.send(`❌ Ai luat deja recompensa. Revino peste: **${cd}**.`);
        
        user.balance += 2000; user.lastDaily = new Date().toISOString(); updateUserData(message.author.id, user);
        return message.channel.send("🎁 Ai primit **+2,000** chips zilnici!");
    }
});

client.login(process.env.DISCORD_TOKEN);