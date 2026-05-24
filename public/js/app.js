// ============ DASHBET MINI APP ============
const API_BASE = '';
let currentUser = null;
let crSessionId = null;
let crGameActive = false;
let crDifficulty = 'easy';
let crColumns = 10;
let crCurrentColumn = -1;
let crMultipliers = [];
let crBetAmount = 10;
let kenoPicks = [];
let kenoTimerInterval = null;
let kenoPollingInterval = null;
let kenoBetPlaced = false;
let selectedPayMethod = 'telbirr';

const DIFF_LABELS = {
  easy: 'Chance of collision: Low',
  medium: 'Chance of collision: Medium',
  hard: 'Chance of collision: High',
  hardcore: 'Chance of collision: Very High'
};

// ============ INIT ============
document.addEventListener('DOMContentLoaded', () => { initApp(); initKenoBoard(); });

async function initApp() {
  try {
    const tg = window.Telegram?.WebApp;
    let initData = '', telegramId = '', firstName = 'User', lastName = '', username = '';
    if (tg) {
      tg.ready(); tg.expand();
      initData = tg.initData;
      if (tg.initDataUnsafe?.user) {
        telegramId = String(tg.initDataUnsafe.user.id);
        firstName = tg.initDataUnsafe.user.first_name || 'User';
        lastName = tg.initDataUnsafe.user.last_name || '';
        username = tg.initDataUnsafe.user.username || '';
      }
    }
    const urlParams = new URLSearchParams(window.location.search);
    const referralCode = urlParams.get('ref') || '';
    if (!telegramId) { telegramId = 'demo_' + Math.random().toString(36).substring(2, 8); firstName = 'Demo'; }

    const res = await fetch(`${API_BASE}/api/auth`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, telegramId, firstName, lastName, username, referralCode })
    });
    const data = await res.json();
    if (data.success) { currentUser = data.user; updateUI(); }
    hideLoading();
  } catch (err) {
    console.error('Init error:', err);
    try {
      const res = await fetch(`${API_BASE}/api/auth`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramId: 'demo_user', firstName: 'Demo', lastName: '', username: 'demo' })
      });
      const data = await res.json();
      if (data.success) { currentUser = data.user; updateUI(); }
    } catch (e) {}
    hideLoading();
  }
}

function hideLoading() {
  document.getElementById('loading-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
}

function updateUI() {
  if (!currentUser) return;
  updateBalance(currentUser.balance);
  document.getElementById('home-total-wagered').textContent = formatETB(currentUser.totalWagered);
  document.getElementById('home-total-won').textContent = formatETB(currentUser.totalWon);
  document.getElementById('profile-name').textContent = currentUser.firstName || 'User';
  document.getElementById('profile-username').textContent = currentUser.username ? `@${currentUser.username}` : '';
  document.getElementById('profile-deposited').textContent = formatETB(currentUser.totalDeposited);
  document.getElementById('profile-withdrawn').textContent = formatETB(currentUser.totalWithdrawn);
  document.getElementById('profile-wagered').textContent = formatETB(currentUser.totalWagered);
  document.getElementById('profile-won').textContent = formatETB(currentUser.totalWon);
  document.getElementById('referral-link').value = `https://t.me/DashbetBot?start=${currentUser.telegramId}`;
  document.getElementById('keno-user-id').textContent = `ID: ${currentUser.telegramId}`;
  if (currentUser.createdAt) document.getElementById('profile-joined').textContent = new Date(currentUser.createdAt).toLocaleDateString();
  loadProfile();
  loadTransactions();
}

function updateBalance(balance) {
  const formatted = parseFloat(balance || 0).toFixed(2) + ' ETB';
  document.getElementById('header-balance').textContent = formatted;
  document.getElementById('wallet-balance').textContent = formatted;
}

function formatETB(amount) { return parseFloat(amount || 0).toFixed(0); }

// ============ NAVIGATION ============
function switchTab(tab) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  event.currentTarget.classList.add('active');
  if (tab === 'wallet') loadTransactions();
  if (tab === 'profile') loadProfile();
  if (tab === 'games') startKenoPolling();
}

