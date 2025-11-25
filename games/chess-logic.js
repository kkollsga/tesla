// Chess piece Unicode characters (filled/solid pieces)
const PIECES = {
    king: '♚',
    queen: '♛',
    rook: '♜',
    bishop: '♝',
    knight: '♞',
    pawn: '♟'
};

// Game state
let gameState = {
    board: [],
    currentPlayer: 'white',
    player1Color: 'white',
    player2Color: 'black',
    gameStarted: false,
    gameOver: false,
    winner: null,
    selectedPiece: null,
    enPassantTarget: null,
    castlingRights: {
        white: { kingside: true, queenside: true },
        black: { kingside: true, queenside: true }
    },
    kingMoved: { white: false, black: false },
    rookMoved: {
        white: { kingside: false, queenside: false },
        black: { kingside: false, queenside: false }
    },
    timeControl: null,
    timers: {
        player1: null,
        player2: null
    },
    timerIntervals: {
        player1: null,
        player2: null
    }
};

let dragState = {
    isDragging: false,
    dragClone: null,
    dragOffsetX: 0,
    dragOffsetY: 0,
    originalPiece: null,
    validMoves: [], // Cache valid moves when drag starts
    currentHighlightedCell: null, // Track currently highlighted cell
    rafId: null // RequestAnimationFrame ID for throttling
};

let dragAndDropInitialized = false;

// Initialize game
function initGame() {
    // Randomly assign colors
    if (Math.random() < 0.5) {
        gameState.player1Color = 'black';
        gameState.player2Color = 'white';
    } else {
        gameState.player1Color = 'white';
        gameState.player2Color = 'black';
    }

    document.getElementById('player-1-color').textContent = gameState.player1Color.toUpperCase();
    document.getElementById('player-2-color').textContent = gameState.player2Color.toUpperCase();

    // Rotate board based on which player is white (white should be on their side)
    const gridContainer = document.getElementById('grid-container');
    const gameBoard = document.querySelector('.game-board');
    if (gameState.player1Color === 'white') {
        // Player 1 (left) is white - rotate 90deg
        gridContainer.style.transform = 'rotate(90deg)';
        gameBoard.classList.remove('flipped');
    } else {
        // Player 2 (right) is white - rotate 270deg (or -90deg) to flip
        gridContainer.style.transform = 'rotate(270deg)';
        gameBoard.classList.add('flipped');
    }

    // Reset game state
    gameState.currentPlayer = 'white';
    gameState.gameStarted = false;
    gameState.gameOver = false;
    gameState.winner = null;
    gameState.selectedPiece = null;
    gameState.enPassantTarget = null;
    gameState.castlingRights = {
        white: { kingside: true, queenside: true },
        black: { kingside: true, queenside: true }
    };
    gameState.kingMoved = { white: false, black: false };
    gameState.rookMoved = {
        white: { kingside: false, queenside: false },
        black: { kingside: false, queenside: false }
    };

    // Clear timers
    clearInterval(gameState.timerIntervals.player1);
    clearInterval(gameState.timerIntervals.player2);
    gameState.timerIntervals = { player1: null, player2: null };

    // Reset timer display
    document.getElementById('player-1-timer').textContent = '--:--';
    document.getElementById('player-2-timer').textContent = '--:--';

    // Initialize board
    setupBoard();
    renderBoard();
    updatePlayerStatus();

    // Set up drag and drop (only once on first load)
    if (!dragAndDropInitialized) {
        setupDragAndDrop();
        dragAndDropInitialized = true;
    }

    // Enable timer selection
    document.getElementById('time-control-selector').classList.remove('active');
    document.getElementById('time-control-selector').style.cursor = 'pointer';

    // Disable resign buttons
    document.getElementById('player-1-resign').disabled = true;
    document.getElementById('player-2-resign').disabled = true;
}

