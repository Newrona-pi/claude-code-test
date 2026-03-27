const ShogiGame = (function() {
  // Private state
  let container = null;
  let board, turn, selected, history, gameOver;
  let handSente, handGote; // captured pieces in hand
  let selectedHand = null; // { player: 'sente'|'gote', piece: string }
  let cpuThinking = false;
  let animateNextRender = false;
  let gameMode = 'cpu-medium';
  let timeMode = 'none';
  let senteTime = 0, goteTime = 0;
  let senteByoyomi = false, goteByoyomi = false;
  let timerInterval = null;
  let timerStarted = false;
  let gameStarted = true;

  // Piece types (unpromoted)
  // Sente pieces: uppercase first letter convention
  // We store pieces as objects: { type: string, owner: 'sente'|'gote', promoted: bool }
  // type is one of: 'K','R','B','G','S','N','L','P'

  const KANJI = {
    K: { sente: '玉', gote: '王' },
    R: { normal: '飛', promoted: '龍' },
    B: { normal: '角', promoted: '馬' },
    G: { normal: '金' },
    S: { normal: '銀', promoted: '成銀' },
    N: { normal: '桂', promoted: '成桂' },
    L: { normal: '香', promoted: '成香' },
    P: { normal: '歩', promoted: 'と' }
  };

  const HAND_ORDER = ['R', 'B', 'G', 'S', 'N', 'L', 'P'];

  function getKanji(piece) {
    if (!piece) return '';
    if (piece.type === 'K') return KANJI.K[piece.owner];
    const k = KANJI[piece.type];
    if (piece.promoted) return k.promoted;
    return k.normal;
  }

  function getHandKanji(type) {
    if (type === 'K') return '玉';
    return KANJI[type].normal;
  }

  // Material values
  const PIECE_VALUES = {
    P: 100, L: 300, N: 350, S: 500, G: 550, B: 800, R: 1000, K: 50000
  };
  const PROMOTED_BONUS = {
    P: 350, L: 250, N: 250, S: 50, B: 200, R: 200
  };

  const INITIAL_BOARD = [
    // Row 0 = top (Gote's back rank)
    [{type:'L',owner:'gote',promoted:false},{type:'N',owner:'gote',promoted:false},{type:'S',owner:'gote',promoted:false},{type:'G',owner:'gote',promoted:false},{type:'K',owner:'gote',promoted:false},{type:'G',owner:'gote',promoted:false},{type:'S',owner:'gote',promoted:false},{type:'N',owner:'gote',promoted:false},{type:'L',owner:'gote',promoted:false}],
    // Row 1
    [null,{type:'R',owner:'gote',promoted:false},null,null,null,null,null,{type:'B',owner:'gote',promoted:false},null],
    // Row 2
    [{type:'P',owner:'gote',promoted:false},{type:'P',owner:'gote',promoted:false},{type:'P',owner:'gote',promoted:false},{type:'P',owner:'gote',promoted:false},{type:'P',owner:'gote',promoted:false},{type:'P',owner:'gote',promoted:false},{type:'P',owner:'gote',promoted:false},{type:'P',owner:'gote',promoted:false},{type:'P',owner:'gote',promoted:false}],
    // Rows 3-5: empty
    [null,null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null,null],
    // Row 6: Sente pawns
    [{type:'P',owner:'sente',promoted:false},{type:'P',owner:'sente',promoted:false},{type:'P',owner:'sente',promoted:false},{type:'P',owner:'sente',promoted:false},{type:'P',owner:'sente',promoted:false},{type:'P',owner:'sente',promoted:false},{type:'P',owner:'sente',promoted:false},{type:'P',owner:'sente',promoted:false},{type:'P',owner:'sente',promoted:false}],
    // Row 7
    [null,{type:'B',owner:'sente',promoted:false},null,null,null,null,null,{type:'R',owner:'sente',promoted:false},null],
    // Row 8 = bottom (Sente's back rank)
    [{type:'L',owner:'sente',promoted:false},{type:'N',owner:'sente',promoted:false},{type:'S',owner:'sente',promoted:false},{type:'G',owner:'sente',promoted:false},{type:'K',owner:'sente',promoted:false},{type:'G',owner:'sente',promoted:false},{type:'S',owner:'sente',promoted:false},{type:'N',owner:'sente',promoted:false},{type:'L',owner:'sente',promoted:false}]
  ];

  function el(id) {
    return container.querySelector('#' + id);
  }

  function cloneBoard(b) {
    return b.map(r => r.map(p => p ? { ...p } : null));
  }

  function cloneHand(h) {
    return { ...h };
  }

  function inBounds(r, c) { return r >= 0 && r < 9 && c >= 0 && c < 9; }

  function isAlly(piece, owner) { return piece && piece.owner === owner; }
  function isEnemy(piece, owner) { return piece && piece.owner !== owner; }

  function opponent(o) { return o === 'sente' ? 'gote' : 'sente'; }

  // Direction is relative: "forward" for sente is up (row decreasing), for gote is down (row increasing)
  function fwd(owner) { return owner === 'sente' ? -1 : 1; }

  // ===== Movement =====

  function getPseudoMoves(b, r, c) {
    const piece = b[r][c];
    if (!piece) return [];
    const owner = piece.owner;
    const moves = [];
    const f = fwd(owner);

    const addIfValid = (nr, nc) => {
      if (!inBounds(nr, nc)) return false;
      if (isAlly(b[nr][nc], owner)) return false;
      moves.push([nr, nc]);
      return !b[nr][nc]; // continue sliding if empty
    };

    const slide = (dirs) => {
      for (const [dr, dc] of dirs) {
        for (let i = 1; i <= 8; i++) {
          if (!addIfValid(r + dr * i, c + dc * i)) break;
        }
      }
    };

    if (piece.promoted) {
      // Promoted pieces
      switch (piece.type) {
        case 'R': // Dragon = Rook + King
          slide([[0, 1], [0, -1], [1, 0], [-1, 0]]);
          for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]])
            addIfValid(r + dr, c + dc);
          break;
        case 'B': // Horse = Bishop + King
          slide([[-1, -1], [-1, 1], [1, -1], [1, 1]]);
          for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]])
            addIfValid(r + dr, c + dc);
          break;
        case 'S': case 'N': case 'L': case 'P': // Move as Gold
          goldMoves(r, c, f, addIfValid);
          break;
      }
    } else {
      switch (piece.type) {
        case 'K':
          for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]])
            addIfValid(r + dr, c + dc);
          break;
        case 'R':
          slide([[0, 1], [0, -1], [1, 0], [-1, 0]]);
          break;
        case 'B':
          slide([[-1, -1], [-1, 1], [1, -1], [1, 1]]);
          break;
        case 'G':
          goldMoves(r, c, f, addIfValid);
          break;
        case 'S':
          // Forward, diagonal-forward, diagonal-backward
          addIfValid(r + f, c);
          addIfValid(r + f, c - 1);
          addIfValid(r + f, c + 1);
          addIfValid(r - f, c - 1);
          addIfValid(r - f, c + 1);
          break;
        case 'N':
          // 2 forward + 1 sideways (only forward)
          addIfValid(r + 2 * f, c - 1);
          addIfValid(r + 2 * f, c + 1);
          break;
        case 'L':
          // Any number forward
          for (let i = 1; i <= 8; i++) {
            if (!addIfValid(r + f * i, c)) break;
          }
          break;
        case 'P':
          addIfValid(r + f, c);
          break;
      }
    }
    return moves;
  }

  function goldMoves(r, c, f, addIfValid) {
    // Forward, sideways, backward, diagonal-forward (not diagonal-backward)
    addIfValid(r + f, c);       // forward
    addIfValid(r + f, c - 1);   // diagonal-forward left
    addIfValid(r + f, c + 1);   // diagonal-forward right
    addIfValid(r, c - 1);       // left
    addIfValid(r, c + 1);       // right
    addIfValid(r - f, c);       // backward
  }

  // Get valid drop squares for a piece type
  function getDropMoves(b, owner, type, hSente, hGote) {
    const drops = [];
    const f = fwd(owner);

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (b[r][c] !== null) continue;

        // Pawn/Lance can't be dropped on last rank
        if (type === 'P' || type === 'L') {
          if (owner === 'sente' && r === 0) continue;
          if (owner === 'gote' && r === 8) continue;
        }
        // Knight can't be dropped on last 2 ranks
        if (type === 'N') {
          if (owner === 'sente' && r <= 1) continue;
          if (owner === 'gote' && r >= 7) continue;
        }
        // Two-pawn rule (nifu): no two unpromoted pawns in same column
        if (type === 'P') {
          let hasPawnInCol = false;
          for (let rr = 0; rr < 9; rr++) {
            const p = b[rr][c];
            if (p && p.type === 'P' && !p.promoted && p.owner === owner) {
              hasPawnInCol = true;
              break;
            }
          }
          if (hasPawnInCol) continue;

          // Pawn drop checkmate (uchifuzume) check
          const testBoard = cloneBoard(b);
          testBoard[r][c] = { type: 'P', owner, promoted: false };
          const opp = opponent(owner);
          if (isInCheck(testBoard, opp) && !hasAnyLegalMoveState(testBoard, opp, owner === 'sente' ? hSente : hSente, owner === 'gote' ? hGote : hGote)) {
            continue; // this would be pawn-drop checkmate
          }
        }

        drops.push([r, c]);
      }
    }
    return drops;
  }

  function findKing(b, owner) {
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (b[r][c] && b[r][c].type === 'K' && b[r][c].owner === owner)
          return [r, c];
    return null;
  }

  function isSquareAttacked(b, r, c, byOwner) {
    for (let i = 0; i < 9; i++)
      for (let j = 0; j < 9; j++)
        if (b[i][j] && b[i][j].owner === byOwner) {
          const moves = getPseudoMoves(b, i, j);
          if (moves.some(([mr, mc]) => mr === r && mc === c)) return true;
        }
    return false;
  }

  function isInCheck(b, owner) {
    const kp = findKing(b, owner);
    if (!kp) return false;
    return isSquareAttacked(b, kp[0], kp[1], opponent(owner));
  }

  function tryMove(b, fr, fc, tr, tc, promote) {
    const nb = cloneBoard(b);
    const piece = { ...nb[fr][fc] };
    if (promote) piece.promoted = true;
    nb[tr][tc] = piece;
    nb[fr][fc] = null;
    return isInCheck(nb, piece.owner) ? null : nb;
  }

  function tryDrop(b, r, c, owner, type) {
    const nb = cloneBoard(b);
    nb[r][c] = { type, owner, promoted: false };
    return isInCheck(nb, owner) ? null : nb;
  }

  function canPromote(piece, fr, tr) {
    if (!piece || piece.promoted || piece.type === 'K' || piece.type === 'G') return false;
    // Sente promotion zone: rows 0-2, Gote promotion zone: rows 6-8
    if (piece.owner === 'sente') return fr <= 2 || tr <= 2;
    return fr >= 6 || tr >= 6;
  }

  function mustPromote(piece, tr) {
    if (!piece || piece.promoted) return false;
    if (piece.type === 'P' || piece.type === 'L') {
      if (piece.owner === 'sente' && tr === 0) return true;
      if (piece.owner === 'gote' && tr === 8) return true;
    }
    if (piece.type === 'N') {
      if (piece.owner === 'sente' && tr <= 1) return true;
      if (piece.owner === 'gote' && tr >= 7) return true;
    }
    return false;
  }

  function getLegalMoves(r, c) {
    const piece = board[r][c];
    if (!piece) return [];
    const pseudo = getPseudoMoves(board, r, c);
    const legal = [];
    for (const [tr, tc] of pseudo) {
      // Try without promotion
      if (!mustPromote(piece, tr)) {
        if (tryMove(board, r, c, tr, tc, false) !== null) {
          legal.push([tr, tc, false]);
        }
      }
      // Try with promotion
      if (canPromote(piece, r, tr)) {
        if (tryMove(board, r, c, tr, tc, true) !== null) {
          legal.push([tr, tc, true]);
        }
      }
    }
    return legal;
  }

  function getLegalDrops(owner, type) {
    const drops = getDropMoves(board, owner, type, handSente, handGote);
    return drops.filter(([r, c]) => tryDrop(board, r, c, owner, type) !== null);
  }

  function hasAnyLegalMoveState(b, owner, hS, hG) {
    // Board moves
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (b[r][c] && b[r][c].owner === owner) {
          const pseudo = getPseudoMoves(b, r, c);
          for (const [tr, tc] of pseudo) {
            const p = b[r][c];
            if (!mustPromote(p, tr) && tryMove(b, r, c, tr, tc, false) !== null) return true;
            if (canPromote(p, r, tr) && tryMove(b, r, c, tr, tc, true) !== null) return true;
          }
        }
    // Drops
    const hand = owner === 'sente' ? hS : hG;
    for (const type of HAND_ORDER) {
      if ((hand[type] || 0) > 0) {
        const drops = getDropMoves(b, owner, type, hS, hG);
        for (const [r, c] of drops) {
          if (tryDrop(b, r, c, owner, type) !== null) return true;
        }
      }
    }
    return false;
  }

  function hasAnyLegalMove(owner) {
    return hasAnyLegalMoveState(board, owner, handSente, handGote);
  }

  // ===== AI Engine =====

  function evaluate(b, hS, hG) {
    let score = 0;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const p = b[r][c];
        if (!p) continue;
        let val = PIECE_VALUES[p.type] || 0;
        if (p.promoted && PROMOTED_BONUS[p.type]) val += PROMOTED_BONUS[p.type];
        // Positional: center control bonus
        const centerDist = Math.abs(r - 4) + Math.abs(c - 4);
        val += Math.max(0, (8 - centerDist) * 3);
        // King safety: prefer corners/edges for king
        if (p.type === 'K') {
          const homeRow = p.owner === 'sente' ? 8 : 0;
          val += Math.max(0, (4 - Math.abs(r - homeRow)) * 10);
        }
        if (p.owner === 'sente') score += val;
        else score -= val;
      }
    }
    // Hand pieces are valuable (flexible)
    for (const type of HAND_ORDER) {
      score += (hS[type] || 0) * (PIECE_VALUES[type] * 1.1);
      score -= (hG[type] || 0) * (PIECE_VALUES[type] * 1.1);
    }
    return score;
  }

  function getAllMovesForState(b, owner, hS, hG) {
    const moves = [];
    // Board moves
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const p = b[r][c];
        if (!p || p.owner !== owner) continue;
        const pseudo = getPseudoMoves(b, r, c);
        for (const [tr, tc] of pseudo) {
          if (canPromote(p, r, tr)) {
            if (tryMove(b, r, c, tr, tc, true) !== null) {
              moves.push({ type: 'move', fr: r, fc: c, tr, tc, promote: true });
            }
          }
          if (!mustPromote(p, tr)) {
            if (tryMove(b, r, c, tr, tc, false) !== null) {
              moves.push({ type: 'move', fr: r, fc: c, tr, tc, promote: false });
            }
          }
        }
      }
    }
    // Drops
    const hand = owner === 'sente' ? hS : hG;
    for (const pieceType of HAND_ORDER) {
      if ((hand[pieceType] || 0) > 0) {
        const drops = getDropMoves(b, owner, pieceType, hS, hG);
        for (const [r, c] of drops) {
          if (tryDrop(b, r, c, owner, pieceType) !== null) {
            moves.push({ type: 'drop', pieceType, r, c });
          }
        }
      }
    }
    return moves;
  }

  function simulateAction(b, hS, hG, action) {
    const nb = cloneBoard(b);
    const nhS = { ...hS };
    const nhG = { ...hG };

    if (action.type === 'move') {
      const piece = { ...nb[action.fr][action.fc] };
      const captured = nb[action.tr][action.tc];
      if (captured) {
        // Captured piece goes to hand, unpromoted
        const capType = captured.type;
        if (piece.owner === 'sente') nhS[capType] = (nhS[capType] || 0) + 1;
        else nhG[capType] = (nhG[capType] || 0) + 1;
      }
      if (action.promote) piece.promoted = true;
      nb[action.tr][action.tc] = piece;
      nb[action.fr][action.fc] = null;
    } else if (action.type === 'drop') {
      const owner = action.owner || (nhS[action.pieceType] > 0 ? 'sente' : 'gote');
      nb[action.r][action.c] = { type: action.pieceType, owner, promoted: false };
      if (owner === 'sente') nhS[action.pieceType]--;
      else nhG[action.pieceType]--;
    }

    return { board: nb, handSente: nhS, handGote: nhG };
  }

  function orderMoves(b, moves) {
    return moves.map(m => {
      let score = 0;
      if (m.type === 'move') {
        const target = b[m.tr][m.tc];
        if (target) score += 10 * (PIECE_VALUES[target.type] || 0);
        if (m.promote) score += 200;
      } else {
        score += 50; // drops are often good
      }
      return { action: m, score };
    }).sort((a, b) => b.score - a.score).map(x => x.action);
  }

  function minimax(b, hS, hG, depth, alpha, beta, maximizing) {
    const owner = maximizing ? 'sente' : 'gote';
    const moves = getAllMovesForState(b, owner, hS, hG);

    if (moves.length === 0) {
      if (isInCheck(b, owner)) return maximizing ? -99999 + (5 - depth) : 99999 - (5 - depth);
      return 0; // stalemate (rare in shogi)
    }
    if (depth === 0) return evaluate(b, hS, hG);

    const ordered = orderMoves(b, moves);

    if (maximizing) {
      let maxEval = -Infinity;
      for (const action of ordered) {
        const actWithOwner = { ...action };
        if (action.type === 'drop') actWithOwner.owner = 'sente';
        const state = simulateAction(b, hS, hG, actWithOwner);
        const ev = minimax(state.board, state.handSente, state.handGote, depth - 1, alpha, beta, false);
        maxEval = Math.max(maxEval, ev);
        alpha = Math.max(alpha, ev);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const action of ordered) {
        const actWithOwner = { ...action };
        if (action.type === 'drop') actWithOwner.owner = 'gote';
        const state = simulateAction(b, hS, hG, actWithOwner);
        const ev = minimax(state.board, state.handSente, state.handGote, depth - 1, alpha, beta, true);
        minEval = Math.min(minEval, ev);
        beta = Math.min(beta, ev);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }

  function getCpuMove() {
    const depthMap = { 'cpu-beginner': 1, 'cpu-easy': 1, 'cpu-medium': 2, 'cpu-hard': 3, 'cpu-expert': 4 };
    const depth = depthMap[gameMode] || 2;
    const currentOwner = turn;
    const maximizing = currentOwner === 'sente';
    const moves = getAllMovesForState(board, currentOwner, handSente, handGote);
    if (moves.length === 0) return null;

    // Add owner to drop actions
    const ownedMoves = moves.map(m => {
      if (m.type === 'drop') return { ...m, owner: currentOwner };
      return m;
    });

    if (gameMode === 'cpu-beginner') {
      // Mostly random
      if (Math.random() < 0.7) {
        return ownedMoves[Math.floor(Math.random() * ownedMoves.length)];
      }
      const scored = ownedMoves.map(action => {
        const state = simulateAction(board, handSente, handGote, action);
        return { action, score: evaluate(state.board, state.handSente, state.handGote) + (Math.random() - 0.5) * 500 };
      });
      scored.sort((a, b) => maximizing ? b.score - a.score : a.score - b.score);
      const topN = Math.min(5, scored.length);
      return scored[Math.floor(Math.random() * topN)].action;
    }

    if (gameMode === 'cpu-easy') {
      const scored = ownedMoves.map(action => {
        const state = simulateAction(board, handSente, handGote, action);
        return { action, score: evaluate(state.board, state.handSente, state.handGote) + (Math.random() - 0.5) * 300 };
      });
      scored.sort((a, b) => maximizing ? b.score - a.score : a.score - b.score);
      const topN = Math.min(3, scored.length);
      return scored[Math.floor(Math.random() * topN)].action;
    }

    const ordered = orderMoves(board, ownedMoves);
    let bestAction = ordered[0];
    let bestEval = maximizing ? -Infinity : Infinity;

    for (const action of ordered) {
      const state = simulateAction(board, handSente, handGote, action);
      const ev = minimax(state.board, state.handSente, state.handGote, depth - 1, -Infinity, Infinity, !maximizing);
      if (maximizing ? ev > bestEval : ev < bestEval) {
        bestEval = ev;
        bestAction = action;
      }
    }
    return bestAction;
  }

  function isCpuTurn() {
    return gameMode !== 'pvp' && turn === 'gote';
  }

  // ===== Timer =====

  function setMode(mode) {
    gameMode = mode;
    container.querySelectorAll('#shogi-mode-selector button').forEach(b => b.classList.remove('active'));
    el('shogi-btn-' + mode).classList.add('active');
    const timeSel = el('shogi-time-selector');
    if (mode === 'pvp') {
      timeSel.style.display = 'flex';
    } else {
      timeSel.style.display = 'none';
      timeMode = 'none';
    }
    resetGame();
  }

  function startGame() {
    gameStarted = true;
    el('shogi-start-btn').style.display = 'none';
    startTimer();
    updateTimerDisplay();
  }

  function setTimeMode(mode) {
    timeMode = mode;
    container.querySelectorAll('#shogi-time-selector button').forEach(b => b.classList.remove('active'));
    el('shogi-btn-time-' + mode).classList.add('active');
    resetGame();
  }

  function resetGame() {
    board = cloneBoard(INITIAL_BOARD);
    turn = 'sente';
    selected = null;
    selectedHand = null;
    history = [];
    handSente = {};
    handGote = {};
    gameOver = false;
    cpuThinking = false;
    stopTimer();
    timerStarted = false;
    senteByoyomi = false;
    goteByoyomi = false;
    initTimers();
    const startBtn = el('shogi-start-btn');
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
    const timersEl = el('shogi-timers');
    if (timeMode === 'none' || gameMode !== 'pvp') {
      timersEl.style.display = 'none';
      return;
    }
    timersEl.style.display = 'flex';
    if (timeMode === '30s') {
      senteTime = 30; goteTime = 30;
    } else if (timeMode === '60s') {
      senteTime = 60; goteTime = 60;
    } else if (timeMode === '5m15s') {
      senteTime = 300; goteTime = 300;
    }
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m.toString().padStart(2, '0') + ':' + s.toString().padStart(2, '0');
  }

  function updateTimerDisplay() {
    const timersEl = el('shogi-timers');
    if (timeMode === 'none' || gameMode !== 'pvp') {
      timersEl.style.display = 'none';
      return;
    }
    el('shogi-timer-sente-value').textContent = formatTime(senteTime);
    el('shogi-timer-gote-value').textContent = formatTime(goteTime);

    const sBox = el('shogi-timer-sente');
    const gBox = el('shogi-timer-gote');
    sBox.classList.toggle('active-timer', turn === 'sente' && !gameOver);
    gBox.classList.toggle('active-timer', turn === 'gote' && !gameOver);
    sBox.classList.toggle('low-time', senteTime <= 10 && senteTime > 0 && !gameOver);
    gBox.classList.toggle('low-time', goteTime <= 10 && goteTime > 0 && !gameOver);

    el('shogi-timer-sente-byoyomi').textContent = senteByoyomi ? '秒読み' : '';
    el('shogi-timer-gote-byoyomi').textContent = goteByoyomi ? '秒読み' : '';
  }

  function startTimer() {
    stopTimer();
    if (timeMode === 'none' || gameMode !== 'pvp' || gameOver) return;
    timerStarted = true;
    timerInterval = setInterval(() => {
      if (gameOver) { stopTimer(); return; }
      if (turn === 'sente') {
        senteTime--;
        if (senteTime <= 0) {
          if (timeMode === '5m15s' && !senteByoyomi) {
            senteByoyomi = true;
            senteTime = 15;
          } else {
            senteTime = 0;
            stopTimer();
            gameOver = true;
            const statusEl = el('shogi-status');
            statusEl.textContent = '時間切れ！ 後手の勝ち！';
            statusEl.style.background = '#8b0000';
          }
        }
      } else {
        goteTime--;
        if (goteTime <= 0) {
          if (timeMode === '5m15s' && !goteByoyomi) {
            goteByoyomi = true;
            goteTime = 15;
          } else {
            goteTime = 0;
            stopTimer();
            gameOver = true;
            const statusEl = el('shogi-status');
            statusEl.textContent = '時間切れ！ 先手の勝ち！';
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
      if (turn === 'sente') senteTime = 30; else goteTime = 30;
    } else if (timeMode === '60s') {
      if (turn === 'sente') senteTime = 60; else goteTime = 60;
    } else if (timeMode === '5m15s') {
      const justMoved = turn === 'sente' ? 'gote' : 'sente';
      if (justMoved === 'sente' && senteByoyomi) senteTime = 15;
      if (justMoved === 'gote' && goteByoyomi) goteTime = 15;
    }
    startTimer();
    updateTimerDisplay();
  }

  // ===== Promotion Dialog =====

  function showPromotionDialog() {
    return new Promise(resolve => {
      const overlay = el('shogi-promotion-overlay');
      const choices = el('shogi-promotion-choices');
      choices.innerHTML = '';
      const yesBtn = document.createElement('button');
      yesBtn.className = 'promo-btn';
      yesBtn.textContent = '成る';
      yesBtn.onclick = () => { overlay.classList.remove('active'); resolve(true); };
      const noBtn = document.createElement('button');
      noBtn.className = 'promo-btn';
      noBtn.textContent = '成らない';
      noBtn.onclick = () => { overlay.classList.remove('active'); resolve(false); };
      choices.appendChild(yesBtn);
      choices.appendChild(noBtn);
      overlay.classList.add('active');
    });
  }

  // ===== Game Actions =====

  async function makeMove(fr, fc, tr, tc, promote, isCpu) {
    const piece = board[fr][fc];
    const owner = piece.owner;

    const histEntry = {
      board: cloneBoard(board),
      turn,
      handSente: { ...handSente },
      handGote: { ...handGote },
      lastAction: null
    };

    const captured = board[tr][tc];
    if (captured) {
      // Add to hand (unpromoted, as own piece)
      const capType = captured.type;
      if (owner === 'sente') handSente[capType] = (handSente[capType] || 0) + 1;
      else handGote[capType] = (handGote[capType] || 0) + 1;
    }

    // Determine promotion
    let doPromote = promote;
    if (!isCpu && !promote && canPromote(piece, fr, tr) && !mustPromote(piece, tr)) {
      doPromote = await showPromotionDialog();
    } else if (mustPromote(piece, tr)) {
      doPromote = true;
    }

    const movedPiece = { ...piece };
    if (doPromote) movedPiece.promoted = true;
    board[tr][tc] = movedPiece;
    board[fr][fc] = null;

    histEntry.lastAction = { type: 'move', fr, fc, tr, tc, wasCapture: !!captured };
    history.push(histEntry);
    turn = opponent(turn);
    selected = null;
    selectedHand = null;
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

  async function makeDrop(r, c, owner, type) {
    const histEntry = {
      board: cloneBoard(board),
      turn,
      handSente: { ...handSente },
      handGote: { ...handGote },
      lastAction: null
    };

    board[r][c] = { type, owner, promoted: false };
    if (owner === 'sente') handSente[type]--;
    else handGote[type]--;

    histEntry.lastAction = { type: 'drop', r, c, pieceType: type, wasCapture: false };
    history.push(histEntry);
    turn = opponent(turn);
    selected = null;
    selectedHand = null;
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
      const action = getCpuMove();
      cpuThinking = false;
      if (action) {
        if (action.type === 'move') {
          makeMove(action.fr, action.fc, action.tr, action.tc, action.promote, true);
        } else {
          makeDrop(action.r, action.c, turn, action.pieceType);
        }
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
      handSente = h.handSente;
      handGote = h.handGote;
    } else {
      const h = history.pop();
      board = h.board;
      turn = h.turn;
      handSente = h.handSente;
      handGote = h.handGote;
    }
    selected = null;
    selectedHand = null;
    render();
    updateStatus();
  }

  function updateStatus() {
    const statusEl = el('shogi-status');
    const inCheck = isInCheck(board, turn);
    const hasMove = hasAnyLegalMove(turn);
    const name = turn === 'sente' ? '▲先手' : '△後手';

    if (cpuThinking) {
      statusEl.innerHTML = '<span class="shogi-thinking-indicator">CPU思考中...</span>';
      statusEl.style.background = '#2a1a4a';
      return;
    }

    if (!hasMove) {
      gameOver = true;
      stopTimer();
      updateTimerDisplay();
      if (inCheck) {
        statusEl.textContent = '詰み！ ' + (turn === 'sente' ? '△後手' : '▲先手') + 'の勝ち！';
        statusEl.style.background = '#8b0000';
      } else {
        statusEl.textContent = '千日手（引き分け）';
        statusEl.style.background = '#555';
      }
    } else if (inCheck) {
      statusEl.textContent = name + 'の番です（王手！）';
      statusEl.style.background = '#8b4513';
    } else {
      statusEl.textContent = name + 'の番です';
      statusEl.style.background = '#16213e';
    }
  }

  // ===== Click Handling =====

  async function handleBoardClick(r, c) {
    if (gameOver || cpuThinking || !gameStarted) return;
    if (isCpuTurn()) return;

    // If we have a hand piece selected, try to drop it
    if (selectedHand) {
      const drops = getLegalDrops(selectedHand.owner, selectedHand.piece);
      if (drops.some(([dr, dc]) => dr === r && dc === c)) {
        await makeDrop(r, c, selectedHand.owner, selectedHand.piece);
        return;
      }
      selectedHand = null;
      selected = null;
      render();
      return;
    }

    // If we have a board piece selected, try to move it
    if (selected) {
      const legal = getLegalMoves(selected[0], selected[1]);
      const matchingMoves = legal.filter(([mr, mc]) => mr === r && mc === c);
      if (matchingMoves.length > 0) {
        const piece = board[selected[0]][selected[1]];
        const hasPromoteOption = matchingMoves.some(([,,p]) => p);
        const hasNonPromoteOption = matchingMoves.some(([,,p]) => !p);

        if (mustPromote(piece, r)) {
          await makeMove(selected[0], selected[1], r, c, true, false);
        } else if (hasPromoteOption && hasNonPromoteOption) {
          // Ask user
          await makeMove(selected[0], selected[1], r, c, false, false); // will trigger dialog internally
        } else if (hasPromoteOption) {
          await makeMove(selected[0], selected[1], r, c, true, false);
        } else {
          await makeMove(selected[0], selected[1], r, c, false, false);
        }
        return;
      }
    }

    // Select a piece
    if (board[r][c] && board[r][c].owner === turn) {
      selected = [r, c];
      selectedHand = null;
    } else {
      selected = null;
    }
    render();
  }

  function handleHandClick(owner, type) {
    if (gameOver || cpuThinking || !gameStarted) return;
    if (isCpuTurn()) return;
    if (owner !== turn) return;

    const hand = owner === 'sente' ? handSente : handGote;
    if ((hand[type] || 0) <= 0) return;

    selectedHand = { owner, piece: type };
    selected = null;
    render();
  }

  // ===== Rendering =====

  function render() {
    const boardEl = el('shogi-board');
    boardEl.innerHTML = '';
    const lastAction = history.length > 0 ? history[history.length - 1].lastAction : null;
    const inCheck = isInCheck(board, turn);
    const kingPos = findKing(board, turn);

    // Compute legal targets for highlighting
    let legalTargets = [];
    if (selected) {
      legalTargets = getLegalMoves(selected[0], selected[1]).map(([r, c]) => [r, c]);
    } else if (selectedHand) {
      legalTargets = getLegalDrops(selectedHand.owner, selectedHand.piece);
    }

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const sq = document.createElement('div');
        sq.className = 'shogi-square ' + ((r + c) % 2 === 0 ? 'shogi-light' : 'shogi-dark');
        if (cpuThinking) sq.classList.add('shogi-thinking');

        // Last move highlight
        if (lastAction) {
          if (lastAction.type === 'move') {
            if ((r === lastAction.fr && c === lastAction.fc) || (r === lastAction.tr && c === lastAction.tc))
              sq.classList.add('shogi-last-move');
          } else if (lastAction.type === 'drop') {
            if (r === lastAction.r && c === lastAction.c)
              sq.classList.add('shogi-last-move');
          }
        }

        if (selected && selected[0] === r && selected[1] === c)
          sq.classList.add('shogi-selected');

        if (inCheck && kingPos && kingPos[0] === r && kingPos[1] === c)
          sq.classList.add('shogi-check');

        if (legalTargets.some(([mr, mc]) => mr === r && mc === c)) {
          sq.classList.add(board[r][c] ? 'shogi-legal-capture' : 'shogi-legal-move');
        }

        if (board[r][c]) {
          const p = document.createElement('span');
          p.className = 'shogi-piece';
          if (board[r][c].owner === 'gote') p.classList.add('shogi-gote-piece');
          if (board[r][c].promoted) p.classList.add('shogi-promoted');
          p.textContent = getKanji(board[r][c]);

          if (animateNextRender && lastAction) {
            if (lastAction.type === 'move' && r === lastAction.tr && c === lastAction.tc) {
              const dr = lastAction.fr - lastAction.tr;
              const dc = lastAction.fc - lastAction.tc;
              p.style.setProperty('--dx', (dc * 64) + 'px');
              p.style.setProperty('--dy', (dr * 64) + 'px');
              p.classList.add(lastAction.wasCapture ? 'shogi-capture-anim' : 'shogi-move-anim');
              if (lastAction.wasCapture) sq.classList.add('shogi-capture-flash');
            } else if (lastAction.type === 'drop' && r === lastAction.r && c === lastAction.c) {
              p.classList.add('shogi-drop-anim');
            }
          }
          if (animateNextRender && inCheck && kingPos && kingPos[0] === r && kingPos[1] === c) {
            sq.classList.add('shogi-check-anim');
          }

          sq.appendChild(p);
        }

        sq.onclick = () => handleBoardClick(r, c);
        boardEl.appendChild(sq);
      }
    }

    // Coordinates
    const colCoord = el('shogi-coords-col');
    colCoord.innerHTML = '一二三四五六七八九'.split('').map(n => '<span>' + n + '</span>').join('');
    const rowCoord = el('shogi-coords-row');
    rowCoord.innerHTML = '987654321'.split('').map(n => '<span style="width:64px;display:inline-block;text-align:center">' + n + '</span>').join('');

    // Hand pieces
    renderHand('gote');
    renderHand('sente');

    animateNextRender = false;
  }

  function renderHand(owner) {
    const handEl = el('shogi-hand-' + owner);
    handEl.innerHTML = '';
    const hand = owner === 'sente' ? handSente : handGote;
    const label = document.createElement('span');
    label.className = 'shogi-hand-label';
    label.textContent = owner === 'sente' ? '▲先手 持ち駒:' : '△後手 持ち駒:';
    handEl.appendChild(label);

    let hasAny = false;
    for (const type of HAND_ORDER) {
      const count = hand[type] || 0;
      if (count > 0) {
        hasAny = true;
        const pieceEl = document.createElement('span');
        pieceEl.className = 'shogi-hand-piece';
        if (selectedHand && selectedHand.owner === owner && selectedHand.piece === type) {
          pieceEl.classList.add('shogi-hand-selected');
        }
        pieceEl.textContent = getHandKanji(type) + (count > 1 ? '×' + count : '');
        pieceEl.onclick = () => handleHandClick(owner, type);
        handEl.appendChild(pieceEl);
      }
    }
    if (!hasAny) {
      const none = document.createElement('span');
      none.className = 'shogi-hand-empty';
      none.textContent = 'なし';
      handEl.appendChild(none);
    }
  }

  // ===== HTML & CSS =====

  function buildHTML() {
    container.innerHTML = `
      <div id="shogi-controls" style="margin-bottom:12px;max-width:620px;">
        <div id="shogi-mode-selector" style="margin-bottom:8px;display:flex;justify-content:center;gap:6px;flex-wrap:wrap;">
          <div style="width:100%;display:flex;justify-content:center;margin-bottom:4px;">
            <button id="shogi-btn-pvp">👥 対人戦</button>
          </div>
          <button id="shogi-btn-cpu-beginner">入門</button>
          <button id="shogi-btn-cpu-easy">初級</button>
          <button id="shogi-btn-cpu-medium">中級</button>
          <button id="shogi-btn-cpu-hard">上級</button>
          <button id="shogi-btn-cpu-expert">最強</button>
        </div>
        <div id="shogi-time-selector" style="margin-bottom:8px;display:none;justify-content:center;gap:6px;flex-wrap:wrap;">
          <button id="shogi-btn-time-none">制限なし</button>
          <button id="shogi-btn-time-30s">30秒</button>
          <button id="shogi-btn-time-60s">60秒</button>
          <button id="shogi-btn-time-5m15s">5分+15秒</button>
        </div>
      </div>
      <div id="shogi-timers" style="display:none;justify-content:center;gap:20px;margin-bottom:8px;font-size:1.1rem;font-family:'Consolas','Courier New',monospace;">
        <div class="shogi-timer-box shogi-sente-timer" id="shogi-timer-sente">
          <div class="shogi-timer-label">▲先手</div>
          <div class="shogi-timer-value" id="shogi-timer-sente-value">--:--</div>
          <div class="shogi-timer-byoyomi" id="shogi-timer-sente-byoyomi"></div>
        </div>
        <div class="shogi-timer-box shogi-gote-timer" id="shogi-timer-gote">
          <div class="shogi-timer-label">△後手</div>
          <div class="shogi-timer-value" id="shogi-timer-gote-value">--:--</div>
          <div class="shogi-timer-byoyomi" id="shogi-timer-gote-byoyomi"></div>
        </div>
      </div>
      <button id="shogi-start-btn" style="display:none;margin:0 auto 8px;padding:8px 36px;font-size:1rem;background:#2e7d32;color:#fff;border:none;border-radius:8px;cursor:pointer;letter-spacing:2px;transition:background 0.2s;">▶ 開始</button>
      <div id="shogi-status" style="font-size:1.05rem;margin-bottom:8px;padding:6px 16px;background:#16213e;border-radius:8px;display:inline-block;">▲先手の番です</div>
      <div id="shogi-hand-gote" class="shogi-hand-area shogi-hand-gote-area"></div>
      <div class="shogi-board-wrapper" style="position:relative;display:inline-block;">
        <div class="shogi-coords-row" id="shogi-coords-row" style="display:flex;justify-content:space-around;font-size:0.75rem;color:#888;margin-bottom:4px;"></div>
        <div id="shogi-board" style="display:grid;grid-template-columns:repeat(9,64px);grid-template-rows:repeat(9,64px);border:3px solid #8b6914;border-radius:4px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.5);"></div>
        <div class="shogi-coords-col" id="shogi-coords-col" style="display:flex;justify-content:space-around;font-size:0.75rem;color:#888;margin-top:4px;"></div>
      </div>
      <div id="shogi-hand-sente" class="shogi-hand-area shogi-hand-sente-area"></div>
      <div class="shogi-buttons" style="margin-top:10px;">
        <button id="shogi-undo-btn">↩ 戻す</button>
        <button id="shogi-reset-btn">♻ 新規</button>
      </div>
      <div id="shogi-promotion-overlay" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:100;justify-content:center;align-items:center;">
        <div id="shogi-promotion-choices" style="background:#16213e;padding:24px 32px;border-radius:12px;display:flex;gap:16px;box-shadow:0 8px 32px rgba(0,0,0,0.5);flex-direction:column;align-items:center;">
          <div style="color:#e0e0e0;font-size:1.1rem;margin-bottom:4px;">成りますか？</div>
        </div>
      </div>
    `;
  }

  function injectCSS() {
    if (document.getElementById('shogi-game-styles')) return;
    const style = document.createElement('style');
    style.id = 'shogi-game-styles';
    style.textContent = `
      #shogi-board {
        display: grid;
        grid-template-columns: repeat(9, 64px);
        grid-template-rows: repeat(9, 64px);
      }
      .shogi-square {
        width: 64px; height: 64px; display: flex; justify-content: center; align-items: center;
        cursor: pointer; user-select: none; position: relative;
        transition: background 0.15s;
        border: 0.5px solid rgba(0,0,0,0.15);
      }
      .shogi-light { background: #dcb35c; }
      .shogi-dark { background: #c9a84c; }
      .shogi-square.shogi-selected { background: #f6e47a !important; }
      .shogi-square.shogi-legal-move::after {
        content: ''; position: absolute; width: 18px; height: 18px;
        background: rgba(0,0,0,0.25); border-radius: 50%;
      }
      .shogi-square.shogi-legal-capture::after {
        content: ''; position: absolute; width: 54px; height: 54px;
        border: 4px solid rgba(0,0,0,0.25); border-radius: 50%;
        background: transparent;
      }
      .shogi-square.shogi-last-move { background: rgba(155, 199, 0, 0.41) !important; }
      .shogi-square.shogi-check { box-shadow: inset 0 0 16px 4px rgba(255,0,0,0.6); }
      .shogi-square.shogi-thinking { pointer-events: none; }
      .shogi-piece {
        z-index: 1; line-height: 1; font-size: 28px;
        font-family: 'Yu Mincho', 'Hiragino Mincho ProN', 'MS Mincho', serif;
        color: #1a1a1a;
        filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.3));
        position: relative;
        font-weight: bold;
      }
      .shogi-piece.shogi-gote-piece {
        transform: rotate(180deg);
      }
      .shogi-piece.shogi-promoted {
        color: #c00;
      }
      .shogi-piece.shogi-move-anim {
        animation: shogiPieceSlide 0.3s ease-out forwards;
      }
      @keyframes shogiPieceSlide {
        from { transform: translate(var(--dx), var(--dy)) scale(1.1); }
        to { transform: translate(0, 0) scale(1); }
      }
      .shogi-piece.shogi-gote-piece.shogi-move-anim {
        animation: shogiPieceSlideGote 0.3s ease-out forwards;
      }
      @keyframes shogiPieceSlideGote {
        from { transform: translate(var(--dx), var(--dy)) rotate(180deg) scale(1.1); }
        to { transform: translate(0, 0) rotate(180deg) scale(1); }
      }
      .shogi-piece.shogi-capture-anim {
        animation: shogiPieceCapture 0.35s ease-out forwards;
      }
      @keyframes shogiPieceCapture {
        0% { transform: translate(var(--dx), var(--dy)) scale(1.15); }
        50% { transform: translate(0, 0) scale(1.2); filter: drop-shadow(0 0 10px rgba(255,200,0,0.8)); }
        100% { transform: translate(0, 0) scale(1); }
      }
      .shogi-piece.shogi-gote-piece.shogi-capture-anim {
        animation: shogiPieceCaptureGote 0.35s ease-out forwards;
      }
      @keyframes shogiPieceCaptureGote {
        0% { transform: translate(var(--dx), var(--dy)) rotate(180deg) scale(1.15); }
        50% { transform: translate(0, 0) rotate(180deg) scale(1.2); filter: drop-shadow(0 0 10px rgba(255,200,0,0.8)); }
        100% { transform: translate(0, 0) rotate(180deg) scale(1); }
      }
      .shogi-piece.shogi-drop-anim {
        animation: shogiPieceDrop 0.3s ease-out forwards;
      }
      @keyframes shogiPieceDrop {
        0% { transform: scale(0.3); opacity: 0.3; }
        100% { transform: scale(1); opacity: 1; }
      }
      .shogi-piece.shogi-gote-piece.shogi-drop-anim {
        animation: shogiPieceDropGote 0.3s ease-out forwards;
      }
      @keyframes shogiPieceDropGote {
        0% { transform: rotate(180deg) scale(0.3); opacity: 0.3; }
        100% { transform: rotate(180deg) scale(1); opacity: 1; }
      }
      .shogi-square.shogi-capture-flash {
        animation: shogiCaptureFlash 0.4s ease-out;
      }
      @keyframes shogiCaptureFlash {
        0% { box-shadow: inset 0 0 0 0 rgba(255,150,0,0); }
        30% { box-shadow: inset 0 0 20px 8px rgba(255,150,0,0.5); }
        100% { box-shadow: none; }
      }
      .shogi-square.shogi-check-anim {
        animation: shogiCheckPulse 0.6s ease-in-out;
      }
      @keyframes shogiCheckPulse {
        0% { box-shadow: inset 0 0 0 0 rgba(255,0,0,0); }
        30% { box-shadow: inset 0 0 24px 8px rgba(255,0,0,0.7); }
        60% { box-shadow: inset 0 0 12px 4px rgba(255,0,0,0.4); }
        100% { box-shadow: inset 0 0 16px 4px rgba(255,0,0,0.6); }
      }
      /* Hand pieces area */
      .shogi-hand-area {
        display: flex; align-items: center; gap: 6px; padding: 8px 12px;
        background: #2a1f0e; border-radius: 8px; margin: 6px 0;
        min-height: 40px; flex-wrap: wrap; max-width: 576px;
        border: 1px solid #8b6914;
      }
      .shogi-hand-label {
        font-size: 0.8rem; color: #c9a84c; margin-right: 4px; white-space: nowrap;
      }
      .shogi-hand-piece {
        font-size: 22px; cursor: pointer; padding: 4px 8px; border-radius: 6px;
        font-family: 'Yu Mincho', 'Hiragino Mincho ProN', 'MS Mincho', serif;
        color: #1a1a1a; background: #dcb35c;
        transition: all 0.2s; font-weight: bold;
        user-select: none;
      }
      .shogi-hand-piece:hover { background: #f6e47a; }
      .shogi-hand-piece.shogi-hand-selected {
        background: #f6e47a; box-shadow: 0 0 8px 2px rgba(246,228,122,0.8);
      }
      .shogi-hand-empty {
        font-size: 0.8rem; color: #888; font-style: italic;
      }
      /* Mode buttons */
      #shogi-mode-selector button {
        padding: 5px 12px; font-size: 0.85rem;
        background: #0f3460; color: #e0e0e0; border: 2px solid transparent; border-radius: 6px;
        cursor: pointer; transition: all 0.2s;
      }
      #shogi-mode-selector button:hover { background: #1a4a8a; }
      #shogi-mode-selector button.active { border-color: #f6e47a; background: #1a4a8a; }
      #shogi-time-selector button {
        padding: 4px 10px; font-size: 0.8rem;
        background: #1a3a5c; color: #e0e0e0; border: 2px solid transparent; border-radius: 6px;
        cursor: pointer; transition: all 0.2s;
      }
      #shogi-time-selector button:hover { background: #1a4a8a; }
      #shogi-time-selector button.active { border-color: #f6e47a; background: #1a4a8a; }
      .shogi-timer-box {
        padding: 6px 16px; border-radius: 8px; min-width: 120px; text-align: center;
      }
      .shogi-sente-timer { background: #ddd; color: #222; }
      .shogi-gote-timer { background: #333; color: #eee; }
      .shogi-timer-box.active-timer { box-shadow: 0 0 8px 2px rgba(246,228,122,0.6); }
      .shogi-timer-box.low-time { animation: shogiTimerWarn 0.5s infinite; }
      @keyframes shogiTimerWarn {
        0%,100% { box-shadow: 0 0 8px 2px rgba(255,0,0,0.6); }
        50% { box-shadow: 0 0 16px 4px rgba(255,0,0,0.9); }
      }
      .shogi-timer-label { font-size: 0.7rem; opacity: 0.7; }
      .shogi-timer-value { font-size: 1.3rem; font-weight: bold; }
      .shogi-timer-byoyomi { font-size: 0.65rem; color: #f6e47a; }
      .shogi-buttons button {
        padding: 7px 18px; margin: 0 5px; font-size: 0.9rem;
        background: #0f3460; color: #e0e0e0; border: none; border-radius: 6px;
        cursor: pointer; transition: background 0.2s;
      }
      .shogi-buttons button:hover { background: #1a4a8a; }
      #shogi-promotion-overlay.active { display: flex !important; }
      .promo-btn {
        font-size: 1.1rem; cursor: pointer; padding: 10px 28px; border-radius: 8px;
        border: 2px solid #dcb35c; background: #0f3460; color: #e0e0e0;
        transition: all 0.2s; font-family: inherit;
      }
      .promo-btn:hover { background: #1a4a8a; border-color: #f6e47a; }
      #shogi-start-btn:hover { background: #388e3c; }
      @keyframes shogi-thinking-pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
      .shogi-thinking-indicator { animation: shogi-thinking-pulse 1s infinite; }
    `;
    document.head.appendChild(style);
  }

  function bindEvents() {
    el('shogi-btn-pvp').onclick = () => setMode('pvp');
    el('shogi-btn-cpu-beginner').onclick = () => setMode('cpu-beginner');
    el('shogi-btn-cpu-easy').onclick = () => setMode('cpu-easy');
    el('shogi-btn-cpu-medium').onclick = () => setMode('cpu-medium');
    el('shogi-btn-cpu-hard').onclick = () => setMode('cpu-hard');
    el('shogi-btn-cpu-expert').onclick = () => setMode('cpu-expert');
    el('shogi-btn-time-none').onclick = () => setTimeMode('none');
    el('shogi-btn-time-30s').onclick = () => setTimeMode('30s');
    el('shogi-btn-time-60s').onclick = () => setTimeMode('60s');
    el('shogi-btn-time-5m15s').onclick = () => setTimeMode('5m15s');
    el('shogi-start-btn').onclick = () => startGame();
    el('shogi-undo-btn').onclick = () => undoMove();
    el('shogi-reset-btn').onclick = () => resetGame();
  }

  return {
    init(containerEl) {
      container = containerEl;
      injectCSS();
      buildHTML();
      bindEvents();
      el('shogi-btn-time-none').classList.add('active');
      setMode('cpu-medium');
    },
    destroy() {
      stopTimer();
      if (container) {
        container.innerHTML = '';
      }
      const styleEl = document.getElementById('shogi-game-styles');
      if (styleEl) {
        styleEl.remove();
      }
      container = null;
    }
  };
})();