function switchToGame(game) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-games').classList.add('active');
  document.querySelectorAll('.nav-btn')[1].classList.add('active');
  showGame(game);
}

function showGame(game) {
  document.querySelectorAll('.game-container').forEach(g => g.classList.add('hidden'));
  document.querySelectorAll('.game-tab-btn').forEach(b => b.classList.remove('active'));
  if (game === 'chicken-road') {
    document.getElementById('game-chicken-road').classList.remove('hidden');
    document.querySelectorAll('.game-tab-btn')[0].classList.add('active');
    stopKenoPolling();
  } else {
    document.getElementById('game-keno').classList.remove('hidden');
    document.querySelectorAll('.game-tab-btn')[1].classList.add('active');
    startKenoPolling();
  }
}

function setBet(game, amount) { document.getElementById(`${game}-bet`).value = amount; }

// ============ DIFFICULTY ============
function selectDifficulty(diff) {
  crDifficulty = diff;
  document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`diff-${diff}`).classList.add('active');
  document.getElementById('diff-info').textContent = DIFF_LABELS[diff];
}

// ============ CHICKEN ROAD (HORIZONTAL) ============
function buildRoad(columns, multipliers, currentColumn, crashed) {
  const road = document.getElementById('cr-road');
  road.innerHTML = '';
  for (let i = 0; i < columns; i++) {
    const col = document.createElement('div');
    col.className = 'cr-column';
    const circle = document.createElement('div');
    circle.className = 'cr-mult-circle';
    if (i <= currentColumn && !crashed) {
      circle.classList.add('passed');
    } else if (i === currentColumn && crashed) {
      circle.classList.add('crashed');
    } else if (i === currentColumn + 1 && !crashed && currentColumn >= 0) {
      circle.classList.add('current');
    } else if (currentColumn < 0 && i === 0) {
      circle.classList.add('current');
    }
    circle.textContent = multipliers[i] ? multipliers[i].toFixed(2) + 'x' : '';
    col.appendChild(circle);
    if (i === currentColumn && !crashed && currentColumn >= 0) {
      const chicken = document.createElement('div');
      chicken.style.cssText = 'font-size:28px;text-align:center;margin:6px 0;';
      chicken.textContent = '🐔';
      col.appendChild(chicken);
    } else if (i === currentColumn && crashed) {
      const boom = document.createElement('div');
      boom.style.cssText = 'font-size:28px;text-align:center;margin:6px 0;';
      boom.textContent = '💥';
      col.appendChild(boom);
    } else {
      const spacer = document.createElement('div');
      spacer.style.cssText = 'height:40px;';
      col.appendChild(spacer);
    }
    const gate = document.createElement('div');
    gate.className = 'cr-gate';
    col.appendChild(gate);
    road.appendChild(col);
  }
}