// Setup initial board
function setupBoard() {
    gameState.board = Array(8).fill(null).map(() => Array(8).fill(null));

    // Setup pawns
    for (let col = 0; col < 8; col++) {
        gameState.board[1][col] = { type: 'pawn', color: 'black' };
        gameState.board[6][col] = { type: 'pawn', color: 'white' };
    }

    // Setup black pieces
    gameState.board[0][0] = { type: 'rook', color: 'black' };
    gameState.board[0][1] = { type: 'knight', color: 'black' };
    gameState.board[0][2] = { type: 'bishop', color: 'black' };
    gameState.board[0][3] = { type: 'queen', color: 'black' };
    gameState.board[0][4] = { type: 'king', color: 'black' };
    gameState.board[0][5] = { type: 'bishop', color: 'black' };
    gameState.board[0][6] = { type: 'knight', color: 'black' };
    gameState.board[0][7] = { type: 'rook', color: 'black' };

    // Setup white pieces
    gameState.board[7][0] = { type: 'rook', color: 'white' };
    gameState.board[7][1] = { type: 'knight', color: 'white' };
    gameState.board[7][2] = { type: 'bishop', color: 'white' };
    gameState.board[7][3] = { type: 'queen', color: 'white' };
    gameState.board[7][4] = { type: 'king', color: 'white' };
    gameState.board[7][5] = { type: 'bishop', color: 'white' };
    gameState.board[7][6] = { type: 'knight', color: 'white' };
    gameState.board[7][7] = { type: 'rook', color: 'white' };
}

// Render board
function renderBoard() {
    const gridContainer = document.getElementById('grid-container');
    gridContainer.innerHTML = '';

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.classList.add((row + col) % 2 === 0 ? 'light' : 'dark');
            cell.dataset.row = row;
            cell.dataset.col = col;
            cell.addEventListener('click', () => handleCellClick(row, col));

            const piece = gameState.board[row][col];
            if (piece) {
                const pieceEl = createPiece(piece.type, piece.color, row, col);
                cell.appendChild(pieceEl);
            }

            gridContainer.appendChild(cell);
        }
    }

    // Highlight king in check
    if (isInCheck(gameState.currentPlayer)) {
        const kingPos = findKing(gameState.currentPlayer);
        if (kingPos) {
            const cell = gridContainer.querySelector(`[data-row="${kingPos.row}"][data-col="${kingPos.col}"]`);
            if (cell) cell.classList.add('check');
        }
    }
}

// Create piece element
function createPiece(type, color, row, col) {
    const piece = document.createElement('div');
    piece.className = 'piece';
    piece.textContent = PIECES[type];
    piece.dataset.type = type;
    piece.dataset.color = color;
    piece.dataset.row = row;
    piece.dataset.col = col;

    // Add color class
    piece.classList.add(color);

    if (color !== gameState.currentPlayer || gameState.gameOver) {
        piece.classList.add('inactive');
    }

    return piece;
}

// Setup drag and drop
function setupDragAndDrop() {
    const gridContainer = document.getElementById('grid-container');

    gridContainer.addEventListener('mousedown', handleDragStart);
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);

    gridContainer.addEventListener('touchstart', handleDragStart, { passive: false });
    document.addEventListener('touchmove', handleDragMove, { passive: false });
    document.addEventListener('touchend', handleDragEnd);
}

// Handle drag start
function handleDragStart(e) {
    if (gameState.gameOver) return;

    const touch = e.type.startsWith('touch') ? e.touches[0] : e;
    const target = e.type.startsWith('touch') ?
        document.elementFromPoint(touch.clientX, touch.clientY) : e.target;

    const piece = target.closest('.piece');
    if (!piece || piece.classList.contains('inactive')) return;

    const pieceColor = piece.dataset.color;
    if (pieceColor !== gameState.currentPlayer) return;

    e.preventDefault();

    const rect = piece.getBoundingClientRect();
    dragState.dragOffsetX = touch.clientX - rect.left;
    dragState.dragOffsetY = touch.clientY - rect.top;
    dragState.isDragging = true;
    dragState.originalPiece = piece;

    // Pre-calculate valid moves for performance
    const fromRow = parseInt(piece.dataset.row);
    const fromCol = parseInt(piece.dataset.col);
    const pieceData = gameState.board[fromRow][fromCol];
    dragState.validMoves = pieceData ? getValidMoves(fromRow, fromCol, pieceData) : [];
    dragState.currentHighlightedCell = null;

    createDragClone(piece, touch.clientX, touch.clientY);
    piece.classList.add('piece-ghost');
}

