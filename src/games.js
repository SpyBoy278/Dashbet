/**
 * Dashbet Game Logic Engine
 * Win rate: 20% (house edge 80%)
 */

function shouldWin() {
  return Math.random() < 0.20;
}

/**
 * CHICKEN ROAD - Horizontal Column Game (matches original)
 * The chicken moves from left to right through columns.
 * Each column is either safe or dangerous (crash).
 * Player clicks GO to advance to the next column.
 * Can CASH OUT at any time after passing at least 1 column.
 * 
 * Difficulty affects number of columns and multiplier progression:
 * - Easy: 10 columns, lower multipliers, lower crash chance per step
 * - Medium: 10 columns, medium multipliers
 * - Hard: 10 columns, higher multipliers, higher crash chance per step
 * - Hardcore: 10 columns, highest multipliers, highest crash chance
 */

const DIFFICULTY_CONFIG = {
  easy: {
    columns: 10,
    multipliers: [1.03, 1.07, 1.12, 1.17, 1.23, 1.29, 1.36, 1.44, 1.52, 1.62],
    crashChanceLabel: 'Low'
  },
  medium: {
    columns: 10,
    multipliers: [1.09, 1.25, 1.46, 1.70, 2.00, 2.40, 2.88, 3.50, 4.30, 5.30],
    crashChanceLabel: 'Medium'
  },
  hard: {
    columns: 10,
    multipliers: [1.18, 1.55, 2.10, 2.90, 4.10, 5.90, 8.60, 12.80, 19.50, 30.00],
    crashChanceLabel: 'High'
  },
  hardcore: {
    columns: 10,
    multipliers: [1.35, 2.10, 3.50, 6.00, 10.50, 19.00, 35.00, 65.00, 125.00, 250.00],
    crashChanceLabel: 'Very High'
  }
};

function createChickenRoadGame(betAmount, difficulty = 'easy') {
  const config = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.easy;
  const willWin = shouldWin();

  // Pre-determine crash column (which column the chicken will crash on)
  let crashColumn;
  if (willWin) {
    // Player will win - crash column is beyond all columns (they can complete)
    crashColumn = config.columns + 1; // won't crash
  } else {
    // Player will lose - determine when they crash
    // Crash earlier for harder difficulties
    const maxSafe = difficulty === 'easy' ? 5 : difficulty === 'medium' ? 4 : difficulty === 'hard' ? 3 : 2;
    crashColumn = Math.floor(Math.random() * maxSafe); // crash on column 0 to maxSafe-1
  }

  return {
    betAmount,
    difficulty,
    config,
    columns: config.columns,
    multipliers: config.multipliers,
    crashColumn,
    currentColumn: -1, // -1 means at start, 0 means passed first column
    multiplier: 0,
    gameOver: false,
    cashedOut: false,
    crashed: false,
    predetermined: willWin,
    payout: 0,
    result: null,
    passedColumns: [] // which columns were safely passed
  };
}

function chickenGo(gameState) {
  if (gameState.gameOver || gameState.cashedOut) {
    return { ...gameState, error: 'Game is already over' };
  }

  const nextColumn = gameState.currentColumn + 1;
  
  if (nextColumn >= gameState.columns) {
    return { ...gameState, error: 'Already completed all columns' };
  }

  // Check if this column crashes
  if (nextColumn === gameState.crashColumn) {
    gameState.currentColumn = nextColumn;
    gameState.crashed = true;
    gameState.gameOver = true;
    gameState.multiplier = 0;
    gameState.payout = 0;
    gameState.result = 'loss';
    return gameState;
  }

  // Safe - advance
  gameState.currentColumn = nextColumn;
  gameState.multiplier = gameState.multipliers[nextColumn];
  gameState.passedColumns.push(nextColumn);

  // Check if completed all columns
  if (nextColumn >= gameState.columns - 1) {
    gameState.gameOver = true;
    gameState.cashedOut = true;
    gameState.payout = parseFloat((gameState.betAmount * gameState.multiplier).toFixed(2));
    gameState.result = 'win';
  }

  return gameState;
}