async function startChickenRoad() {
  crBetAmount = parseInt(document.getElementById('cr-bet').value);
  if (!crBetAmount || crBetAmount < 5) return showToast('Minimum bet is 5 ETB', 'error');
  if (currentUser.balance < crBetAmount) return showToast('Insufficient balance', 'error');
  try {
    const res = await fetch(`${API_BASE}/api/games/chicken-road/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-ID': currentUser.telegramId },
      body: JSON.stringify({ betAmount: crBetAmount, difficulty: crDifficulty })
    });
    const data = await res.json();
    if (data.error) return showToast(data.error, 'error');
    crSessionId = data.sessionId;
    crGameActive = true;
    crColumns = data.columns;
    crMultipliers = data.multipliers;
    crCurrentColumn = -1;
    updateBalance(data.balance);
    currentUser.balance = data.balance;
    document.getElementById('cr-controls').classList.add('hidden');
    document.getElementById('cr-game-area').classList.remove('hidden');
    document.getElementById('cr-result').classList.add('hidden');
    document.getElementById('cr-cashout-btn').disabled = true;
    document.getElementById('cr-go-btn').disabled = false;
    document.getElementById('cr-multiplier').textContent = '0.00x';
    document.getElementById('cr-potential').textContent = '0.00 ETB';
    document.getElementById('cr-cashout-amount').textContent = '0.00 ETB';
    buildRoad(crColumns, crMultipliers, -1, false);
  } catch (err) { showToast('Error starting game', 'error'); }
}

async function chickenGoStep() {
  if (!crGameActive || !crSessionId) return;
  document.getElementById('cr-go-btn').disabled = true;
  try {
    const res = await fetch(`${API_BASE}/api/games/chicken-road/go`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-ID': currentUser.telegramId },
      body: JSON.stringify({ sessionId: crSessionId })
    });
    const data = await res.json();
    if (data.error) { document.getElementById('cr-go-btn').disabled = false; return showToast(data.error, 'error'); }
    crCurrentColumn = data.currentColumn;
    if (data.crashed) {
      crGameActive = false;
      buildRoad(crColumns, crMultipliers, data.currentColumn, true);
      document.getElementById('cr-multiplier').textContent = '0.00x';
      document.getElementById('cr-potential').textContent = '0.00 ETB';
      document.getElementById('cr-cashout-btn').disabled = true;
      document.getElementById('cr-go-btn').disabled = true;
      showGameResult('cr', false, 0);
      if (data.balance !== undefined) { updateBalance(data.balance); currentUser.balance = data.balance; }
    } else {
      buildRoad(crColumns, crMultipliers, data.currentColumn, false);
      document.getElementById('cr-multiplier').textContent = data.multiplier.toFixed(2) + 'x';
      const cashoutAmount = (crBetAmount * data.multiplier).toFixed(2);
      document.getElementById('cr-potential').textContent = cashoutAmount + ' ETB';
      document.getElementById('cr-cashout-amount').textContent = cashoutAmount + ' ETB';
      document.getElementById('cr-cashout-btn').disabled = false;
      document.getElementById('cr-go-btn').disabled = false;
      if (data.gameOver) {
        crGameActive = false;
        document.getElementById('cr-go-btn').disabled = true;
        document.getElementById('cr-cashout-btn').disabled = true;
        showGameResult('cr', true, data.payout);
        if (data.balance !== undefined) { updateBalance(data.balance); currentUser.balance = data.balance; }
      }
    }
  } catch (err) { document.getElementById('cr-go-btn').disabled = false; showToast('Error', 'error'); }
}

async function cashOutChickenRoad() {
  if (!crGameActive || !crSessionId) return;
  document.getElementById('cr-cashout-btn').disabled = true;
  document.getElementById('cr-go-btn').disabled = true;
  try {
    const res = await fetch(`${API_BASE}/api/games/chicken-road/cashout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-ID': currentUser.telegramId },
      body: JSON.stringify({ sessionId: crSessionId })
    });
    const data = await res.json();
    if (data.error) return showToast(data.error, 'error');
    crGameActive = false;
    showGameResult('cr', true, data.payout);
    updateBalance(data.balance);
    currentUser.balance = data.balance;
  } catch (err) { showToast('Error cashing out', 'error'); }
}

function showGameResult(game, won, payout) {
  const resultEl = document.getElementById(`${game}-result`);
  resultEl.classList.remove('hidden', 'win', 'loss');
  resultEl.classList.add(won ? 'win' : 'loss');
  if (won) { resultEl.innerHTML = `🎉 You Won! Payout: ${parseFloat(payout).toFixed(2)} ETB`; }
  else { resultEl.innerHTML = `💥 Crashed! Better luck next time!`; }
  setTimeout(() => {
    if (game === 'cr') {
      document.getElementById('cr-controls').classList.remove('hidden');
      document.getElementById('cr-game-area').classList.add('hidden');
    }
  }, 3000);
}