// Create drag clone
function createDragClone(originalPiece, x, y) {
    const clone = originalPiece.cloneNode(true);
    const rect = originalPiece.getBoundingClientRect();

    clone.style.position = 'fixed';
    clone.style.zIndex = '1000';
    clone.style.pointerEvents = 'none';
    clone.style.width = rect.width + 'px';
    clone.style.height = rect.height + 'px';
    clone.style.left = (x - dragState.dragOffsetX) + 'px';
    clone.style.top = (y - dragState.dragOffsetY) + 'px';
    clone.style.transform = 'none';
    clone.style.transition = 'none';
    clone.style.opacity = '0.9';
    clone.classList.remove('piece-ghost', 'inactive');
    clone.classList.add('dragging');

    dragState.dragClone = clone;
    document.body.appendChild(clone);
}

// Handle drag move
function handleDragMove(e) {
    if (!dragState.isDragging || !dragState.dragClone) return;

    e.preventDefault();

    const touch = e.type.startsWith('touch') ? e.touches[0] : e;

    // Update clone position immediately (no throttle for smooth dragging)
    dragState.dragClone.style.left = (touch.clientX - dragState.dragOffsetX) + 'px';
    dragState.dragClone.style.top = (touch.clientY - dragState.dragOffsetY) + 'px';

    // Throttle drop zone highlighting with requestAnimationFrame
    if (!dragState.rafId) {
        dragState.rafId = requestAnimationFrame(() => {
            updateDropZoneHighlight(touch.clientX, touch.clientY);
            dragState.rafId = null;
        });
    }
}

// Update drop zone highlighting - only highlights the cell under cursor
function updateDropZoneHighlight(x, y) {
    // Get element under cursor
    const elementBelow = document.elementFromPoint(x, y);
    const cell = elementBelow?.closest('.grid-cell');

    if (!cell) {
        // Remove highlight from previous cell if we're not over any cell
        if (dragState.currentHighlightedCell) {
            dragState.currentHighlightedCell.classList.remove('valid-move');
            dragState.currentHighlightedCell = null;
        }
        return;
    }

    // Check if this is the same cell we're already highlighting
    if (cell === dragState.currentHighlightedCell) {
        return; // No update needed
    }

    // Check if this cell is a valid move (use cached validMoves)
    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);
    const isValid = dragState.validMoves.some(move => move.row === row && move.col === col);

    // Remove highlight from previous cell
    if (dragState.currentHighlightedCell) {
        dragState.currentHighlightedCell.classList.remove('valid-move');
    }

    // Highlight new cell if it's valid
    if (isValid) {
        cell.classList.add('valid-move');
        dragState.currentHighlightedCell = cell;
    } else {
        dragState.currentHighlightedCell = null;
    }
}