function chickenCashOut(gameState) {
  if (gameState.gameOver || gameState.cashedOut) {
    return { ...gameState, error: 'Game is already over' };
  }
  if (gameState.currentColumn < 0) {
    return { ...gameState, error: 'Must pass at least one column' };
  }

  gameState.cashedOut = true;
  gameState.gameOver = true;
  gameState.payout = parseFloat((gameState.betAmount * gameState.multiplier).toFixed(2));
  gameState.result = 'win';
  return gameState;
}

/**
 * FAST KENO
 * User picks 1-10 numbers from 1-80. System draws 20 numbers.
 */
function playKeno(betAmount, userPicks) {
  if (!userPicks || userPicks.length < 1 || userPicks.length > 10) {
    return { error: 'Pick between 1 and 10 numbers' };
  }

  for (const pick of userPicks) {
    if (pick < 1 || pick > 80) {
      return { error: 'Numbers must be between 1 and 80' };
    }
  }

  const willWin = shouldWin();
  let drawnNumbers;

  if (willWin) {
    const minMatches = Math.max(1, Math.floor(userPicks.length * 0.4));
    drawnNumbers = new Set();
    const shuffledPicks = [...userPicks].sort(() => Math.random() - 0.5);
    for (let i = 0; i < minMatches && i < shuffledPicks.length; i++) {
      drawnNumbers.add(shuffledPicks[i]);
    }
    while (drawnNumbers.size < 20) {
      const num = Math.floor(Math.random() * 80) + 1;
      drawnNumbers.add(num);
    }
  } else {
    drawnNumbers = new Set();
    const available = [];
    for (let i = 1; i <= 80; i++) {
      if (!userPicks.includes(i)) available.push(i);
    }
    const shuffled = available.sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(20, shuffled.length); i++) {
      drawnNumbers.add(shuffled[i]);
    }
    while (drawnNumbers.size < 20) {
      const num = Math.floor(Math.random() * 80) + 1;
      drawnNumbers.add(num);
    }
  }

  const drawn = Array.from(drawnNumbers).sort((a, b) => a - b);
  const matches = userPicks.filter(p => drawn.includes(p));
  const payoutTable = getKenoPayoutTable(userPicks.length);
  const matchCount = matches.length;
  const multiplier = payoutTable[matchCount] || 0;
  const payout = parseFloat((betAmount * multiplier).toFixed(2));

  return {
    betAmount,
    userPicks: userPicks.sort((a, b) => a - b),
    drawnNumbers: drawn,
    matches,
    matchCount,
    totalPicks: userPicks.length,
    multiplier,
    payout,
    result: payout > 0 ? 'win' : 'loss',
    gameOver: true
  };
}

function getKenoPayoutTable(numPicks) {
  const tables = {
    1: { 0: 0, 1: 3.5 },
    2: { 0: 0, 1: 1, 2: 8 },
    3: { 0: 0, 1: 0, 2: 2.5, 3: 25 },
    4: { 0: 0, 1: 0, 2: 1.5, 3: 5, 4: 50 },
    5: { 0: 0, 1: 0, 2: 1, 3: 3, 4: 15, 5: 100 },
    6: { 0: 0, 1: 0, 2: 0.5, 3: 2, 4: 8, 5: 50, 6: 200 },
    7: { 0: 0, 1: 0, 2: 0, 3: 1.5, 4: 5, 5: 20, 6: 100, 7: 500 },
    8: { 0: 0, 1: 0, 2: 0, 3: 1, 4: 3, 5: 10, 6: 50, 7: 250, 8: 1000 },
    9: { 0: 0, 1: 0, 2: 0, 3: 0.5, 4: 2, 5: 5, 6: 25, 7: 100, 8: 500, 9: 2000 },
    10: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 1.5, 5: 3, 6: 15, 7: 50, 8: 250, 9: 1000, 10: 5000 }
  };
  return tables[numPicks] || tables[1];
}

module.exports = {
  createChickenRoadGame,
  chickenGo,
  chickenCashOut,
  playKeno,
  shouldWin,
  DIFFICULTY_CONFIG
};