// ============ KENO (ROUND-BASED) ============
function initKenoBoard() {
  const board = document.getElementById('keno-board');
  if (!board) return;
  board.innerHTML = '';
  for (let i = 1; i <= 80; i++) {
    const cell = document.createElement('div');
    cell.className = 'keno-cell';
    cell.textContent = i;
    cell.id = `keno-cell-${i}`;
    cell.onclick = () => toggleKenoPick(i, cell);
    board.appendChild(cell);
  }
}

function toggleKenoPick(num, cell) {
  if (kenoBetPlaced) return;
  const idx = kenoPicks.indexOf(num);
  if (idx > -1) { kenoPicks.splice(idx, 1); cell.classList.remove('selected'); }
  else {
    if (kenoPicks.length >= 10) return showToast('Maximum 10 numbers', 'error');
    kenoPicks.push(num); cell.classList.add('selected');
  }
}

function showKenoTab(tab) {
  document.querySelectorAll('.keno-tab-content').forEach(t => t.classList.add('hidden'));
  document.querySelectorAll('.keno-tab').forEach(b => b.classList.remove('active'));
  document.getElementById(`keno-tab-${tab}`).classList.remove('hidden');
  event.currentTarget.classList.add('active');
  if (tab === 'history') fetchKenoRound();
  if (tab === 'results') fetchKenoResults();
}

function startKenoPolling() {
  if (kenoPollingInterval) return;
  fetchKenoRound();
  kenoPollingInterval = setInterval(fetchKenoRound, 3000);
}

function stopKenoPolling() {
  if (kenoPollingInterval) { clearInterval(kenoPollingInterval); kenoPollingInterval = null; }
}

async function fetchKenoRound() {
  if (!currentUser) return;
  try {
    const res = await fetch(`${API_BASE}/api/games/keno/round`, { headers: { 'X-Telegram-ID': currentUser.telegramId } });
    const data = await res.json();
    updateKenoTimer(data.timeLeft);
    document.getElementById('keno-total-bets').textContent = data.totalBets;
    
    // Update bets list
    const betsList = document.getElementById('keno-bets-list');
    if (data.bets && data.bets.length > 0) {
      betsList.innerHTML = data.bets.map(b => `
        <div class="keno-bet-item">
          <div class="keno-bet-user">${b.username}</div>
          <div class="keno-bet-picks">${b.picks.join(' ')}</div>
          <div class="keno-bet-info">
            <span>Bet ${b.betAmount}</span>
            <span class="keno-bet-status">${b.status}</span>
          </div>
        </div>
      `).join('');
    } else {
      betsList.innerHTML = '<p class="empty-state">No bets this round</p>';
    }

    // If round was drawn, show results
    if (data.status === 'drawn' && data.drawnNumbers) {
      showKenoDrawnNumbers(data.drawnNumbers);
      kenoBetPlaced = false;
      document.getElementById('keno-bet-submit').disabled = false;
      document.getElementById('keno-bet-submit').textContent = 'BET';
    }
  } catch (err) { console.error('Keno round fetch error:', err); }
}