// Handle drag end
function handleDragEnd(e) {
    if (!dragState.isDragging) return;

    e.preventDefault();

    const touch = e.type === 'touchend' ? e.changedTouches[0] : e;
    const dropTarget = document.elementFromPoint(touch.clientX, touch.clientY);
    const cell = dropTarget?.closest('.grid-cell');

    if (cell) {
        const toRow = parseInt(cell.dataset.row);
        const toCol = parseInt(cell.dataset.col);
        const fromRow = parseInt(dragState.originalPiece.dataset.row);
        const fromCol = parseInt(dragState.originalPiece.dataset.col);

        if (isValidMove(fromRow, fromCol, toRow, toCol)) {
            makeMove(fromRow, fromCol, toRow, toCol);
        }
    }

    // Clean up
    if (dragState.dragClone) {
        dragState.dragClone.remove();
        dragState.dragClone = null;
    }

    if (dragState.originalPiece) {
        dragState.originalPiece.classList.remove('piece-ghost');
    }

    // Clear highlight from currently highlighted cell only
    if (dragState.currentHighlightedCell) {
        dragState.currentHighlightedCell.classList.remove('valid-move');
        dragState.currentHighlightedCell = null;
    }

    // Cancel any pending RAF callback
    if (dragState.rafId) {
        cancelAnimationFrame(dragState.rafId);
        dragState.rafId = null;
    }

    // Reset drag state
    dragState.isDragging = false;
    dragState.originalPiece = null;
    dragState.validMoves = [];
}

// Highlight valid moves
function highlightValidMoves(row, col) {
    const moves = getValidMoves(row, col);
    moves.forEach(move => {
        const cell = document.querySelector(`[data-row="${move.row}"][data-col="${move.col}"]`);
        if (cell) cell.classList.add('valid-move');
    });
}

// Handle cell click
function handleCellClick(row, col) {
    if (gameState.gameOver) return;

    const piece = gameState.board[row][col];

    if (gameState.selectedPiece) {
        // Try to move
        if (isValidMove(gameState.selectedPiece.row, gameState.selectedPiece.col, row, col)) {
            makeMove(gameState.selectedPiece.row, gameState.selectedPiece.col, row, col);
        }
        gameState.selectedPiece = null;
        document.querySelectorAll('.grid-cell').forEach(c => c.classList.remove('valid-move'));
    } else if (piece && piece.color === gameState.currentPlayer) {
        // Select piece
        gameState.selectedPiece = { row, col };
        highlightValidMoves(row, col);
    }
}

// Get all valid moves for a piece
function getValidMoves(row, col) {
    const piece = gameState.board[row][col];
    if (!piece) return [];

    const moves = getPossibleMoves(row, col, piece);

    // Filter out moves that would leave king in check
    return moves.filter(move => {
        return !wouldBeInCheck(piece.color, row, col, move.row, move.col);
    });
}

// Get possible moves (without check validation)
function getPossibleMoves(row, col, piece, skipCheckValidation = false) {
    const moves = [];

    switch (piece.type) {
        case 'pawn':
            moves.push(...getPawnMoves(row, col, piece.color));
            break;
        case 'rook':
            moves.push(...getRookMoves(row, col, piece.color));
            break;
        case 'knight':
            moves.push(...getKnightMoves(row, col, piece.color));
            break;
        case 'bishop':
            moves.push(...getBishopMoves(row, col, piece.color));
            break;
        case 'queen':
            moves.push(...getQueenMoves(row, col, piece.color));
            break;
        case 'king':
            moves.push(...getKingMoves(row, col, piece.color, skipCheckValidation));
            break;
    }

    return moves;
}

// Pawn moves
function getPawnMoves(row, col, color) {
    const moves = [];
    const direction = color === 'white' ? -1 : 1;
    const startRow = color === 'white' ? 6 : 1;

    // Forward one square
    if (isInBounds(row + direction, col) && !gameState.board[row + direction][col]) {
        moves.push({ row: row + direction, col });

        // Forward two squares from start
        if (row === startRow && !gameState.board[row + 2 * direction][col]) {
            moves.push({ row: row + 2 * direction, col });
        }
    }

    // Captures
    for (const dc of [-1, 1]) {
        const newRow = row + direction;
        const newCol = col + dc;
        if (isInBounds(newRow, newCol)) {
            const target = gameState.board[newRow][newCol];
            if (target && target.color !== color) {
                moves.push({ row: newRow, col: newCol });
            }

            // En passant
            if (gameState.enPassantTarget &&
                gameState.enPassantTarget.row === newRow &&
                gameState.enPassantTarget.col === newCol) {
                moves.push({ row: newRow, col: newCol, enPassant: true });
            }
        }
    }

    return moves;
}

