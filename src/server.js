require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const db = require('./database');
const { createChickenRoadGame, chickenGo, chickenCashOut, playKeno } = require('./games');
const { initBot } = require('./bot');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MINI_APP_URL = process.env.MINI_APP_URL || `http://localhost:${PORT}`;

const gameSessions = new Map();

// ============ AUTH ============
function validateTelegramAuth(initData) {
  try {
    if (!initData) return null;
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (calculatedHash === hash) {
      return JSON.parse(params.get('user'));
    }
    return null;
  } catch (e) { return null; }
}

function authMiddleware(req, res, next) {
  const initData = req.headers['x-telegram-init-data'];
  const devTelegramId = req.headers['x-telegram-id'];
  if (initData) {
    const user = validateTelegramAuth(initData);
    if (user) { req.telegramUser = user; return next(); }
  }
  if (devTelegramId) { req.telegramUser = { id: devTelegramId, first_name: 'User' }; return next(); }
  res.status(401).json({ error: 'Unauthorized' });
}

// ============ USER ROUTES ============
app.post('/api/auth', (req, res) => {
  try {
    const { initData, telegramId, firstName, lastName, username, referralCode } = req.body;
    let telegramUser;
    if (initData) telegramUser = validateTelegramAuth(initData);
    const tgId = telegramUser ? String(telegramUser.id) : String(telegramId);
    const fName = telegramUser ? telegramUser.first_name : firstName;
    const lName = telegramUser ? telegramUser.last_name : lastName;
    const uName = telegramUser ? telegramUser.username : username;
    if (!tgId) return res.status(400).json({ error: 'Invalid auth data' });

    let user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(tgId);
    if (!user) {
      const refCode = 'DB' + tgId + Math.random().toString(36).substring(2, 6).toUpperCase();
      db.prepare(`INSERT INTO users (telegram_id, username, first_name, last_name, referral_code) VALUES (?, ?, ?, ?, ?)`)
        .run(tgId, uName || '', fName || '', lName || '', refCode);
      user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(tgId);
      if (referralCode) {
        const referrer = db.prepare('SELECT * FROM users WHERE telegram_id = ? OR referral_code = ?').get(referralCode, referralCode);
        if (referrer && referrer.id !== user.id) {
          db.prepare('UPDATE users SET referred_by = ? WHERE id = ?').run(referrer.id, user.id);
          db.prepare('INSERT INTO referrals (referrer_id, referred_id) VALUES (?, ?)').run(referrer.id, user.id);
        }
      }
    }

    res.json({
      success: true,
      user: {
        id: user.id, telegramId: user.telegram_id, username: user.username,
        firstName: user.first_name, lastName: user.last_name, balance: user.balance,
        referralCode: user.referral_code, totalDeposited: user.total_deposited,
        totalWithdrawn: user.total_withdrawn, totalWagered: user.total_wagered,
        totalWon: user.total_won, totalLost: user.total_lost, createdAt: user.created_at
      }
    });
  } catch (err) { console.error('Auth error:', err); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/user/profile', authMiddleware, (req, res) => {
  const tgId = String(req.telegramUser.id);
  const user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(tgId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const referralCount = db.prepare('SELECT COUNT(*) as count FROM referrals WHERE referrer_id = ?').get(user.id).count;
  const referralEarnings = db.prepare('SELECT COALESCE(SUM(bonus_amount), 0) as total FROM referrals WHERE referrer_id = ? AND bonus_paid = 1').get(user.id).total;
  res.json({
    user: {
      id: user.id, telegramId: user.telegram_id, username: user.username,
      firstName: user.first_name, balance: user.balance, referralCode: user.referral_code,
      totalDeposited: user.total_deposited, totalWithdrawn: user.total_withdrawn,
      totalWagered: user.total_wagered, totalWon: user.total_won, totalLost: user.total_lost,
      referralCount, referralEarnings, createdAt: user.created_at
    }
  });
});

// ============ WALLET ROUTES ============
app.get('/api/wallet/balance', authMiddleware, (req, res) => {
  const tgId = String(req.telegramUser.id);
  const user = db.prepare('SELECT balance FROM users WHERE telegram_id = ?').get(tgId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ balance: user.balance });
});

app.post('/api/wallet/deposit', authMiddleware, (req, res) => {
  try {
    const tgId = String(req.telegramUser.id);
    const { amount, method, transactionRef } = req.body;
    if (!amount || amount < 10) return res.status(400).json({ error: 'Minimum deposit is 10 ETB' });
    if (!method || !['telbirr', 'cbe_birr', 'cbe_account'].includes(method)) return res.status(400).json({ error: 'Invalid payment method' });
    if (!transactionRef) return res.status(400).json({ error: 'Transaction reference required' });
    const user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(tgId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    db.prepare('INSERT INTO deposits (user_id, amount, method, transaction_ref, status) VALUES (?, ?, ?, ?, ?)').run(user.id, amount, method, transactionRef, 'pending');
    res.json({ success: true, message: 'Deposit request submitted. It will be verified by admin shortly.' });
  } catch (err) { console.error('Deposit error:', err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/wallet/withdraw', authMiddleware, (req, res) => {
  try {
    const tgId = String(req.telegramUser.id);
    const { amount, method, accountNumber } = req.body;
    if (!amount || amount < 50) return res.status(400).json({ error: 'Minimum withdrawal is 50 ETB' });
    if (!method) return res.status(400).json({ error: 'Payment method required' });
    if (!accountNumber) return res.status(400).json({ error: 'Account number required' });
    const user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(tgId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.balance < amount) return res.status(400).json({ error: 'Insufficient balance' });
    db.prepare('UPDATE users SET balance = balance - ?, total_withdrawn = total_withdrawn + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(amount, amount, user.id);
    db.prepare('INSERT INTO withdrawals (user_id, amount, method, account_number, status) VALUES (?, ?, ?, ?, ?)').run(user.id, amount, method, accountNumber, 'pending');
    const updatedUser = db.prepare('SELECT balance FROM users WHERE id = ?').get(user.id);
    db.prepare('INSERT INTO transactions (user_id, type, amount, balance_after, description) VALUES (?, ?, ?, ?, ?)').run(user.id, 'withdrawal', -amount, updatedUser.balance, `Withdrawal via ${method}`);
    res.json({ success: true, message: 'Withdrawal request submitted.', balance: updatedUser.balance });
  } catch (err) { console.error('Withdrawal error:', err); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/wallet/transactions', authMiddleware, (req, res) => {
  const tgId = String(req.telegramUser.id);
  const user = db.prepare('SELECT id FROM users WHERE telegram_id = ?').get(tgId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const transactions = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(user.id);
  const deposits = db.prepare('SELECT * FROM deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(user.id);
  const withdrawals = db.prepare('SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(user.id);
  res.json({ transactions, deposits, withdrawals });
});

// ============ CHICKEN ROAD GAME ROUTES ============
app.post('/api/games/chicken-road/start', authMiddleware, (req, res) => {
  try {
    const tgId = String(req.telegramUser.id);
    const { betAmount, difficulty } = req.body;
    if (!betAmount || betAmount < 5) return res.status(400).json({ error: 'Minimum bet is 5 ETB' });
    const user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(tgId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.balance < betAmount) return res.status(400).json({ error: 'Insufficient balance' });

    db.prepare('UPDATE users SET balance = balance - ?, total_wagered = total_wagered + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(betAmount, betAmount, user.id);

    const gameState = createChickenRoadGame(betAmount, difficulty || 'easy');
    const sessionId = crypto.randomUUID();
    gameSessions.set(sessionId, { ...gameState, userId: user.id, tgId });

    const updatedUser = db.prepare('SELECT balance FROM users WHERE id = ?').get(user.id);

    res.json({
      success: true,
      sessionId,
      columns: gameState.columns,
      difficulty: gameState.difficulty,
      multipliers: gameState.multipliers,
      crashChanceLabel: gameState.config.crashChanceLabel,
      balance: updatedUser.balance
    });
  } catch (err) { console.error('CR start error:', err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/games/chicken-road/go', authMiddleware, (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = gameSessions.get(sessionId);
    if (!session) return res.status(404).json({ error: 'Game session not found' });

    const result = chickenGo(session);
    if (result.error) return res.status(400).json({ error: result.error });
    gameSessions.set(sessionId, result);

    const response = {
      crashed: result.crashed,
      currentColumn: result.currentColumn,
      multiplier: result.multiplier,
      gameOver: result.gameOver,
      columns: result.columns,
      passedColumns: result.passedColumns
    };

    if (result.gameOver) {
      const payout = result.payout || 0;
      if (payout > 0) {
        db.prepare('UPDATE users SET balance = balance + ?, total_won = total_won + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(payout, payout, session.userId);
      } else {
        db.prepare('UPDATE users SET total_lost = total_lost + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(session.betAmount, session.userId);
      }
      db.prepare('INSERT INTO games (user_id, game_type, bet_amount, multiplier, payout, result, game_data) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(session.userId, 'chicken_road', session.betAmount, result.multiplier, payout, result.result, JSON.stringify({ difficulty: result.difficulty, column: result.currentColumn }));
      const updatedUser = db.prepare('SELECT balance FROM users WHERE id = ?').get(session.userId);
      db.prepare('INSERT INTO transactions (user_id, type, amount, balance_after, description) VALUES (?, ?, ?, ?, ?)')
        .run(session.userId, 'game', payout > 0 ? payout : -session.betAmount, updatedUser.balance, `Chicken Road ${result.difficulty} - ${result.result}`);
      response.payout = payout;
      response.balance = updatedUser.balance;
      checkReferralBonus(session.userId);
      gameSessions.delete(sessionId);
    }

    res.json(response);
  } catch (err) { console.error('CR jump error:', err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/games/chicken-road/cashout', authMiddleware, (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = gameSessions.get(sessionId);
    if (!session) return res.status(404).json({ error: 'Game session not found' });
    const result = chickenCashOut(session);
    if (result.error) return res.status(400).json({ error: result.error });
    const payout = result.payout;
    db.prepare('UPDATE users SET balance = balance + ?, total_won = total_won + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(payout, payout, session.userId);
    db.prepare('INSERT INTO games (user_id, game_type, bet_amount, multiplier, payout, result, game_data) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(session.userId, 'chicken_road', session.betAmount, result.multiplier, payout, 'win', JSON.stringify({ difficulty: result.difficulty, column: result.currentColumn }));
    const updatedUser = db.prepare('SELECT balance FROM users WHERE id = ?').get(session.userId);
    db.prepare('INSERT INTO transactions (user_id, type, amount, balance_after, description) VALUES (?, ?, ?, ?, ?)')
      .run(session.userId, 'game', payout, updatedUser.balance, `Chicken Road ${result.difficulty} - Cash Out x${result.multiplier}`);
    gameSessions.delete(sessionId);
    res.json({ success: true, payout, multiplier: result.multiplier, balance: updatedUser.balance });
  } catch (err) { console.error('CR cashout error:', err); res.status(500).json({ error: 'Server error' }); }
});

// ============ KENO ROUTE ============
app.post('/api/games/keno/play', authMiddleware, (req, res) => {
  try {
    const tgId = String(req.telegramUser.id);
    const { betAmount, picks } = req.body;
    if (!betAmount || betAmount < 5) return res.status(400).json({ error: 'Minimum bet is 5 ETB' });
    if (!picks || picks.length < 1 || picks.length > 10) return res.status(400).json({ error: 'Pick 1-10 numbers' });
    const user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(tgId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.balance < betAmount) return res.status(400).json({ error: 'Insufficient balance' });
    db.prepare('UPDATE users SET balance = balance - ?, total_wagered = total_wagered + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(betAmount, betAmount, user.id);
    const result = playKeno(betAmount, picks);
    if (result.payout > 0) {
      db.prepare('UPDATE users SET balance = balance + ?, total_won = total_won + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(result.payout, result.payout, user.id);
    } else {
      db.prepare('UPDATE users SET total_lost = total_lost + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(betAmount, user.id);
    }
    db.prepare('INSERT INTO games (user_id, game_type, bet_amount, multiplier, payout, result, game_data) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(user.id, 'keno', betAmount, result.multiplier, result.payout, result.result, JSON.stringify({ picks, drawn: result.drawnNumbers, matches: result.matches }));
    const updatedUser = db.prepare('SELECT balance FROM users WHERE id = ?').get(user.id);
    db.prepare('INSERT INTO transactions (user_id, type, amount, balance_after, description) VALUES (?, ?, ?, ?, ?)')
      .run(user.id, 'game', result.payout > 0 ? result.payout : -betAmount, updatedUser.balance, `Fast Keno - ${result.matchCount} matches`);
    checkReferralBonus(user.id);
    res.json({ ...result, balance: updatedUser.balance });
  } catch (err) { console.error('Keno error:', err); res.status(500).json({ error: 'Server error' }); }
});

// ============ PROMO CODE ============
app.post('/api/promo/redeem', authMiddleware, (req, res) => {
  try {
    const tgId = String(req.telegramUser.id);
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Promo code required' });
    const user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(tgId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const promo = db.prepare('SELECT * FROM promo_codes WHERE code = ? AND active = 1').get(code.toUpperCase());
    if (!promo) return res.status(404).json({ error: 'Invalid or expired promo code' });
    if (promo.current_uses >= promo.max_uses) return res.status(400).json({ error: 'Promo code fully redeemed' });
    const existing = db.prepare('SELECT id FROM promo_redemptions WHERE user_id = ? AND promo_id = ?').get(user.id, promo.id);
    if (existing) return res.status(400).json({ error: 'You already redeemed this code' });
    db.prepare('UPDATE users SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(promo.bonus_amount, user.id);
    db.prepare('UPDATE promo_codes SET current_uses = current_uses + 1 WHERE id = ?').run(promo.id);
    db.prepare('INSERT INTO promo_redemptions (user_id, promo_id, amount) VALUES (?, ?, ?)').run(user.id, promo.id, promo.bonus_amount);
    const updatedUser = db.prepare('SELECT balance FROM users WHERE id = ?').get(user.id);
    db.prepare('INSERT INTO transactions (user_id, type, amount, balance_after, description) VALUES (?, ?, ?, ?, ?)').run(user.id, 'promo', promo.bonus_amount, updatedUser.balance, `Promo code: ${code}`);
    res.json({ success: true, bonus: promo.bonus_amount, balance: updatedUser.balance });
  } catch (err) { console.error('Promo error:', err); res.status(500).json({ error: 'Server error' }); }
});

// ============ CASHBACK ============
app.post('/api/cashback/claim', authMiddleware, (req, res) => {
  try {
    const tgId = String(req.telegramUser.id);
    const user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(tgId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const losses = db.prepare(`SELECT COALESCE(SUM(bet_amount - payout), 0) as total_loss FROM games WHERE user_id = ? AND result = 'loss' AND created_at > ?`).get(user.id, yesterday);
    const existingCashback = db.prepare('SELECT id FROM cashback WHERE user_id = ? AND period_end > ?').get(user.id, yesterday);
    if (existingCashback) return res.status(400).json({ error: 'Cashback already claimed for this period' });
    const cashbackAmount = parseFloat((losses.total_loss * 0.20).toFixed(2));
    if (cashbackAmount < 1) return res.status(400).json({ error: 'No cashback available (minimum 1 ETB)' });
    db.prepare('UPDATE users SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(cashbackAmount, user.id);
    db.prepare('INSERT INTO cashback (user_id, amount, period_start, period_end) VALUES (?, ?, ?, CURRENT_TIMESTAMP)').run(user.id, cashbackAmount, yesterday);
    const updatedUser = db.prepare('SELECT balance FROM users WHERE id = ?').get(user.id);
    db.prepare('INSERT INTO transactions (user_id, type, amount, balance_after, description) VALUES (?, ?, ?, ?, ?)').run(user.id, 'cashback', cashbackAmount, updatedUser.balance, `20% cashback on losses`);
    res.json({ success: true, cashback: cashbackAmount, balance: updatedUser.balance });
  } catch (err) { console.error('Cashback error:', err); res.status(500).json({ error: 'Server error' }); }
});

// ============ REFERRAL BONUS ============
function checkReferralBonus(userId) {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user || !user.referred_by) return;
    const referral = db.prepare('SELECT * FROM referrals WHERE referred_id = ? AND bonus_paid = 0').get(userId);
    if (!referral) return;
    if (user.total_deposited >= 100) {
      const bonusAmount = 10;
      db.prepare('UPDATE users SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(bonusAmount, user.referred_by);
      db.prepare('UPDATE referrals SET bonus_amount = ?, bonus_paid = 1 WHERE id = ?').run(bonusAmount, referral.id);
      const referrer = db.prepare('SELECT balance FROM users WHERE id = ?').get(user.referred_by);
      db.prepare('INSERT INTO transactions (user_id, type, amount, balance_after, description) VALUES (?, ?, ?, ?, ?)').run(user.referred_by, 'referral_bonus', bonusAmount, referrer.balance, `Referral bonus for user #${userId}`);
    }
  } catch (err) { console.error('Referral bonus error:', err); }
}

// ============ ADMIN ROUTES ============
function adminAuth(req, res, next) {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== (process.env.ADMIN_KEY || 'dashbet_admin_2024')) return res.status(403).json({ error: 'Forbidden' });
  next();
}

app.get('/api/admin/deposits', adminAuth, (req, res) => {
  const deposits = db.prepare(`SELECT d.*, u.telegram_id, u.username, u.first_name FROM deposits d JOIN users u ON d.user_id = u.id ORDER BY d.created_at DESC LIMIT 50`).all();
  res.json({ deposits });
});

app.post('/api/admin/deposits/:id/approve', adminAuth, (req, res) => {
  const deposit = db.prepare('SELECT * FROM deposits WHERE id = ? AND status = ?').get(req.params.id, 'pending');
  if (!deposit) return res.status(404).json({ error: 'Deposit not found or already processed' });
  db.prepare('UPDATE deposits SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('approved', deposit.id);
  db.prepare('UPDATE users SET balance = balance + ?, total_deposited = total_deposited + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(deposit.amount, deposit.amount, deposit.user_id);
  const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(deposit.user_id);
  db.prepare('INSERT INTO transactions (user_id, type, amount, balance_after, description) VALUES (?, ?, ?, ?, ?)').run(deposit.user_id, 'deposit', deposit.amount, user.balance, `Deposit via ${deposit.method} approved`);
  checkReferralBonus(deposit.user_id);
  res.json({ success: true, message: 'Deposit approved' });
});

app.post('/api/admin/deposits/:id/reject', adminAuth, (req, res) => {
  db.prepare('UPDATE deposits SET status = ?, admin_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('rejected', req.body.note || '', req.params.id);
  res.json({ success: true, message: 'Deposit rejected' });
});

app.get('/api/admin/withdrawals', adminAuth, (req, res) => {
  const withdrawals = db.prepare(`SELECT w.*, u.telegram_id, u.username, u.first_name FROM withdrawals w JOIN users u ON w.user_id = u.id ORDER BY w.created_at DESC LIMIT 50`).all();
  res.json({ withdrawals });
});

app.post('/api/admin/withdrawals/:id/approve', adminAuth, (req, res) => {
  db.prepare('UPDATE withdrawals SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('approved', req.params.id);
  res.json({ success: true, message: 'Withdrawal approved' });
});

app.post('/api/admin/withdrawals/:id/reject', adminAuth, (req, res) => {
  const withdrawal = db.prepare('SELECT * FROM withdrawals WHERE id = ? AND status = ?').get(req.params.id, 'pending');
  if (!withdrawal) return res.status(404).json({ error: 'Withdrawal not found' });
  db.prepare('UPDATE users SET balance = balance + ?, total_withdrawn = total_withdrawn - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(withdrawal.amount, withdrawal.amount, withdrawal.user_id);
  db.prepare('UPDATE withdrawals SET status = ?, admin_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('rejected', req.body.note || '', withdrawal.id);
  const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(withdrawal.user_id);
  db.prepare('INSERT INTO transactions (user_id, type, amount, balance_after, description) VALUES (?, ?, ?, ?, ?)').run(withdrawal.user_id, 'withdrawal_refund', withdrawal.amount, user.balance, 'Withdrawal rejected - refunded');
  res.json({ success: true, message: 'Withdrawal rejected, balance refunded' });
});

app.get('/api/admin/stats', adminAuth, (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const totalDeposits = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM deposits WHERE status = 'approved'").get().total;
  const totalWithdrawals = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM withdrawals WHERE status = 'approved'").get().total;
  const totalGames = db.prepare('SELECT COUNT(*) as count FROM games').get().count;
  const totalWagered = db.prepare('SELECT COALESCE(SUM(bet_amount), 0) as total FROM games').get().total;
  const totalPayout = db.prepare('SELECT COALESCE(SUM(payout), 0) as total FROM games').get().total;
  const pendingDeposits = db.prepare("SELECT COUNT(*) as count FROM deposits WHERE status = 'pending'").get().count;
  const pendingWithdrawals = db.prepare("SELECT COUNT(*) as count FROM withdrawals WHERE status = 'pending'").get().count;
  res.json({ totalUsers, totalDeposits, totalWithdrawals, totalGames, totalWagered, totalPayout, houseProfit: totalWagered - totalPayout, pendingDeposits, pendingWithdrawals });
});

app.get('*', (req, res) => { res.sendFile(path.join(__dirname, '..', 'public', 'index.html')); });

app.listen(PORT, () => {
  console.log(`🎮 Dashbet server running on port ${PORT}`);
  console.log(`🌐 Mini App URL: ${MINI_APP_URL}`);
  if (BOT_TOKEN) {
    try { initBot(BOT_TOKEN, MINI_APP_URL); } catch (err) { console.error('Bot init error:', err.message); }
  }
});