function updateKenoTimer(timeLeft) {
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  document.getElementById('keno-timer').textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function showKenoDrawnNumbers(drawnNumbers) {
  // Mark drawn numbers on the board
  for (let i = 1; i <= 80; i++) {
    const cell = document.getElementById(`keno-cell-${i}`);
    if (!cell) continue;
    cell.classList.remove('drawn', 'matched', 'missed');
    if (drawnNumbers.includes(i)) {
      if (kenoPicks.includes(i)) {
        cell.classList.add('matched');
      } else {
        cell.classList.add('drawn');
      }
    } else if (kenoPicks.includes(i)) {
      cell.classList.add('missed');
    }
  }
}

async function placeKenoBet() {
  if (kenoBetPlaced) return showToast('Already bet this round', 'error');
  if (kenoPicks.length < 1) return showToast('Pick at least 1 number', 'error');
  const betAmount = parseInt(document.getElementById('keno-bet').value);
  if (!betAmount || betAmount < 5) return showToast('Minimum bet is 5 ETB', 'error');
  if (currentUser.balance < betAmount) return showToast('Insufficient balance', 'error');

  try {
    const res = await fetch(`${API_BASE}/api/games/keno/bet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-ID': currentUser.telegramId },
      body: JSON.stringify({ betAmount, picks: kenoPicks })
    });
    const data = await res.json();
    if (data.error) return showToast(data.error, 'error');
    kenoBetPlaced = true;
    updateBalance(data.balance);
    currentUser.balance = data.balance;
    document.getElementById('keno-bet-submit').disabled = true;
    document.getElementById('keno-bet-submit').textContent = 'Waiting...';
    document.getElementById('keno-bet-display-amount').textContent = betAmount + ' ETB';
    showToast('Bet placed! Waiting for draw...', 'success');
  } catch (err) { showToast('Error placing bet', 'error'); }
}

async function fetchKenoResults() {
  if (!currentUser) return;
  try {
    const res = await fetch(`${API_BASE}/api/games/keno/results`, { headers: { 'X-Telegram-ID': currentUser.telegramId } });
    const data = await res.json();
    const list = document.getElementById('keno-results-list');
    if (data.results && data.results.length > 0) {
      list.innerHTML = data.results.map(r => {
        const gd = JSON.parse(r.game_data || '{}');
        return `<div class="keno-result-item ${r.result}">
          <div>Round #${gd.roundId || '-'} | Bet: ${r.bet_amount} ETB</div>
          <div>Matches: ${gd.matches ? gd.matches.length : 0} | ${r.result === 'win' ? 'Won: ' + r.payout + ' ETB' : 'Lost'}</div>
        </div>`;
      }).join('');
    } else {
      list.innerHTML = '<p class="empty-state">No results yet</p>';
    }
  } catch (err) { console.error('Keno results error:', err); }
}

// Reset keno picks for new round
function resetKenoPicks() {
  kenoPicks = [];
  kenoBetPlaced = false;
  document.querySelectorAll('.keno-cell').forEach(c => c.classList.remove('selected', 'drawn', 'matched', 'missed'));
  document.getElementById('keno-bet-submit').disabled = false;
  document.getElementById('keno-bet-submit').textContent = 'BET';
}

// ============ WALLET ============
function showWalletSection(section) {
  document.querySelectorAll('.wallet-section').forEach(s => s.classList.add('hidden'));
  const el = document.getElementById(`wallet-${section}`);
  if (el) el.classList.toggle('hidden');
}

function selectPayMethod(method) {
  selectedPayMethod = method;
  document.querySelectorAll('.method-btn').forEach(b => b.classList.remove('active'));
  event.currentTarget.classList.add('active');
  document.querySelectorAll('.pay-details').forEach(d => d.classList.add('hidden'));
  document.getElementById(`pay-${method}`).classList.remove('hidden');
}

async function submitDeposit() {
  const amount = parseFloat(document.getElementById('deposit-amount').value);
  const ref = document.getElementById('deposit-ref').value.trim();
  if (!amount || amount < 10) return showToast('Minimum deposit is 10 ETB', 'error');
  if (!ref) return showToast('Enter transaction reference', 'error');
  try {
    const res = await fetch(`${API_BASE}/api/wallet/deposit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-ID': currentUser.telegramId },
      body: JSON.stringify({ amount, method: selectedPayMethod, transactionRef: ref })
    });
    const data = await res.json();
    if (data.error) return showToast(data.error, 'error');
    showToast('Deposit submitted! Awaiting approval.', 'success');
    document.getElementById('deposit-amount').value = '';
    document.getElementById('deposit-ref').value = '';
    loadTransactions();
  } catch (err) { showToast('Error submitting deposit', 'error'); }
}