// Rook moves
function getRookMoves(row, col, color) {
    const moves = [];
    const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];

    for (const [dr, dc] of directions) {
        let r = row + dr;
        let c = col + dc;

        while (isInBounds(r, c)) {
            if (gameState.board[r][c]) {
                if (gameState.board[r][c].color !== color) {
                    moves.push({ row: r, col: c });
                }
                break;
            }
            moves.push({ row: r, col: c });
            r += dr;
            c += dc;
        }
    }

    return moves;
}

// Knight moves
function getKnightMoves(row, col, color) {
    const moves = [];
    const jumps = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1]
    ];

    for (const [dr, dc] of jumps) {
        const newRow = row + dr;
        const newCol = col + dc;

        if (isInBounds(newRow, newCol)) {
            const target = gameState.board[newRow][newCol];
            if (!target || target.color !== color) {
                moves.push({ row: newRow, col: newCol });
            }
        }
    }

    return moves;
}

// Bishop moves
function getBishopMoves(row, col, color) {
    const moves = [];
    const directions = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

    for (const [dr, dc] of directions) {
        let r = row + dr;
        let c = col + dc;

        while (isInBounds(r, c)) {
            if (gameState.board[r][c]) {
                if (gameState.board[r][c].color !== color) {
                    moves.push({ row: r, col: c });
                }
                break;
            }
            moves.push({ row: r, col: c });
            r += dr;
            c += dc;
        }
    }

    return moves;
}

// Queen moves
function getQueenMoves(row, col, color) {
    return [...getRookMoves(row, col, color), ...getBishopMoves(row, col, color)];
}

// King moves
function getKingMoves(row, col, color, skipCheckValidation = false) {
    const moves = [];
    const directions = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1], [0, 1],
        [1, -1], [1, 0], [1, 1]
    ];

    for (const [dr, dc] of directions) {
        const newRow = row + dr;
        const newCol = col + dc;

        if (isInBounds(newRow, newCol)) {
            const target = gameState.board[newRow][newCol];
            if (!target || target.color !== color) {
                moves.push({ row: newRow, col: newCol });
            }
        }
    }

    // Castling (skip if we're in a recursive check validation)
    if (!skipCheckValidation && !gameState.kingMoved[color] && !isInCheck(color)) {
        // Kingside
        if (gameState.castlingRights[color].kingside && !gameState.rookMoved[color].kingside) {
            if (!gameState.board[row][5] && !gameState.board[row][6]) {
                if (!wouldBeInCheck(color, row, col, row, 5) && !wouldBeInCheck(color, row, col, row, 6)) {
                    moves.push({ row, col: 6, castling: 'kingside' });
                }
            }
        }

        // Queenside
        if (gameState.castlingRights[color].queenside && !gameState.rookMoved[color].queenside) {
            if (!gameState.board[row][3] && !gameState.board[row][2] && !gameState.board[row][1]) {
                if (!wouldBeInCheck(color, row, col, row, 3) && !wouldBeInCheck(color, row, col, row, 2)) {
                    moves.push({ row, col: 2, castling: 'queenside' });
                }
            }
        }
    }

    return moves;
}

// Check if move is valid
function isValidMove(fromRow, fromCol, toRow, toCol) {
    const validMoves = getValidMoves(fromRow, fromCol);
    return validMoves.some(move => move.row === toRow && move.col === toCol);
}

