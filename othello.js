const OthelloGame = (function() {
  // Private state
  let container = null;
  let board, turn, history, gameOver;
  let cpuThinking = false;
  let gameMode = 'cpu-medium';
  let timeMode = 'none';
  let blackTime = 0, whiteTime = 0;
  let blackByoyomi = false, whiteByoyomi = false;
  let timerInterval = null;
  let timerStarted = false;
  let gameStarted = true;
  let passMessage = '';
  let passMessageTimeout = null;

  const BLACK = 'B';
  const WHITE = 'W';
  const EMPTY = '';

  const DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

  // Positional weights for AI evaluation
  const POSITION_WEIGHTS = [
    [120, -20,  20,   5,   5,  20, -20, 120],
    [-20, -40,  -5,  -5,  -5,  -5, -40, -20],
    [ 20,  -5,  15,   3,   3,  15,  -5,  20],
    [  5,  -5,   3,   3,   3,   3,  -5,   5],
    [  5,  -5,   3,   3,   3,   3,  -5,   5],
    [ 20,  -5,  15,   3,   3,  15,  -5,  20],
    [-20, -40,  -5,  -5,  -5,  -5, -40, -20],
    [120, -20,  20,   5,   5,  20, -20, 120],
  ];

  function el(id) {
    return container.querySelector('#' + id);
  }

  function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
  function cloneBoard(b) { return b.map(r => [...r]); }
  function opponent(color) { return color === BLACK ? WHITE : BLACK; }

  function initBoard() {
    const b = Array.from({length: 8}, () => Array(8).fill(EMPTY));
    b[3][3] = WHITE; b[3][4] = BLACK;
    b[4][3] = BLACK; b[4][4] = WHITE;
    return b;
  }

  // Returns array of positions that would be flipped if color plays at (r,c)
  function getFlips(b, r, c, color) {
    if (b[r][c] !== EMPTY) return [];
    const opp = opponent(color);
    const allFlips = [];
    for (const [dr, dc] of DIRS) {
      const flips = [];
      let nr = r + dr, nc = c + dc;
      while (inBounds(nr, nc) && b[nr][nc] === opp) {
        flips.push([nr, nc]);
        nr += dr;
        nc += dc;
      }
      if (flips.length > 0 && inBounds(nr, nc) && b[nr][nc] === color) {
        allFlips.push(...flips);
      }
    }
    return allFlips;
  }

  function getLegalMoves(b, color) {
    const moves = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (getFlips(b, r, c, color).length > 0) {
          moves.push([r, c]);
        }
      }
    }
    return moves;
  }

  function applyMove(b, r, c, color) {
    const nb = cloneBoard(b);
    const flips = getFlips(nb, r, c, color);
    nb[r][c] = color;
    for (const [fr, fc] of flips) {
      nb[fr][fc] = color;
    }
    return { board: nb, flips };
  }

  function countStones(b) {
    let black = 0, white = 0;
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        if (b[r][c] === BLACK) black++;
        else if (b[r][c] === WHITE) white++;
      }
    return { black, white };
  }

  // --- Mode & Timer ---
  function setMode(mode) {
    gameMode = mode;
    container.querySelectorAll('#othello-mode-selector button').forEach(b => b.classList.remove('active'));
    el('othello-btn-' + mode).classList.add('active');
    const timeSel = el('othello-time-selector');
    if (mode === 'pvp') {
      timeSel.style.display = 'grid';
    } else {
      timeSel.style.display = 'none';
      timeMode = 'none';
    }
    resetGame();
  }

  function setTimeMode(mode) {
    timeMode = mode;
    container.querySelectorAll('#othello-time-selector button').forEach(b => b.classList.remove('active'));
    el('othello-btn-time-' + mode).classList.add('active');
    resetGame();
  }

  function startGame() {
    gameStarted = true;
    el('othello-start-btn').style.display = 'none';
    startTimer();
    updateTimerDisplay();
  }

  function resetGame() {
    board = initBoard();
    turn = BLACK;
    history = [];
    gameOver = false;
    cpuThinking = false;
    passMessage = '';
    removeGameResultOverlay();
    if (passMessageTimeout) { clearTimeout(passMessageTimeout); passMessageTimeout = null; }
    stopTimer();
    timerStarted = false;
    blackByoyomi = false;
    whiteByoyomi = false;
    initTimers();
    const startBtn = el('othello-start-btn');
    if (timeMode !== 'none' && gameMode === 'pvp') {
      gameStarted = false;
      startBtn.style.display = 'block';
    } else {
      gameStarted = true;
      startBtn.style.display = 'none';
    }
    render();
    updateStatus();
    updateTimerDisplay();
  }

  function initTimers() {
    const timersEl = el('othello-timers');
    if (timeMode === 'none' || gameMode !== 'pvp') {
      timersEl.style.display = 'none';
      return;
    }
    timersEl.style.display = 'flex';
    if (timeMode === '30s') {
      blackTime = 30; whiteTime = 30;
    } else if (timeMode === '60s') {
      blackTime = 60; whiteTime = 60;
    } else if (timeMode === '5m15s') {
      blackTime = 300; whiteTime = 300;
    }
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m.toString().padStart(2, '0') + ':' + s.toString().padStart(2, '0');
  }

  function updateTimerDisplay() {
    const timersEl = el('othello-timers');
    if (timeMode === 'none' || gameMode !== 'pvp') {
      timersEl.style.display = 'none';
      return;
    }
    el('othello-timer-black-value').textContent = formatTime(blackTime);
    el('othello-timer-white-value').textContent = formatTime(whiteTime);

    const bBox = el('othello-timer-black');
    const wBox = el('othello-timer-white');
    bBox.classList.toggle('active-timer', turn === BLACK && !gameOver);
    wBox.classList.toggle('active-timer', turn === WHITE && !gameOver);
    bBox.classList.toggle('low-time', blackTime <= 10 && blackTime > 0 && !gameOver);
    wBox.classList.toggle('low-time', whiteTime <= 10 && whiteTime > 0 && !gameOver);

    const bByoEl = el('othello-timer-black-byoyomi');
    const wByoEl = el('othello-timer-white-byoyomi');
    bByoEl.textContent = blackByoyomi ? '\u79D2\u8AAD\u307F' : '';
    wByoEl.textContent = whiteByoyomi ? '\u79D2\u8AAD\u307F' : '';
  }

  function startTimer() {
    stopTimer();
    if (timeMode === 'none' || gameMode !== 'pvp' || gameOver) return;
    timerStarted = true;
    timerInterval = setInterval(() => {
      if (gameOver) { stopTimer(); return; }
      if (turn === BLACK) {
        blackTime--;
        if (blackTime <= 0) {
          if (timeMode === '5m15s' && !blackByoyomi) {
            blackByoyomi = true;
            blackTime = 15;
          } else {
            blackTime = 0;
            stopTimer();
            gameOver = true;
            const statusEl = el('othello-status');
            statusEl.textContent = '\u6642\u9593\u5207\u308C\uFF01 \u767D\u306E\u52DD\u3061\uFF01';
            statusEl.style.background = '#8b0000';
            showGameResult('\u767D\u306E\u52DD\u3061\uFF01', true);
            playWinSound();
          }
        }
      } else {
        whiteTime--;
        if (whiteTime <= 0) {
          if (timeMode === '5m15s' && !whiteByoyomi) {
            whiteByoyomi = true;
            whiteTime = 15;
          } else {
            whiteTime = 0;
            stopTimer();
            gameOver = true;
            const statusEl = el('othello-status');
            statusEl.textContent = '\u6642\u9593\u5207\u308C\uFF01 \u9ED2\u306E\u52DD\u3061\uFF01';
            statusEl.style.background = '#8b0000';
            showGameResult('\u9ED2\u306E\u52DD\u3061\uFF01', true);
            playWinSound();
          }
        }
      }
      updateTimerDisplay();
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function onMoveMadeTimer() {
    if (timeMode === 'none' || gameMode !== 'pvp') return;
    if (timeMode === '30s') {
      if (turn === BLACK) blackTime = 30; else whiteTime = 30;
    } else if (timeMode === '60s') {
      if (turn === BLACK) blackTime = 60; else whiteTime = 60;
    } else if (timeMode === '5m15s') {
      const justMoved = turn === BLACK ? WHITE : BLACK;
      if (justMoved === BLACK && blackByoyomi) blackTime = 15;
      if (justMoved === WHITE && whiteByoyomi) whiteTime = 15;
    }
    startTimer();
    updateTimerDisplay();
  }

  // --- AI ---
  function evaluate(b, color) {
    const moves = getLegalMoves(b, color);
    const oppMoves = getLegalMoves(b, opponent(color));
    const count = countStones(b);
    const totalStones = count.black + count.white;

    let score = 0;

    // Positional score
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (b[r][c] === color) score += POSITION_WEIGHTS[r][c];
        else if (b[r][c] === opponent(color)) score -= POSITION_WEIGHTS[r][c];
      }
    }

    // Mobility
    score += (moves.length - oppMoves.length) * 10;

    // Corner occupancy
    const corners = [[0,0],[0,7],[7,0],[7,7]];
    for (const [cr, cc] of corners) {
      if (b[cr][cc] === color) score += 50;
      else if (b[cr][cc] === opponent(color)) score -= 50;
    }

    // Endgame: weight stone count more heavily
    if (totalStones > 52) {
      const myCount = color === BLACK ? count.black : count.white;
      const oppCount = color === BLACK ? count.white : count.black;
      score += (myCount - oppCount) * 10;
    }

    return score;
  }

  function minimax(b, depth, alpha, beta, maximizingColor, aiColor) {
    const moves = getLegalMoves(b, maximizingColor);
    const oppMoves = getLegalMoves(b, opponent(maximizingColor));

    if (depth === 0 || (moves.length === 0 && oppMoves.length === 0)) {
      return evaluate(b, aiColor);
    }

    if (moves.length === 0) {
      // pass
      return minimax(b, depth - 1, alpha, beta, opponent(maximizingColor), aiColor);
    }

    if (maximizingColor === aiColor) {
      let maxEval = -Infinity;
      for (const [r, c] of moves) {
        const result = applyMove(b, r, c, maximizingColor);
        const ev = minimax(result.board, depth - 1, alpha, beta, opponent(maximizingColor), aiColor);
        maxEval = Math.max(maxEval, ev);
        alpha = Math.max(alpha, ev);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const [r, c] of moves) {
        const result = applyMove(b, r, c, maximizingColor);
        const ev = minimax(result.board, depth - 1, alpha, beta, opponent(maximizingColor), aiColor);
        minEval = Math.min(minEval, ev);
        beta = Math.min(beta, ev);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }

  function getCpuMove() {
    const color = turn;
    const moves = getLegalMoves(board, color);
    if (moves.length === 0) return null;

    if (gameMode === 'cpu-beginner') {
      // Random
      return moves[Math.floor(Math.random() * moves.length)];
    }

    if (gameMode === 'cpu-easy') {
      // Greedy: pick move that flips the most
      let best = moves[0], bestFlips = 0;
      for (const [r, c] of moves) {
        const flips = getFlips(board, r, c, color).length;
        if (flips > bestFlips || (flips === bestFlips && Math.random() < 0.3)) {
          bestFlips = flips;
          best = [r, c];
        }
      }
      return best;
    }

    if (gameMode === 'cpu-medium') {
      // Simple positional evaluation (no lookahead)
      let best = moves[0], bestScore = -Infinity;
      for (const [r, c] of moves) {
        const result = applyMove(board, r, c, color);
        const score = evaluate(result.board, color) + (Math.random() - 0.5) * 20;
        if (score > bestScore) {
          bestScore = score;
          best = [r, c];
        }
      }
      return best;
    }

    // Minimax for hard and expert
    const depth = gameMode === 'cpu-hard' ? 4 : 6;
    let bestMove = moves[0];
    let bestEval = -Infinity;

    for (const [r, c] of moves) {
      const result = applyMove(board, r, c, color);
      const ev = minimax(result.board, depth - 1, -Infinity, Infinity, opponent(color), color);
      if (ev > bestEval) {
        bestEval = ev;
        bestMove = [r, c];
      }
    }
    return bestMove;
  }

  function isCpuTurn() {
    return gameMode !== 'pvp' && turn === WHITE;
  }

  // --- Game logic ---
  function makeMove(r, c) {
    if (gameOver || !gameStarted) return;
    if (cpuThinking) return;

    const flips = getFlips(board, r, c, turn);
    if (flips.length === 0) return;

    // Save history
    history.push({ board: cloneBoard(board), turn, passMessage });

    const result = applyMove(board, r, c, turn);
    board = result.board;

    // Play sounds
    playStoneSound();
    if (result.flips.length > 0) { playCaptureSound(); }

    // Animate flipped stones
    renderWithAnimation(r, c, result.flips);

    // Switch turn
    turn = opponent(turn);
    onMoveMadeTimer();

    // Check for pass / game end
    setTimeout(() => {
      checkPassAndEnd();
    }, 400);
  }

  function checkPassAndEnd() {
    const currentMoves = getLegalMoves(board, turn);
    const otherMoves = getLegalMoves(board, opponent(turn));

    if (currentMoves.length === 0 && otherMoves.length === 0) {
      // Game over
      gameOver = true;
      stopTimer();
      const count = countStones(board);
      const statusEl = el('othello-status');
      if (count.black > count.white) {
        statusEl.textContent = '\u9ED2\u306E\u52DD\u3061\uFF01 ' + count.black + ' - ' + count.white;
        statusEl.style.background = '#2e7d32';
        showGameResult('\u9ED2\u306E\u52DD\u3061\uFF01', true);
        playWinSound();
      } else if (count.white > count.black) {
        statusEl.textContent = '\u767D\u306E\u52DD\u3061\uFF01 ' + count.white + ' - ' + count.black;
        statusEl.style.background = '#2e7d32';
        showGameResult('\u767D\u306E\u52DD\u3061\uFF01', true);
        playWinSound();
      } else {
        statusEl.textContent = '\u5F15\u304D\u5206\u3051\uFF01 ' + count.black + ' - ' + count.white;
        statusEl.style.background = '#b8860b';
        showGameResult('\u5F15\u304D\u5206\u3051', false);
        playDrawSound();
      }
      render();
      updateScore();
      return;
    }

    if (currentMoves.length === 0) {
      // Current player must pass
      const name = turn === BLACK ? '\u9ED2' : '\u767D';
      passMessage = name + '\u306F\u30D1\u30B9\uFF01';
      turn = opponent(turn);
      onMoveMadeTimer();
      updateStatus();
      render();
      updateScore();

      // Clear pass message after a moment
      if (passMessageTimeout) clearTimeout(passMessageTimeout);
      passMessageTimeout = setTimeout(() => {
        passMessage = '';
        updateStatus();
        // If CPU turn after pass
        if (isCpuTurn() && !gameOver) {
          doCpuMove();
        }
      }, 1200);
      return;
    }

    updateStatus();
    render();
    updateScore();

    if (isCpuTurn() && !gameOver) {
      doCpuMove();
    }
  }

  function doCpuMove() {
    cpuThinking = true;
    const statusEl = el('othello-status');
    statusEl.innerHTML = '<span class="othello-thinking">CPU\u601D\u8003\u4E2D...</span>';

    setTimeout(() => {
      const move = getCpuMove();
      cpuThinking = false;
      if (move) {
        makeMove(move[0], move[1]);
      } else {
        // CPU has no move - pass handled in checkPassAndEnd
        checkPassAndEnd();
      }
    }, 300);
  }

  function undoMove() {
    if (history.length === 0 || gameOver) return;
    if (cpuThinking) return;

    // In CPU mode, undo twice (undo CPU + player)
    if (gameMode !== 'pvp' && history.length >= 2) {
      const prev = history[history.length - 2];
      history.splice(history.length - 2, 2);
      board = prev.board;
      turn = prev.turn;
      passMessage = prev.passMessage || '';
    } else {
      const prev = history.pop();
      board = prev.board;
      turn = prev.turn;
      passMessage = prev.passMessage || '';
    }
    render();
    updateStatus();
    updateScore();
  }

  // --- Rendering ---
  function updateStatus() {
    if (gameOver) return;
    const statusEl = el('othello-status');
    if (passMessage) {
      statusEl.textContent = passMessage;
      statusEl.style.background = '#b8860b';
    } else {
      const name = turn === BLACK ? '\u9ED2' : '\u767D';
      statusEl.textContent = name + '\u306E\u756A\u3067\u3059';
      statusEl.style.background = '#16213e';
    }
  }

  function updateScore() {
    const count = countStones(board);
    el('othello-score-black-count').textContent = count.black;
    el('othello-score-white-count').textContent = count.white;
  }

  function render() {
    const boardEl = el('othello-board');
    boardEl.innerHTML = '';
    const legalMoves = gameOver ? [] : getLegalMoves(board, turn);
    const legalSet = new Set(legalMoves.map(([r, c]) => r * 8 + c));

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = document.createElement('div');
        sq.className = 'othello-square ' + ((r + c) % 2 === 0 ? 'othello-dark' : 'othello-light');
        sq.dataset.r = r;
        sq.dataset.c = c;

        if (board[r][c] === BLACK) {
          const stone = document.createElement('div');
          stone.className = 'othello-stone othello-stone-black';
          sq.appendChild(stone);
        } else if (board[r][c] === WHITE) {
          const stone = document.createElement('div');
          stone.className = 'othello-stone othello-stone-white';
          sq.appendChild(stone);
        } else if (legalSet.has(r * 8 + c) && !isCpuTurn()) {
          sq.classList.add('othello-legal-move');
        }

        if (!gameOver && !cpuThinking && board[r][c] === EMPTY) {
          sq.onclick = () => {
            if (!gameStarted) return;
            makeMove(r, c);
          };
        }

        boardEl.appendChild(sq);
      }
    }
  }

  function renderWithAnimation(placedR, placedC, flips) {
    const boardEl = el('othello-board');
    boardEl.innerHTML = '';
    const legalMoves = gameOver ? [] : getLegalMoves(board, turn);
    const legalSet = new Set(legalMoves.map(([r, c]) => r * 8 + c));
    const flipSet = new Set(flips.map(([r, c]) => r * 8 + c));

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = document.createElement('div');
        sq.className = 'othello-square ' + ((r + c) % 2 === 0 ? 'othello-dark' : 'othello-light');
        sq.dataset.r = r;
        sq.dataset.c = c;

        if (board[r][c] === BLACK) {
          const stone = document.createElement('div');
          stone.className = 'othello-stone othello-stone-black';
          if (r === placedR && c === placedC) {
            stone.classList.add('othello-stone-placed');
          } else if (flipSet.has(r * 8 + c)) {
            stone.classList.add('othello-stone-flip');
          }
          sq.appendChild(stone);
        } else if (board[r][c] === WHITE) {
          const stone = document.createElement('div');
          stone.className = 'othello-stone othello-stone-white';
          if (r === placedR && c === placedC) {
            stone.classList.add('othello-stone-placed');
          } else if (flipSet.has(r * 8 + c)) {
            stone.classList.add('othello-stone-flip');
          }
          sq.appendChild(stone);
        } else if (legalSet.has(r * 8 + c) && !isCpuTurn()) {
          sq.classList.add('othello-legal-move');
        }

        if (!gameOver && !cpuThinking && board[r][c] === EMPTY) {
          sq.onclick = () => {
            if (!gameStarted) return;
            makeMove(r, c);
          };
        }

        boardEl.appendChild(sq);
      }
    }
    updateScore();
  }

  function removeGameResultOverlay() {
    const wrapper = el('othello-board-wrapper');
    if (wrapper) {
      const existing = wrapper.querySelector('.game-result-overlay');
      if (existing) existing.remove();
    }
  }

  function showGameResult(text, isWin) {
    const wrapper = el('othello-board-wrapper');
    if (!wrapper) return;
    removeGameResultOverlay();
    const overlay = document.createElement('div');
    overlay.className = 'game-result-overlay';
    const textEl = document.createElement('div');
    textEl.className = 'game-result-text ' + (isWin ? 'win' : 'draw');
    textEl.textContent = text;
    overlay.appendChild(textEl);
    wrapper.appendChild(overlay);
    if (isWin) {
      const colors = ['#f6e47a','#e74c3c','#3498db','#2ecc71','#e67e22','#9b59b6','#1abc9c','#f39c12'];
      for (let i = 0; i < 30; i++) {
        const p = document.createElement('div');
        p.className = 'confetti-particle';
        p.style.background = colors[Math.floor(Math.random() * colors.length)];
        p.style.left = Math.random() * 100 + '%';
        p.style.top = Math.random() * 100 + '%';
        p.style.setProperty('--tx', (Math.random() * 200 - 100) + 'px');
        p.style.setProperty('--ty', (Math.random() * 200 + 50) + 'px');
        p.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
        p.style.setProperty('--duration', (1 + Math.random() * 1.5) + 's');
        overlay.appendChild(p);
      }
    }
  }

  // --- HTML & CSS ---
  function buildHTML() {
    container.innerHTML = `
      <div id="othello-controls" style="margin-bottom:12px;width:100%;max-width:580px;">
        <div id="othello-mode-selector" style="margin-bottom:8px;display:grid;grid-template-columns:repeat(3,1fr);gap:5px;">
          <button id="othello-btn-pvp">\uD83D\uDC65 \u5BFE\u4EBA\u6226</button>
          <button id="othello-btn-cpu-beginner">\u5165\u9580</button>
          <button id="othello-btn-cpu-easy">\u521D\u7D1A</button>
          <button id="othello-btn-cpu-medium">\u4E2D\u7D1A</button>
          <button id="othello-btn-cpu-hard">\u4E0A\u7D1A</button>
          <button id="othello-btn-cpu-expert">\u6700\u5F37</button>
        </div>
        <div id="othello-time-selector" style="margin-bottom:8px;display:none;grid-template-columns:repeat(4,1fr);gap:5px;">
          <button id="othello-btn-time-none">\u5236\u9650\u306A\u3057</button>
          <button id="othello-btn-time-30s">30\u79D2</button>
          <button id="othello-btn-time-60s">60\u79D2</button>
          <button id="othello-btn-time-5m15s">5\u5206+15\u79D2</button>
        </div>
      </div>
      <div id="othello-timers" style="display:none;justify-content:center;gap:20px;margin-bottom:8px;font-size:1.1rem;font-family:'Consolas','Courier New',monospace;">
        <div class="othello-timer-box othello-black-timer" id="othello-timer-black">
          <div class="othello-timer-label">\u9ED2</div>
          <div class="othello-timer-value" id="othello-timer-black-value">--:--</div>
          <div class="othello-timer-byoyomi" id="othello-timer-black-byoyomi"></div>
        </div>
        <div class="othello-timer-box othello-white-timer" id="othello-timer-white">
          <div class="othello-timer-label">\u767D</div>
          <div class="othello-timer-value" id="othello-timer-white-value">--:--</div>
          <div class="othello-timer-byoyomi" id="othello-timer-white-byoyomi"></div>
        </div>
      </div>
      <button id="othello-start-btn" style="display:none;margin:0 auto 8px;padding:8px 36px;font-size:1rem;background:#2e7d32;color:#fff;border:none;border-radius:8px;cursor:pointer;letter-spacing:2px;transition:background 0.2s;">\u25B6 \u958B\u59CB</button>
      <div id="othello-status" style="font-size:1.05rem;margin-bottom:8px;padding:6px 16px;background:#16213e;border-radius:8px;display:inline-block;">\u9ED2\u306E\u756A\u3067\u3059</div>
      <div id="othello-board-wrapper" style="position:relative;display:inline-block;">
        <div id="othello-board" style="display:grid;grid-template-columns:repeat(8,72px);grid-template-rows:repeat(8,72px);border:3px solid #1a4a2e;border-radius:4px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.5);"></div>
      </div>
      <div id="othello-score" style="display:flex;justify-content:center;gap:30px;margin-top:10px;font-size:1.1rem;">
        <div class="othello-score-item">
          <span class="othello-score-stone othello-score-stone-black"></span>
          <span id="othello-score-black-count">2</span>
        </div>
        <div class="othello-score-item">
          <span class="othello-score-stone othello-score-stone-white"></span>
          <span id="othello-score-white-count">2</span>
        </div>
      </div>
      <div class="othello-buttons" style="margin-top:10px;">
        <button id="othello-undo-btn">\u21A9 \u623B\u3059</button>
        <button id="othello-reset-btn">\u267B \u65B0\u898F</button>
      </div>
    `;
  }

  function injectCSS() {
    if (document.getElementById('othello-game-styles')) return;
    const style = document.createElement('style');
    style.id = 'othello-game-styles';
    style.textContent = `
      #othello-board {
        display: grid;
        grid-template-columns: repeat(8, 72px);
        grid-template-rows: repeat(8, 72px);
      }
      .othello-square {
        width: 72px; height: 72px; display: flex; justify-content: center; align-items: center;
        cursor: pointer; user-select: none; position: relative;
        transition: background 0.15s;
      }
      .othello-dark { background: #2d6b3f; }
      .othello-light { background: #3a8a4f; }
      .othello-square:hover { filter: brightness(1.1); }
      .othello-square.othello-legal-move::after {
        content: ''; position: absolute; width: 20px; height: 20px;
        background: rgba(255,255,255,0.25); border-radius: 50%;
        pointer-events: none;
      }
      .othello-stone {
        width: 50px; height: 50px; border-radius: 50%;
        box-shadow: 2px 3px 8px rgba(0,0,0,0.5);
        z-index: 1; position: relative;
        transition: transform 0.3s;
      }
      .othello-stone-black {
        background: radial-gradient(circle at 35% 35%, #555, #111);
      }
      .othello-stone-white {
        background: radial-gradient(circle at 35% 35%, #fff, #ccc);
      }
      .othello-stone-placed {
        animation: othelloPlace 0.3s ease-out;
      }
      @keyframes othelloPlace {
        0% { transform: scale(0); opacity: 0; }
        60% { transform: scale(1.15); opacity: 1; }
        100% { transform: scale(1); }
      }
      .othello-stone-flip {
        animation: othelloFlip 0.5s ease-in-out;
      }
      @keyframes othelloFlip {
        0% { transform: scaleX(1) rotateY(0deg); }
        50% { transform: scaleX(0) rotateY(90deg); }
        100% { transform: scaleX(1) rotateY(0deg); }
      }
      .othello-score-item {
        display: flex; align-items: center; gap: 8px; font-weight: bold;
      }
      .othello-score-stone {
        display: inline-block; width: 24px; height: 24px; border-radius: 50%;
        box-shadow: 1px 2px 4px rgba(0,0,0,0.4);
      }
      .othello-score-stone-black {
        background: radial-gradient(circle at 35% 35%, #555, #111);
      }
      .othello-score-stone-white {
        background: radial-gradient(circle at 35% 35%, #fff, #ccc);
      }
      #othello-mode-selector button {
        padding: 5px 12px; font-size: 0.85rem;
        background: #0f3460; color: #e0e0e0; border: 2px solid transparent; border-radius: 6px;
        cursor: pointer; transition: all 0.2s;
      }
      #othello-mode-selector button:hover { background: #1a4a8a; }
      #othello-mode-selector button.active { border-color: #f6e47a; background: #1a4a8a; }
      #othello-time-selector button {
        padding: 4px 10px; font-size: 0.8rem;
        background: #1a3a5c; color: #e0e0e0; border: 2px solid transparent; border-radius: 6px;
        cursor: pointer; transition: all 0.2s;
      }
      #othello-time-selector button:hover { background: #1a4a8a; }
      #othello-time-selector button.active { border-color: #f6e47a; background: #1a4a8a; }
      .othello-timer-box {
        padding: 6px 16px; border-radius: 8px; min-width: 120px; text-align: center;
      }
      .othello-timer-box.othello-black-timer { background: #333; color: #eee; }
      .othello-timer-box.othello-white-timer { background: #ddd; color: #222; }
      .othello-timer-box.active-timer { box-shadow: 0 0 8px 2px rgba(246,228,122,0.6); }
      .othello-timer-box.low-time { animation: othelloTimerWarn 0.5s infinite; }
      @keyframes othelloTimerWarn {
        0%,100% { box-shadow: 0 0 8px 2px rgba(255,0,0,0.6); }
        50% { box-shadow: 0 0 16px 4px rgba(255,0,0,0.9); }
      }
      .othello-timer-label { font-size: 0.7rem; opacity: 0.7; }
      .othello-timer-value { font-size: 1.3rem; font-weight: bold; }
      .othello-timer-byoyomi { font-size: 0.65rem; color: #f6e47a; }
      .othello-buttons button {
        padding: 7px 18px; margin: 0 5px; font-size: 0.9rem;
        background: #0f3460; color: #e0e0e0; border: none; border-radius: 6px;
        cursor: pointer; transition: background 0.2s;
      }
      .othello-buttons button:hover { background: #1a4a8a; }
      #othello-start-btn:hover { background: #388e3c; }
      @keyframes othello-thinking-pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
      .othello-thinking { animation: othello-thinking-pulse 1s infinite; }
    `;
    document.head.appendChild(style);
  }

  function bindEvents() {
    el('othello-btn-pvp').onclick = () => setMode('pvp');
    el('othello-btn-cpu-beginner').onclick = () => setMode('cpu-beginner');
    el('othello-btn-cpu-easy').onclick = () => setMode('cpu-easy');
    el('othello-btn-cpu-medium').onclick = () => setMode('cpu-medium');
    el('othello-btn-cpu-hard').onclick = () => setMode('cpu-hard');
    el('othello-btn-cpu-expert').onclick = () => setMode('cpu-expert');
    el('othello-btn-time-none').onclick = () => setTimeMode('none');
    el('othello-btn-time-30s').onclick = () => setTimeMode('30s');
    el('othello-btn-time-60s').onclick = () => setTimeMode('60s');
    el('othello-btn-time-5m15s').onclick = () => setTimeMode('5m15s');
    el('othello-start-btn').onclick = () => startGame();
    el('othello-undo-btn').onclick = () => undoMove();
    el('othello-reset-btn').onclick = () => resetGame();
  }

  return {
    init(containerEl) {
      container = containerEl;
      injectCSS();
      buildHTML();
      bindEvents();
      el('othello-btn-time-none').classList.add('active');
      setMode('cpu-medium');
    },
    destroy() {
      stopTimer();
      if (passMessageTimeout) { clearTimeout(passMessageTimeout); passMessageTimeout = null; }
      if (container) {
        container.innerHTML = '';
      }
      const styleEl = document.getElementById('othello-game-styles');
      if (styleEl) {
        styleEl.remove();
      }
      container = null;
    }
  };
})();