async function submitWithdraw() {
  const method = document.getElementById('withdraw-method').value;
  const account = document.getElementById('withdraw-account').value.trim();
  const amount = parseFloat(document.getElementById('withdraw-amount').value);
  if (!account) return showToast('Enter your account number', 'error');
  if (!amount || amount < 50) return showToast('Minimum withdrawal is 50 ETB', 'error');
  try {
    const res = await fetch(`${API_BASE}/api/wallet/withdraw`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-ID': currentUser.telegramId },
      body: JSON.stringify({ amount, method, accountNumber: account })
    });
    const data = await res.json();
    if (data.error) return showToast(data.error, 'error');
    showToast('Withdrawal submitted!', 'success');
    updateBalance(data.balance); currentUser.balance = data.balance;
    document.getElementById('withdraw-account').value = '';
    document.getElementById('withdraw-amount').value = '';
    loadTransactions();
  } catch (err) { showToast('Error submitting withdrawal', 'error'); }
}

async function redeemPromo() {
  const code = document.getElementById('promo-code').value.trim();
  if (!code) return showToast('Enter a promo code', 'error');
  try {
    const res = await fetch(`${API_BASE}/api/promo/redeem`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-ID': currentUser.telegramId },
      body: JSON.stringify({ code })
    });
    const data = await res.json();
    if (data.error) return showToast(data.error, 'error');
    showToast(`Promo redeemed! +${data.bonus} ETB`, 'success');
    updateBalance(data.balance); currentUser.balance = data.balance;
    document.getElementById('promo-code').value = '';
  } catch (err) { showToast('Error redeeming promo', 'error'); }
}

async function claimCashback() {
  try {
    const res = await fetch(`${API_BASE}/api/cashback/claim`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-ID': currentUser.telegramId }
    });
    const data = await res.json();
    if (data.error) return showToast(data.error, 'error');
    showToast(`Cashback claimed! +${data.cashback} ETB`, 'success');
    updateBalance(data.balance); currentUser.balance = data.balance;
  } catch (err) { showToast('Error claiming cashback', 'error'); }
}

async function loadTransactions() {
  try {
    const res = await fetch(`${API_BASE}/api/wallet/transactions`, { headers: { 'X-Telegram-ID': currentUser.telegramId } });
    const data = await res.json();
    const list = document.getElementById('transaction-list');
    if (!data.transactions || data.transactions.length === 0) { list.innerHTML = '<p class="empty-state">No transactions yet</p>'; return; }
    list.innerHTML = data.transactions.slice(0, 20).map(tx => `
      <div class="tx-item">
        <div class="tx-info"><div class="tx-desc">${tx.description || tx.type}</div><div class="tx-date">${new Date(tx.created_at).toLocaleString()}</div></div>
        <div class="tx-amount ${tx.amount >= 0 ? 'positive' : 'negative'}">${tx.amount >= 0 ? '+' : ''}${parseFloat(tx.amount).toFixed(2)} ETB</div>
      </div>`).join('');
  } catch (err) { console.error('Load transactions error:', err); }
}

async function loadProfile() {
  try {
    const res = await fetch(`${API_BASE}/api/user/profile`, { headers: { 'X-Telegram-ID': currentUser.telegramId } });
    const data = await res.json();
    if (data.user) {
      document.getElementById('profile-referral-count').textContent = data.user.referralCount || 0;
      document.getElementById('profile-referral-earnings').textContent = (data.user.referralEarnings || 0) + ' ETB';
      document.getElementById('home-referrals').textContent = data.user.referralCount || 0;
    }
  } catch (err) { console.error('Load profile error:', err); }
}

function copyReferralLink() {
  const input = document.getElementById('referral-link');
  input.select(); document.execCommand('copy');
  showToast('Referral link copied!', 'success');
}

// ============ TOAST ============
function showToast(message, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}