// Make a move
function makeMove(fromRow, fromCol, toRow, toCol) {
    if (!gameState.gameStarted) {
        gameState.gameStarted = true;
        startTimers();
        document.getElementById('player-1-resign').disabled = false;
        document.getElementById('player-2-resign').disabled = false;
    }

    const piece = gameState.board[fromRow][fromCol];
    const move = getValidMoves(fromRow, fromCol).find(m => m.row === toRow && m.col === toCol);

    // Handle en passant
    if (move && move.enPassant) {
        const captureRow = piece.color === 'white' ? toRow + 1 : toRow - 1;
        gameState.board[captureRow][toCol] = null;
    }

    // Handle castling
    if (move && move.castling) {
        if (move.castling === 'kingside') {
            gameState.board[fromRow][7] = null;
            gameState.board[fromRow][5] = { type: 'rook', color: piece.color };
        } else {
            gameState.board[fromRow][0] = null;
            gameState.board[fromRow][3] = { type: 'rook', color: piece.color };
        }
    }

    // Update castling rights
    if (piece.type === 'king') {
        gameState.kingMoved[piece.color] = true;
    }
    if (piece.type === 'rook') {
        if (fromCol === 0) gameState.rookMoved[piece.color].queenside = true;
        if (fromCol === 7) gameState.rookMoved[piece.color].kingside = true;
    }

    // Set en passant target
    gameState.enPassantTarget = null;
    if (piece.type === 'pawn' && Math.abs(toRow - fromRow) === 2) {
        const targetRow = piece.color === 'white' ? toRow + 1 : toRow - 1;
        gameState.enPassantTarget = { row: targetRow, col: toCol };
    }

    // Move piece
    gameState.board[toRow][toCol] = piece;
    gameState.board[fromRow][fromCol] = null;

    // Check for pawn promotion
    if (piece.type === 'pawn' && (toRow === 0 || toRow === 7)) {
        showPromotionDialog(toRow, toCol, piece.color);
        return;
    }

    finishTurn();
}

