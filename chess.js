const ChessGame = (function() {
  // Private state
  let container = null;
  let board, turn, selected, history, capturedWhite, capturedBlack;
  let castlingRights, enPassantTarget, gameOver;
  let cpuThinking = false;
  let animateNextRender = false;
  let gameMode = 'cpu-medium';
  let timeMode = 'none';
  let whiteTime = 0, blackTime = 0;
  let whiteByoyomi = false, blackByoyomi = false;
  let timerInterval = null;
  let timerStarted = false;
  let gameStarted = true;

  const PIECES = {
    K: '\u2654', Q: '\u2655', R: '\u2656', B: '\u2657', N: '\u2658', P: '\u2659',
    k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F'
  };

  const INITIAL = [
    ['r','n','b','q','k','b','n','r'],
    ['p','p','p','p','p','p','p','p'],
    ['' ,'' ,'' ,'' ,'' ,'' ,'' ,''],
    ['' ,'' ,'' ,'' ,'' ,'' ,'' ,''],
    ['' ,'' ,'' ,'' ,'' ,'' ,'' ,''],
    ['' ,'' ,'' ,'' ,'' ,'' ,'' ,''],
    ['P','P','P','P','P','P','P','P'],
    ['R','N','B','Q','K','B','N','R'],
  ];

  // Helper to get element within our container
  function el(id) {
    return container.querySelector('#' + id);
  }

  function isWhite(p) { return p && p === p.toUpperCase(); }
  function isBlack(p) { return p && p === p.toLowerCase(); }
  function isAlly(p, color) { return color === 'w' ? isWhite(p) : isBlack(p); }
  function isEnemy(p, color) { return color === 'w' ? isBlack(p) : isWhite(p); }
  function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
  function cloneBoard(b) { return b.map(r => [...r]); }

  function setMode(mode) {
    gameMode = mode;
    container.querySelectorAll('#chess-mode-selector button').forEach(b => b.classList.remove('active'));
    el('chess-btn-' + mode).classList.add('active');
    const timeSel = el('chess-time-selector');
    if (mode === 'pvp') {
      timeSel.style.display = 'grid';
    } else {
      timeSel.style.display = 'none';
      timeMode = 'none';
    }
    resetGame();
  }

  function startGame() {
    gameStarted = true;
    el('chess-start-btn').style.display = 'none';
    startTimer();
    updateTimerDisplay();
  }

  function setTimeMode(mode) {
    timeMode = mode;
    container.querySelectorAll('#chess-time-selector button').forEach(b => b.classList.remove('active'));
    el('chess-btn-time-' + mode).classList.add('active');
    resetGame();
  }

  function resetGame() {
    board = INITIAL.map(r => [...r]);
    turn = 'w';
    selected = null;
    history = [];
    capturedWhite = [];
    capturedBlack = [];
    castlingRights = { K: true, Q: true, k: true, q: true };
    enPassantTarget = null;
    gameOver = false;
    cpuThinking = false;
    stopTimer();
    timerStarted = false;
    whiteByoyomi = false;
    blackByoyomi = false;
    initTimers();
    const startBtn = el('chess-start-btn');
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
    const timersEl = el('chess-timers');
    if (timeMode === 'none' || gameMode !== 'pvp') {
      timersEl.style.display = 'none';
      return;
    }
    timersEl.style.display = 'flex';
    if (timeMode === '30s') {
      whiteTime = 30; blackTime = 30;
    } else if (timeMode === '60s') {
      whiteTime = 60; blackTime = 60;
    } else if (timeMode === '5m15s') {
      whiteTime = 300; blackTime = 300;
    }
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m.toString().padStart(2, '0') + ':' + s.toString().padStart(2, '0');
  }

  function updateTimerDisplay() {
    const timersEl = el('chess-timers');
    if (timeMode === 'none' || gameMode !== 'pvp') {
      timersEl.style.display = 'none';
      return;
    }
    el('chess-timer-white-value').textContent = formatTime(whiteTime);
    el('chess-timer-black-value').textContent = formatTime(blackTime);

    const wBox = el('chess-timer-white');
    const bBox = el('chess-timer-black');
    wBox.classList.toggle('active-timer', turn === 'w' && !gameOver);
    bBox.classList.toggle('active-timer', turn === 'b' && !gameOver);
    wBox.classList.toggle('low-time', whiteTime <= 10 && whiteTime > 0 && !gameOver);
    bBox.classList.toggle('low-time', blackTime <= 10 && blackTime > 0 && !gameOver);

    const wByoEl = el('chess-timer-white-byoyomi');
    const bByoEl = el('chess-timer-black-byoyomi');
    wByoEl.textContent = whiteByoyomi ? '\u79D2\u8AAD\u307F' : '';
    bByoEl.textContent = blackByoyomi ? '\u79D2\u8AAD\u307F' : '';
  }

  function startTimer() {
    stopTimer();
    if (timeMode === 'none' || gameMode !== 'pvp' || gameOver) return;
    timerStarted = true;
    timerInterval = setInterval(() => {
      if (gameOver) { stopTimer(); return; }
      if (turn === 'w') {
        whiteTime--;
        if (whiteTime <= 0) {
          if (timeMode === '5m15s' && !whiteByoyomi) {
            whiteByoyomi = true;
            whiteTime = 15;
          } else {
            whiteTime = 0;
            stopTimer();
            gameOver = true;
            const statusEl = el('chess-status');
            statusEl.textContent = '\u6642\u9593\u5207\u308C\uFF01 \u9ED2\u306E\u52DD\u3061\uFF01';
            statusEl.style.background = '#8b0000';
          }
        }
      } else {
        blackTime--;
        if (blackTime <= 0) {
          if (timeMode === '5m15s' && !blackByoyomi) {
            blackByoyomi = true;
            blackTime = 15;
          } else {
            blackTime = 0;
            stopTimer();
            gameOver = true;
            const statusEl = el('chess-status');
            statusEl.textContent = '\u6642\u9593\u5207\u308C\uFF01 \u767D\u306E\u52DD\u3061\uFF01';
            statusEl.style.background = '#8b0000';
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
      if (turn === 'w') whiteTime = 30; else blackTime = 30;
    } else if (timeMode === '60s') {
      if (turn === 'w') whiteTime = 60; else blackTime = 60;
    } else if (timeMode === '5m15s') {
      const justMoved = turn === 'w' ? 'b' : 'w';
      if (justMoved === 'w' && whiteByoyomi) whiteTime = 15;
      if (justMoved === 'b' && blackByoyomi) blackTime = 15;
    }
    startTimer();
    updateTimerDisplay();
  }

  function getPseudoMoves(b, r, c, castling, epTarget) {
    const piece = b[r][c];
    if (!piece) return [];
    const color = isWhite(piece) ? 'w' : 'b';
    const moves = [];
    const type = piece.toUpperCase();

    const addIfValid = (nr, nc) => {
      if (!inBounds(nr, nc)) return false;
      if (isAlly(b[nr][nc], color)) return false;
      moves.push([nr, nc]);
      return !b[nr][nc];
    };

    const slide = (dirs) => {
      for (const [dr, dc] of dirs) {
        for (let i = 1; i < 8; i++) {
          if (!addIfValid(r + dr * i, c + dc * i)) break;
        }
      }
    };

    if (type === 'P') {
      const dir = color === 'w' ? -1 : 1;
      const startRow = color === 'w' ? 6 : 1;
      if (inBounds(r + dir, c) && !b[r + dir][c]) {
        moves.push([r + dir, c]);
        if (r === startRow && !b[r + 2 * dir][c]) moves.push([r + 2 * dir, c]);
      }
      for (const dc of [-1, 1]) {
        const nr = r + dir, nc = c + dc;
        if (inBounds(nr, nc)) {
          if (isEnemy(b[nr][nc], color)) moves.push([nr, nc]);
          if (epTarget && epTarget[0] === nr && epTarget[1] === nc) moves.push([nr, nc]);
        }
      }
    } else if (type === 'N') {
      for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])
        addIfValid(r + dr, c + dc);
    } else if (type === 'B') {
      slide([[-1,-1],[-1,1],[1,-1],[1,1]]);
    } else if (type === 'R') {
      slide([[-1,0],[1,0],[0,-1],[0,1]]);
    } else if (type === 'Q') {
      slide([[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]);
    } else if (type === 'K') {
      for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]])
        addIfValid(r + dr, c + dc);
      if (castling) {
        const row = color === 'w' ? 7 : 0;
        if (r === row && c === 4) {
          const ks = color === 'w' ? 'K' : 'k';
          const qs = color === 'w' ? 'Q' : 'q';
          if (castling[ks] && b[row][5] === '' && b[row][6] === '' && b[row][7].toUpperCase() === 'R' && isAlly(b[row][7], color)) {
            if (!isSquareAttacked(b, row, 4, color) && !isSquareAttacked(b, row, 5, color) && !isSquareAttacked(b, row, 6, color))
              moves.push([row, 6]);
          }
          if (castling[qs] && b[row][3] === '' && b[row][2] === '' && b[row][1] === '' && b[row][0].toUpperCase() === 'R' && isAlly(b[row][0], color)) {
            if (!isSquareAttacked(b, row, 4, color) && !isSquareAttacked(b, row, 3, color) && !isSquareAttacked(b, row, 2, color))
              moves.push([row, 2]);
          }
        }
      }
    }
    return moves;
  }

  function isSquareAttacked(b, r, c, byColor) {
    const enemy = byColor === 'w' ? 'b' : 'w';
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        if (isAlly(b[i][j], enemy)) {
          const moves = getPseudoMoves(b, i, j, null, null);
          if (moves.some(([mr, mc]) => mr === r && mc === c)) return true;
        }
      }
    }
    return false;
  }

  function findKing(b, color) {
    const king = color === 'w' ? 'K' : 'k';
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 8; j++)
        if (b[i][j] === king) return [i, j];
    return null;
  }

  function isInCheck(b, color) {
    const kp = findKing(b, color);
    if (!kp) return false;
    return isSquareAttacked(b, kp[0], kp[1], color);
  }

  function simulateMove(b, fr, fc, tr, tc, epTarget, cr) {
    const nb = cloneBoard(b);
    const piece = nb[fr][fc];
    const color = isWhite(piece) ? 'w' : 'b';

    if (piece.toUpperCase() === 'P' && epTarget && tr === epTarget[0] && tc === epTarget[1]) {
      nb[fr][tc] = '';
    }
    nb[tr][tc] = piece;
    nb[fr][fc] = '';

    if (piece.toUpperCase() === 'K' && Math.abs(tc - fc) === 2) {
      const row = fr;
      if (tc === 6) { nb[row][5] = nb[row][7]; nb[row][7] = ''; }
      if (tc === 2) { nb[row][3] = nb[row][0]; nb[row][0] = ''; }
    }

    const promoRow = color === 'w' ? 0 : 7;
    if (piece.toUpperCase() === 'P' && tr === promoRow) {
      nb[tr][tc] = color === 'w' ? 'Q' : 'q';
    }

    const ncr = { ...cr };
    if (piece === 'K') { ncr.K = false; ncr.Q = false; }
    if (piece === 'k') { ncr.k = false; ncr.q = false; }
    if (piece === 'R' && fr === 7 && fc === 7) ncr.K = false;
    if (piece === 'R' && fr === 7 && fc === 0) ncr.Q = false;
    if (piece === 'r' && fr === 0 && fc === 7) ncr.k = false;
    if (piece === 'r' && fr === 0 && fc === 0) ncr.q = false;
    if (tr === 0 && tc === 7) ncr.k = false;
    if (tr === 0 && tc === 0) ncr.q = false;
    if (tr === 7 && tc === 7) ncr.K = false;
    if (tr === 7 && tc === 0) ncr.Q = false;

    let nep = null;
    if (piece.toUpperCase() === 'P' && Math.abs(tr - fr) === 2) {
      nep = [(fr + tr) / 2, fc];
    }

    return { board: nb, castlingRights: ncr, enPassantTarget: nep };
  }

  function tryMove(b, fr, fc, tr, tc, epTarget) {
    const nb = cloneBoard(b);
    const piece = nb[fr][fc];
    const color = isWhite(piece) ? 'w' : 'b';

    if (piece.toUpperCase() === 'P' && epTarget && tr === epTarget[0] && tc === epTarget[1]) {
      nb[fr][tc] = '';
    }
    nb[tr][tc] = piece;
    nb[fr][fc] = '';

    if (piece.toUpperCase() === 'K' && Math.abs(tc - fc) === 2) {
      const row = fr;
      if (tc === 6) { nb[row][5] = nb[row][7]; nb[row][7] = ''; }
      if (tc === 2) { nb[row][3] = nb[row][0]; nb[row][0] = ''; }
    }

    return isInCheck(nb, color) ? null : nb;
  }

  function getLegalMoves(r, c) {
    const piece = board[r][c];
    if (!piece) return [];
    const pseudo = getPseudoMoves(board, r, c, castlingRights, enPassantTarget);
    return pseudo.filter(([tr, tc]) => tryMove(board, r, c, tr, tc, enPassantTarget) !== null);
  }

  function getLegalMovesForState(b, color, cr, ep) {
    const allMoves = [];
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        if (isAlly(b[i][j], color)) {
          const pseudo = getPseudoMoves(b, i, j, cr, ep);
          for (const [tr, tc] of pseudo) {
            if (tryMove(b, i, j, tr, tc, ep) !== null) {
              allMoves.push([i, j, tr, tc]);
            }
          }
        }
      }
    }
    return allMoves;
  }

  function hasAnyLegalMove(color) {
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 8; j++)
        if (isAlly(board[i][j], color) && getLegalMoves(i, j).length > 0)
          return true;
    return false;
  }

  // ===== AI Engine =====

  const PIECE_VALUES = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };

  const PST = {
    P: [
       0,  0,  0,  0,  0,  0,  0,  0,
      50, 50, 50, 50, 50, 50, 50, 50,
      10, 10, 20, 30, 30, 20, 10, 10,
       5,  5, 10, 25, 25, 10,  5,  5,
       0,  0,  0, 20, 20,  0,  0,  0,
       5, -5,-10,  0,  0,-10, -5,  5,
       5, 10, 10,-20,-20, 10, 10,  5,
       0,  0,  0,  0,  0,  0,  0,  0,
    ],
    N: [
      -50,-40,-30,-30,-30,-30,-40,-50,
      -40,-20,  0,  0,  0,  0,-20,-40,
      -30,  0, 10, 15, 15, 10,  0,-30,
      -30,  5, 15, 20, 20, 15,  5,-30,
      -30,  0, 15, 20, 20, 15,  0,-30,
      -30,  5, 10, 15, 15, 10,  5,-30,
      -40,-20,  0,  5,  5,  0,-20,-40,
      -50,-40,-30,-30,-30,-30,-40,-50,
    ],
    B: [
      -20,-10,-10,-10,-10,-10,-10,-20,
      -10,  0,  0,  0,  0,  0,  0,-10,
      -10,  0, 10, 10, 10, 10,  0,-10,
      -10,  5,  5, 10, 10,  5,  5,-10,
      -10,  0, 10, 10, 10, 10,  0,-10,
      -10, 10, 10, 10, 10, 10, 10,-10,
      -10,  5,  0,  0,  0,  0,  5,-10,
      -20,-10,-10,-10,-10,-10,-10,-20,
    ],
    R: [
       0,  0,  0,  0,  0,  0,  0,  0,
       5, 10, 10, 10, 10, 10, 10,  5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
       0,  0,  0,  5,  5,  0,  0,  0,
    ],
    Q: [
      -20,-10,-10, -5, -5,-10,-10,-20,
      -10,  0,  0,  0,  0,  0,  0,-10,
      -10,  0,  5,  5,  5,  5,  0,-10,
       -5,  0,  5,  5,  5,  5,  0, -5,
        0,  0,  5,  5,  5,  5,  0, -5,
      -10,  5,  5,  5,  5,  5,  0,-10,
      -10,  0,  5,  0,  0,  0,  0,-10,
      -20,-10,-10, -5, -5,-10,-10,-20,
    ],
    K: [
      -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30,
      -20,-30,-30,-40,-40,-30,-30,-20,
      -10,-20,-20,-20,-20,-20,-20,-10,
       20, 20,  0,  0,  0,  0, 20, 20,
       20, 30, 10,  0,  0, 10, 30, 20,
    ],
  };

  function evaluate(b) {
    let score = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = b[r][c];
        if (!piece) continue;
        const type = piece.toUpperCase();
        const val = PIECE_VALUES[type] || 0;
        const pstIdx = isWhite(piece) ? r * 8 + c : (7 - r) * 8 + c;
        const pst = PST[type] ? PST[type][pstIdx] : 0;
        if (isWhite(piece)) {
          score += val + pst;
        } else {
          score -= val + pst;
        }
      }
    }
    return score;
  }

  function orderMoves(b, moves, ep) {
    return moves.map(m => {
      let score = 0;
      const [fr, fc, tr, tc] = m;
      const target = b[tr][tc];
      const piece = b[fr][fc];
      if (target) {
        score += 10 * (PIECE_VALUES[target.toUpperCase()] || 0) - (PIECE_VALUES[piece.toUpperCase()] || 0);
      }
      const promoRow = isWhite(piece) ? 0 : 7;
      if (piece.toUpperCase() === 'P' && tr === promoRow) score += 900;
      return { move: m, score };
    }).sort((a, b) => b.score - a.score).map(x => x.move);
  }

  function minimax(b, depth, alpha, beta, maximizing, cr, ep) {
    const color = maximizing ? 'w' : 'b';
    const moves = getLegalMovesForState(b, color, cr, ep);

    if (moves.length === 0) {
      if (isInCheck(b, color)) return maximizing ? -99999 + (4 - depth) : 99999 - (4 - depth);
      return 0;
    }
    if (depth === 0) return evaluate(b);

    const ordered = orderMoves(b, moves, ep);

    if (maximizing) {
      let maxEval = -Infinity;
      for (const [fr, fc, tr, tc] of ordered) {
        const state = simulateMove(b, fr, fc, tr, tc, ep, cr);
        const ev = minimax(state.board, depth - 1, alpha, beta, false, state.castlingRights, state.enPassantTarget);
        maxEval = Math.max(maxEval, ev);
        alpha = Math.max(alpha, ev);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const [fr, fc, tr, tc] of ordered) {
        const state = simulateMove(b, fr, fc, tr, tc, ep, cr);
        const ev = minimax(state.board, depth - 1, alpha, beta, true, state.castlingRights, state.enPassantTarget);
        minEval = Math.min(minEval, ev);
        beta = Math.min(beta, ev);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }

  function getCpuMove() {
    const depthMap = { 'cpu-beginner': 1, 'cpu-easy': 1, 'cpu-medium': 3, 'cpu-hard': 4, 'cpu-expert': 5 };
    const depth = depthMap[gameMode] || 3;
    const color = turn;
    const maximizing = color === 'w';
    const moves = getLegalMovesForState(board, color, castlingRights, enPassantTarget);
    if (moves.length === 0) return null;

    if (gameMode === 'cpu-beginner') {
      if (Math.random() < 0.7) {
        return moves[Math.floor(Math.random() * moves.length)];
      }
      const scored = moves.map(([fr, fc, tr, tc]) => {
        const state = simulateMove(board, fr, fc, tr, tc, enPassantTarget, castlingRights);
        return { move: [fr, fc, tr, tc], score: evaluate(state.board) + (Math.random() - 0.5) * 300 };
      });
      scored.sort((a, b) => maximizing ? b.score - a.score : a.score - b.score);
      const topN = Math.min(5, scored.length);
      return scored[Math.floor(Math.random() * topN)].move;
    }

    if (gameMode === 'cpu-easy') {
      const scored = moves.map(([fr, fc, tr, tc]) => {
        const state = simulateMove(board, fr, fc, tr, tc, enPassantTarget, castlingRights);
        const ev = evaluate(state.board);
        return { move: [fr, fc, tr, tc], score: ev + (Math.random() - 0.5) * 200 };
      });
      scored.sort((a, b) => maximizing ? b.score - a.score : a.score - b.score);
      const topN = Math.min(3, scored.length);
      const pick = scored[Math.floor(Math.random() * topN)];
      return pick.move;
    }

    const ordered = orderMoves(board, moves, enPassantTarget);
    let bestMove = ordered[0];
    let bestEval = maximizing ? -Infinity : Infinity;

    for (const [fr, fc, tr, tc] of ordered) {
      const state = simulateMove(board, fr, fc, tr, tc, enPassantTarget, castlingRights);
      const ev = minimax(state.board, depth - 1, -Infinity, Infinity, !maximizing, state.castlingRights, state.enPassantTarget);
      if (maximizing ? ev > bestEval : ev < bestEval) {
        bestEval = ev;
        bestMove = [fr, fc, tr, tc];
      }
    }
    return bestMove;
  }

  function isCpuTurn() {
    return gameMode !== 'pvp' && turn === 'b';
  }

  // ===== End AI =====

  function showPromotion(color) {
    return new Promise(resolve => {
      const overlay = el('chess-promotion-overlay');
      const choices = el('chess-promotion-choices');
      const pieces = color === 'w' ? ['Q','R','B','N'] : ['q','r','b','n'];
      choices.innerHTML = '';
      pieces.forEach(p => {
        const pieceEl = document.createElement('span');
        pieceEl.className = 'promo-piece';
        pieceEl.textContent = PIECES[p];
        pieceEl.onclick = () => { overlay.classList.remove('active'); resolve(p); };
        choices.appendChild(pieceEl);
      });
      overlay.classList.add('active');
    });
  }

  async function makeMove(fr, fc, tr, tc, isCpu) {
    const piece = board[fr][fc];
    const color = isWhite(piece) ? 'w' : 'b';
    const captured = board[tr][tc];

    const histEntry = {
      board: cloneBoard(board), turn, castlingRights: { ...castlingRights },
      enPassantTarget, capturedWhite: [...capturedWhite], capturedBlack: [...capturedBlack],
      lastMove: null
    };

    let epCaptured = '';
    if (piece.toUpperCase() === 'P' && enPassantTarget && tr === enPassantTarget[0] && tc === enPassantTarget[1]) {
      epCaptured = board[fr][tc];
      board[fr][tc] = '';
    }

    if (captured) {
      if (isWhite(captured)) capturedWhite.push(captured);
      else capturedBlack.push(captured);
    }
    if (epCaptured) {
      if (isWhite(epCaptured)) capturedWhite.push(epCaptured);
      else capturedBlack.push(epCaptured);
    }

    board[tr][tc] = piece;
    board[fr][fc] = '';

    if (piece.toUpperCase() === 'K' && Math.abs(tc - fc) === 2) {
      const row = fr;
      if (tc === 6) { board[row][5] = board[row][7]; board[row][7] = ''; }
      if (tc === 2) { board[row][3] = board[row][0]; board[row][0] = ''; }
    }

    if (piece === 'K') { castlingRights.K = false; castlingRights.Q = false; }
    if (piece === 'k') { castlingRights.k = false; castlingRights.q = false; }
    if (piece === 'R' && fr === 7 && fc === 7) castlingRights.K = false;
    if (piece === 'R' && fr === 7 && fc === 0) castlingRights.Q = false;
    if (piece === 'r' && fr === 0 && fc === 7) castlingRights.k = false;
    if (piece === 'r' && fr === 0 && fc === 0) castlingRights.q = false;
    if (tr === 0 && tc === 7) castlingRights.k = false;
    if (tr === 0 && tc === 0) castlingRights.q = false;
    if (tr === 7 && tc === 7) castlingRights.K = false;
    if (tr === 7 && tc === 0) castlingRights.Q = false;

    if (piece.toUpperCase() === 'P' && Math.abs(tr - fr) === 2) {
      enPassantTarget = [(fr + tr) / 2, fc];
    } else {
      enPassantTarget = null;
    }

    const promoRow = color === 'w' ? 0 : 7;
    if (piece.toUpperCase() === 'P' && tr === promoRow) {
      if (isCpu) {
        board[tr][tc] = color === 'w' ? 'Q' : 'q';
      } else {
        const choice = await showPromotion(color);
        board[tr][tc] = choice;
      }
    }

    histEntry.lastMove = [fr, fc, tr, tc];
    histEntry.wasCapture = !!(captured || epCaptured);
    history.push(histEntry);
    turn = turn === 'w' ? 'b' : 'w';
    selected = null;
    animateNextRender = true;
    render();
    updateStatus();

    if (!gameOver) {
      onMoveMadeTimer();
    } else {
      stopTimer();
    }
    updateTimerDisplay();

    if (!gameOver && isCpuTurn()) {
      scheduleCpuMove();
    }
  }

  function scheduleCpuMove() {
    cpuThinking = true;
    updateStatus();
    setTimeout(() => {
      const move = getCpuMove();
      cpuThinking = false;
      if (move) {
        makeMove(move[0], move[1], move[2], move[3], true);
      }
    }, 300);
  }

  function undoMove() {
    if (history.length === 0 || gameOver || cpuThinking) return;
    if (gameMode !== 'pvp' && history.length >= 2) {
      history.pop();
      const h = history.pop();
      board = h.board;
      turn = h.turn;
      castlingRights = h.castlingRights;
      enPassantTarget = h.enPassantTarget;
      capturedWhite = h.capturedWhite;
      capturedBlack = h.capturedBlack;
    } else {
      const h = history.pop();
      board = h.board;
      turn = h.turn;
      castlingRights = h.castlingRights;
      enPassantTarget = h.enPassantTarget;
      capturedWhite = h.capturedWhite;
      capturedBlack = h.capturedBlack;
    }
    selected = null;
    render();
    updateStatus();
  }

  function updateStatus() {
    const statusEl = el('chess-status');
    const inCheck = isInCheck(board, turn);
    const hasMove = hasAnyLegalMove(turn);
    const name = turn === 'w' ? '\u767D' : '\u9ED2';

    if (cpuThinking) {
      statusEl.innerHTML = '<span class="thinking-indicator">CPU\u601D\u8003\u4E2D...</span>';
      statusEl.style.background = '#2a1a4a';
      return;
    }

    if (!hasMove) {
      gameOver = true;
      stopTimer();
      updateTimerDisplay();
      if (inCheck) {
        statusEl.textContent = '\u30C1\u30A7\u30C3\u30AF\u30E1\u30A4\u30C8\uFF01 ' + (turn === 'w' ? '\u9ED2' : '\u767D') + '\u306E\u52DD\u3061\uFF01';
        statusEl.style.background = '#8b0000';
      } else {
        statusEl.textContent = '\u30B9\u30C6\u30A4\u30EB\u30E1\u30A4\u30C8\uFF08\u5F15\u304D\u5206\u3051\uFF09';
        statusEl.style.background = '#555';
      }
    } else if (inCheck) {
      statusEl.textContent = name + '\u306E\u756A\u3067\u3059\uFF08\u30C1\u30A7\u30C3\u30AF\uFF01\uFF09';
      statusEl.style.background = '#8b4513';
    } else {
      statusEl.textContent = name + '\u306E\u756A\u3067\u3059';
      statusEl.style.background = '#16213e';
    }
  }

  function render() {
    const boardEl = el('chess-board');
    boardEl.innerHTML = '';
    const lastMove = history.length > 0 ? history[history.length - 1].lastMove : null;
    const inCheck = isInCheck(board, turn);
    const kingPos = findKing(board, turn);
    const legalMoves = selected ? getLegalMoves(selected[0], selected[1]) : [];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = document.createElement('div');
        sq.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
        if (cpuThinking) sq.classList.add('thinking');

        if (lastMove) {
          if ((r === lastMove[0] && c === lastMove[1]) || (r === lastMove[2] && c === lastMove[3]))
            sq.classList.add('last-move');
        }

        if (selected && selected[0] === r && selected[1] === c)
          sq.classList.add('selected');

        if (inCheck && kingPos && kingPos[0] === r && kingPos[1] === c)
          sq.classList.add('check');

        if (legalMoves.some(([mr, mc]) => mr === r && mc === c)) {
          sq.classList.add(board[r][c] ? 'legal-capture' : 'legal-move');
        }

        if (board[r][c]) {
          const p = document.createElement('span');
          p.className = 'piece ' + (isBlack(board[r][c]) ? 'black' : 'white');
          p.textContent = PIECES[board[r][c]];
          if (animateNextRender && lastMove && r === lastMove[2] && c === lastMove[3]) {
            const dr = lastMove[0] - lastMove[2];
            const dc = lastMove[1] - lastMove[3];
            p.style.setProperty('--dx', (dc * 72) + 'px');
            p.style.setProperty('--dy', (dr * 72) + 'px');
            const wasCapture = history.length > 0 && history[history.length - 1].wasCapture;
            p.classList.add(wasCapture ? 'capture-anim' : 'move-anim');
            if (wasCapture) sq.classList.add('capture-flash');
          }
          if (animateNextRender && inCheck && kingPos && kingPos[0] === r && kingPos[1] === c) {
            sq.classList.add('check-anim');
          }
          sq.appendChild(p);
        }

        sq.onclick = () => handleClick(r, c);
        boardEl.appendChild(sq);
      }
    }

    const colEl = el('chess-coords-col');
    const rowEl = el('chess-coords-row');
    colEl.innerHTML = '87654321'.split('').map(n => '<span>' + n + '</span>').join('');
    rowEl.innerHTML = 'abcdefgh'.split('').map(l => '<span style="width:72px;display:inline-block;text-align:center">' + l + '</span>').join('');

    el('chess-captured-white').innerHTML = capturedBlack.sort().map(p => PIECES[p]).join('');
    el('chess-captured-black').innerHTML = capturedWhite.sort().map(p => PIECES[p]).join('');
    animateNextRender = false;
  }

  async function handleClick(r, c) {
    if (gameOver || cpuThinking || !gameStarted) return;
    if (isCpuTurn()) return;

    if (selected) {
      const legalMoves = getLegalMoves(selected[0], selected[1]);
      if (legalMoves.some(([mr, mc]) => mr === r && mc === c)) {
        await makeMove(selected[0], selected[1], r, c, false);
        return;
      }
    }

    if (board[r][c] && isAlly(board[r][c], turn)) {
      selected = [r, c];
    } else {
      selected = null;
    }
    render();
  }

  function buildHTML() {
    container.innerHTML = `
      <div id="chess-controls" style="margin-bottom:12px;max-width:576px;">
        <div id="chess-mode-selector" style="margin-bottom:8px;display:grid;grid-template-columns:repeat(3,1fr);gap:5px;max-width:320px;margin-left:auto;margin-right:auto;">
          <button id="chess-btn-pvp">\uD83D\uDC65 \u5BFE\u4EBA\u6226</button>
          <button id="chess-btn-cpu-beginner">\u5165\u9580</button>
          <button id="chess-btn-cpu-easy">\u521D\u7D1A</button>
          <button id="chess-btn-cpu-medium">\u4E2D\u7D1A</button>
          <button id="chess-btn-cpu-hard">\u4E0A\u7D1A</button>
          <button id="chess-btn-cpu-expert">\u6700\u5F37</button>
        </div>
        <div id="chess-time-selector" style="margin-bottom:8px;display:none;grid-template-columns:repeat(4,1fr);gap:5px;max-width:320px;margin-left:auto;margin-right:auto;">
          <button id="chess-btn-time-none">\u5236\u9650\u306A\u3057</button>
          <button id="chess-btn-time-30s">30\u79D2</button>
          <button id="chess-btn-time-60s">60\u79D2</button>
          <button id="chess-btn-time-5m15s">5\u5206+15\u79D2</button>
        </div>
      </div>
      <div id="chess-timers" style="display:none;justify-content:center;gap:20px;margin-bottom:8px;font-size:1.1rem;font-family:'Consolas','Courier New',monospace;">
        <div class="timer-box white-timer" id="chess-timer-white">
          <div class="timer-label">\u767D</div>
          <div class="timer-value" id="chess-timer-white-value">--:--</div>
          <div class="timer-byoyomi" id="chess-timer-white-byoyomi"></div>
        </div>
        <div class="timer-box black-timer" id="chess-timer-black">
          <div class="timer-label">\u9ED2</div>
          <div class="timer-value" id="chess-timer-black-value">--:--</div>
          <div class="timer-byoyomi" id="chess-timer-black-byoyomi"></div>
        </div>
      </div>
      <button id="chess-start-btn" style="display:none;margin:0 auto 8px;padding:8px 36px;font-size:1rem;background:#2e7d32;color:#fff;border:none;border-radius:8px;cursor:pointer;letter-spacing:2px;transition:background 0.2s;">\u25B6 \u958B\u59CB</button>
      <div id="chess-status" style="font-size:1.05rem;margin-bottom:8px;padding:6px 16px;background:#16213e;border-radius:8px;display:inline-block;">\u767D\u306E\u756A\u3067\u3059</div>
      <div class="board-wrapper" style="position:relative;display:inline-block;">
        <div class="coords-col" id="chess-coords-col" style="position:absolute;left:-24px;top:0;height:100%;display:flex;flex-direction:column;justify-content:space-around;font-size:0.75rem;color:#888;width:20px;text-align:center;"></div>
        <div id="chess-board" style="display:grid;grid-template-columns:repeat(8,72px);grid-template-rows:repeat(8,72px);border:3px solid #0f3460;border-radius:4px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.5);"></div>
        <div class="coords-row" id="chess-coords-row" style="display:flex;justify-content:space-around;font-size:0.75rem;color:#888;margin-top:4px;"></div>
      </div>
      <div id="chess-captured" style="display:flex;justify-content:center;gap:30px;margin-top:8px;font-size:26px;">
        <div class="captured-group" id="chess-captured-white"></div>
        <div class="captured-group" id="chess-captured-black"></div>
      </div>
      <div class="buttons" style="margin-top:10px;">
        <button id="chess-undo-btn">\u21A9 \u623B\u3059</button>
        <button id="chess-reset-btn">\u267B \u65B0\u898F</button>
      </div>
      <div id="chess-promotion-overlay" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:100;justify-content:center;align-items:center;">
        <div id="chess-promotion-choices" style="background:#16213e;padding:20px;border-radius:12px;display:flex;gap:12px;box-shadow:0 8px 32px rgba(0,0,0,0.5);"></div>
      </div>
    `;
  }

  function injectCSS() {
    if (document.getElementById('chess-game-styles')) return;
    const style = document.createElement('style');
    style.id = 'chess-game-styles';
    style.textContent = `
      #chess-board {
        display: grid;
        grid-template-columns: repeat(8, 72px);
        grid-template-rows: repeat(8, 72px);
      }
      .square {
        width: 72px; height: 72px; display: flex; justify-content: center; align-items: center;
        font-size: 48px; cursor: pointer; user-select: none; position: relative;
        transition: background 0.15s;
      }
      .light { background: #e8d5b5; }
      .dark { background: #b58863; }
      .square.selected { background: #f6e47a !important; }
      .square.legal-move::after {
        content: ''; position: absolute; width: 20px; height: 20px;
        background: rgba(0,0,0,0.2); border-radius: 50%;
      }
      .square.legal-capture::after {
        content: ''; position: absolute; width: 62px; height: 62px;
        border: 4px solid rgba(0,0,0,0.2); border-radius: 50%;
        background: transparent;
      }
      .square.last-move { background: rgba(155, 199, 0, 0.41) !important; }
      .square.check { box-shadow: inset 0 0 16px 4px rgba(255,0,0,0.6); }
      .square.thinking { pointer-events: none; }
      .piece {
        z-index: 1; line-height: 1; font-size: 54px;
        filter: drop-shadow(1px 2px 2px rgba(0,0,0,0.4));
        position: relative;
      }
      .piece.white {
        color: #fff;
        -webkit-text-stroke: 1px #888;
        filter: drop-shadow(1px 2px 3px rgba(0,0,0,0.5));
      }
      .piece.black {
        color: #222;
        -webkit-text-stroke: 1px #555;
        filter: drop-shadow(1px 2px 3px rgba(0,0,0,0.4));
      }
      .piece.move-anim {
        animation: pieceSlide 0.3s ease-out forwards;
      }
      @keyframes pieceSlide {
        from { transform: translate(var(--dx), var(--dy)) scale(1.15); }
        to { transform: translate(0, 0) scale(1); }
      }
      .piece.capture-anim {
        animation: pieceCapture 0.35s ease-out forwards;
      }
      @keyframes pieceCapture {
        0% { transform: translate(var(--dx), var(--dy)) scale(1.2); }
        50% { transform: translate(0, 0) scale(1.25); filter: drop-shadow(0 0 12px rgba(255,200,0,0.8)); }
        100% { transform: translate(0, 0) scale(1); }
      }
      .square.capture-flash {
        animation: captureFlash 0.4s ease-out;
      }
      @keyframes captureFlash {
        0% { box-shadow: inset 0 0 0 0 rgba(255,150,0,0); }
        30% { box-shadow: inset 0 0 20px 8px rgba(255,150,0,0.5); }
        100% { box-shadow: none; }
      }
      .square.check-anim {
        animation: checkPulse 0.6s ease-in-out;
      }
      @keyframes checkPulse {
        0% { box-shadow: inset 0 0 0 0 rgba(255,0,0,0); }
        30% { box-shadow: inset 0 0 24px 8px rgba(255,0,0,0.7); }
        60% { box-shadow: inset 0 0 12px 4px rgba(255,0,0,0.4); }
        100% { box-shadow: inset 0 0 16px 4px rgba(255,0,0,0.6); }
      }
      #chess-mode-selector button {
        padding: 5px 12px; font-size: 0.85rem;
        background: #0f3460; color: #e0e0e0; border: 2px solid transparent; border-radius: 6px;
        cursor: pointer; transition: all 0.2s;
      }
      #chess-mode-selector button:hover { background: #1a4a8a; }
      #chess-mode-selector button.active { border-color: #f6e47a; background: #1a4a8a; }
      #chess-time-selector button {
        padding: 4px 10px; font-size: 0.8rem;
        background: #1a3a5c; color: #e0e0e0; border: 2px solid transparent; border-radius: 6px;
        cursor: pointer; transition: all 0.2s;
      }
      #chess-time-selector button:hover { background: #1a4a8a; }
      #chess-time-selector button.active { border-color: #f6e47a; background: #1a4a8a; }
      .timer-box {
        padding: 6px 16px; border-radius: 8px; min-width: 120px; text-align: center;
      }
      .timer-box.white-timer { background: #ddd; color: #222; }
      .timer-box.black-timer { background: #333; color: #eee; }
      .timer-box.active-timer { box-shadow: 0 0 8px 2px rgba(246,228,122,0.6); }
      .timer-box.low-time { animation: timerWarn 0.5s infinite; }
      @keyframes timerWarn {
        0%,100% { box-shadow: 0 0 8px 2px rgba(255,0,0,0.6); }
        50% { box-shadow: 0 0 16px 4px rgba(255,0,0,0.9); }
      }
      .timer-label { font-size: 0.7rem; opacity: 0.7; }
      .timer-value { font-size: 1.3rem; font-weight: bold; }
      .timer-byoyomi { font-size: 0.65rem; color: #f6e47a; }
      .buttons button {
        padding: 7px 18px; margin: 0 5px; font-size: 0.9rem;
        background: #0f3460; color: #e0e0e0; border: none; border-radius: 6px;
        cursor: pointer; transition: background 0.2s;
      }
      .buttons button:hover { background: #1a4a8a; }
      .captured-group { display: flex; flex-wrap: wrap; gap: 2px; align-items: center; }
      #chess-promotion-overlay.active { display: flex !important; }
      #chess-promotion-choices .promo-piece {
        font-size: 52px; cursor: pointer; padding: 8px 12px; border-radius: 8px;
        transition: background 0.2s;
      }
      #chess-promotion-choices .promo-piece:hover { background: #0f3460; }
      #chess-start-btn:hover { background: #388e3c; }
      @keyframes thinking-pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
      .thinking-indicator { animation: thinking-pulse 1s infinite; }
    `;
    document.head.appendChild(style);
  }

  function bindEvents() {
    el('chess-btn-pvp').onclick = () => setMode('pvp');
    el('chess-btn-cpu-beginner').onclick = () => setMode('cpu-beginner');
    el('chess-btn-cpu-easy').onclick = () => setMode('cpu-easy');
    el('chess-btn-cpu-medium').onclick = () => setMode('cpu-medium');
    el('chess-btn-cpu-hard').onclick = () => setMode('cpu-hard');
    el('chess-btn-cpu-expert').onclick = () => setMode('cpu-expert');
    el('chess-btn-time-none').onclick = () => setTimeMode('none');
    el('chess-btn-time-30s').onclick = () => setTimeMode('30s');
    el('chess-btn-time-60s').onclick = () => setTimeMode('60s');
    el('chess-btn-time-5m15s').onclick = () => setTimeMode('5m15s');
    el('chess-start-btn').onclick = () => startGame();
    el('chess-undo-btn').onclick = () => undoMove();
    el('chess-reset-btn').onclick = () => resetGame();
  }

  return {
    init(containerEl) {
      container = containerEl;
      injectCSS();
      buildHTML();
      bindEvents();
      el('chess-btn-time-none').classList.add('active');
      setMode('cpu-medium');
    },
    destroy() {
      stopTimer();
      if (container) {
        container.innerHTML = '';
      }
      const styleEl = document.getElementById('chess-game-styles');
      if (styleEl) {
        styleEl.remove();
      }
      container = null;
    }
  };
})();