// Show promotion dialog
function showPromotionDialog(row, col, color) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    overlay.innerHTML = `
        <div class="modal-content">
            <div class="modal-title">Promote Pawn</div>
            <div class="modal-text">Choose a piece:</div>
            <div class="promotion-options">
                <div class="promotion-option ${color}" data-type="queen">${PIECES.queen}</div>
                <div class="promotion-option ${color}" data-type="rook">${PIECES.rook}</div>
                <div class="promotion-option ${color}" data-type="bishop">${PIECES.bishop}</div>
                <div class="promotion-option ${color}" data-type="knight">${PIECES.knight}</div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelectorAll('.promotion-option').forEach(option => {
        option.addEventListener('click', () => {
            const type = option.dataset.type;
            gameState.board[row][col] = { type, color };
            overlay.remove();
            finishTurn();
        });
    });
}

// Finish turn
function finishTurn() {
    gameState.currentPlayer = gameState.currentPlayer === 'white' ? 'black' : 'white';
    renderBoard();
    updatePlayerStatus();

    // Switch timers
    switchTimer();

    // Check for checkmate or stalemate
    if (isCheckmate(gameState.currentPlayer)) {
        gameState.gameOver = true;
        gameState.winner = gameState.currentPlayer === 'white' ? 'black' : 'white';
        showVictory('Checkmate!');
    } else if (isStalemate(gameState.currentPlayer)) {
        gameState.gameOver = true;
        showVictory('Stalemate!', true);
    }
}

// Check if king is in check
function isInCheck(color) {
    const kingPos = findKing(color);
    if (!kingPos) return false;

    const opponentColor = color === 'white' ? 'black' : 'white';

    // Check all opponent pieces (skip recursive check validation to avoid infinite recursion)
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = gameState.board[row][col];
            if (piece && piece.color === opponentColor) {
                const moves = getPossibleMoves(row, col, piece, true);
                if (moves.some(m => m.row === kingPos.row && m.col === kingPos.col)) {
                    return true;
                }
            }
        }
    }

    return false;
}

// Check if move would result in check
function wouldBeInCheck(color, fromRow, fromCol, toRow, toCol) {
    // Simulate move
    const piece = gameState.board[fromRow][fromCol];
    const captured = gameState.board[toRow][toCol];

    gameState.board[toRow][toCol] = piece;
    gameState.board[fromRow][fromCol] = null;

    const inCheck = isInCheck(color);

    // Undo move
    gameState.board[fromRow][fromCol] = piece;
    gameState.board[toRow][toCol] = captured;

    return inCheck;
}

// Find king position
function findKing(color) {
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = gameState.board[row][col];
            if (piece && piece.type === 'king' && piece.color === color) {
                return { row, col };
            }
        }
    }
    return null;
}

// Check for checkmate
function isCheckmate(color) {
    if (!isInCheck(color)) return false;

    // Check if any move can get out of check
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = gameState.board[row][col];
            if (piece && piece.color === color) {
                const moves = getValidMoves(row, col);
                if (moves.length > 0) return false;
            }
        }
    }

    return true;
}

// Check for stalemate
function isStalemate(color) {
    if (isInCheck(color)) return false;

    // Check if player has any valid moves
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = gameState.board[row][col];
            if (piece && piece.color === color) {
                const moves = getValidMoves(row, col);
                if (moves.length > 0) return false;
            }
        }
    }

    return true;
}

// Check if position is in bounds
function isInBounds(row, col) {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
}

// Update player status
function updatePlayerStatus() {
    const status1 = document.getElementById('player-1-status');
    const status2 = document.getElementById('player-2-status');

    status1.textContent = '';
    status2.textContent = '';

    if (gameState.gameOver) {
        if (gameState.winner) {
            const winnerStatus = gameState.winner === gameState.player1Color ? status1 : status2;
            winnerStatus.textContent = 'Winner!';
        }
    } else {
        const currentStatus = gameState.currentPlayer === gameState.player1Color ? status1 : status2;

        if (isInCheck(gameState.currentPlayer)) {
            currentStatus.textContent = 'In Check!';
            currentStatus.style.color = '#DC2626';
        } else {
            currentStatus.textContent = 'Your Turn';
            currentStatus.style.color = '#FFD700';
        }
    }

    document.getElementById('player-1-info').classList.toggle('active',
        gameState.currentPlayer === gameState.player1Color && !gameState.gameOver);
    document.getElementById('player-2-info').classList.toggle('active',
        gameState.currentPlayer === gameState.player2Color && !gameState.gameOver);

    // Update resign button visibility based on whose turn it is
    if (gameState.gameStarted && !gameState.gameOver) {
        document.getElementById('player-1-resign').disabled = gameState.currentPlayer !== gameState.player1Color;
        document.getElementById('player-2-resign').disabled = gameState.currentPlayer !== gameState.player2Color;
    }
}

// Timer functions
function startTimers() {
    if (!gameState.timeControl) return;

    document.getElementById('time-control-selector').classList.add('active');
    document.getElementById('time-control-selector').style.cursor = 'default';

    // Start first player's timer
    if (gameState.currentPlayer === gameState.player1Color) {
        startPlayerTimer('player1');
    } else {
        startPlayerTimer('player2');
    }
}

function startPlayerTimer(player) {
    const timerEl = document.getElementById(`${player}-timer`);

    gameState.timerIntervals[player] = setInterval(() => {
        gameState.timers[player]--;

        const minutes = Math.floor(gameState.timers[player] / 60);
        const seconds = gameState.timers[player] % 60;
        timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        if (gameState.timers[player] <= 0) {
            clearInterval(gameState.timerIntervals[player]);
            timeOut(player);
        }
    }, 1000);
}

function stopPlayerTimer(player) {
    clearInterval(gameState.timerIntervals[player]);
    gameState.timerIntervals[player] = null;
}

function switchTimer() {
    if (!gameState.timeControl) return;

    if (gameState.currentPlayer === gameState.player1Color) {
        stopPlayerTimer('player2');
        startPlayerTimer('player1');
    } else {
        stopPlayerTimer('player1');
        startPlayerTimer('player2');
    }
}

function timeOut(player) {
    gameState.gameOver = true;
    gameState.winner = player === 'player1' ? gameState.player2Color : gameState.player1Color;
    showVictory('Time Out!');
}

// Show victory
function showVictory(message, draw = false) {
    stopPlayerTimer('player1');
    stopPlayerTimer('player2');

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const winnerText = draw ? 'Draw!' :
        `${gameState.winner === gameState.player1Color ? 'Player 1' : 'Player 2'} Wins!`;

    overlay.innerHTML = `
        <div class="modal-content">
            <div class="modal-title">${winnerText}</div>
            <div class="modal-text">${message}</div>
            <button class="game-button" onclick="this.parentElement.parentElement.remove()">Close</button>
        </div>
    `;

    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.remove();
        }
    });
}

// Event listeners
document.getElementById('new-game').addEventListener('click', () => {
    document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
    initGame();
});

document.getElementById('back-button').addEventListener('click', () => {
    window.location.href = 'https://kkollsga.github.io/tesla/';
});

document.getElementById('time-control-selector').addEventListener('click', () => {
    if (gameState.gameStarted) return;
    showTimeSelection();
});

document.getElementById('player-1-resign').addEventListener('click', () => {
    if (gameState.currentPlayer === gameState.player1Color) {
        gameState.gameOver = true;
        gameState.winner = gameState.player2Color;
        showVictory('Player 1 Resigned!');
    }
});

document.getElementById('player-2-resign').addEventListener('click', () => {
    if (gameState.currentPlayer === gameState.player2Color) {
        gameState.gameOver = true;
        gameState.winner = gameState.player1Color;
        showVictory('Player 2 Resigned!');
    }
});

function showTimeSelection() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    overlay.innerHTML = `
        <div class="modal-content">
            <div class="modal-title">Select Time Control</div>
            <div class="time-options">
                <div class="time-option" data-time="60">
                    <div class="time-option-label">1 min</div>
                    <div class="time-option-desc">Bullet</div>
                </div>
                <div class="time-option" data-time="180">
                    <div class="time-option-label">3 min</div>
                    <div class="time-option-desc">Blitz</div>
                </div>
                <div class="time-option" data-time="600">
                    <div class="time-option-label">10 min</div>
                    <div class="time-option-desc">Rapid</div>
                </div>
                <div class="time-option" data-time="1800">
                    <div class="time-option-label">30 min</div>
                    <div class="time-option-desc">Classical</div>
                </div>
                <div class="time-option" data-time="0">
                    <div class="time-option-label">No Limit</div>
                    <div class="time-option-desc">Unlimited</div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelectorAll('.time-option').forEach(option => {
        option.addEventListener('click', () => {
            const time = parseInt(option.dataset.time);
            setTimeControl(time);
            overlay.remove();
        });
    });
}

function setTimeControl(seconds) {
    gameState.timeControl = seconds;

    if (seconds === 0) {
        document.getElementById('player-1-timer').textContent = '--:--';
        document.getElementById('player-2-timer').textContent = '--:--';
        document.querySelector('.time-control-label').textContent = 'No Limit';
    } else {
        gameState.timers.player1 = seconds;
        gameState.timers.player2 = seconds;

        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        const timeStr = `${minutes}:${secs.toString().padStart(2, '0')}`;

        document.getElementById('player-1-timer').textContent = timeStr;
        document.getElementById('player-2-timer').textContent = timeStr;

        const label = seconds === 60 ? '1 min' :
                      seconds === 180 ? '3 min' :
                      seconds === 600 ? '10 min' : '30 min';
        document.querySelector('.time-control-label').textContent = label;
    }
}


// Initialize on load
window.addEventListener('load', () => {
    initGame();
});
