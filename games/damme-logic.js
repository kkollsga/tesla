// Game state
const gameState = {
    board: Array(8).fill(null).map(() => Array(8).fill(null)),
    currentPlayer: 'red',
    player1Color: 'red',
    player2Color: 'white',
    selectedPiece: null,
    gameOver: false,
    winner: null,
    mustJump: false,
    multiJumpInProgress: false,
    jumpingPiece: null
};

// Drag state
const dragState = {
    isDragging: false,
    dragClone: null,
    originalPiece: null,
    dragOffsetX: 0,
    dragOffsetY: 0
};

// Initialize game
function initGame() {
    setupBoard();
    assignColors();
    renderBoard();
    updateStatus();

    // Hide victory overlay
    const victoryOverlay = document.getElementById('victory-overlay');
    if (victoryOverlay) {
        victoryOverlay.style.display = 'none';
    }

    // Event listeners (only add once using named functions)
    const newGameBtn = document.getElementById('new-game');
    const infoBtn = document.getElementById('infoBtn');
    const infoModal = document.getElementById('infoModal');

    // Remove old listeners and add new ones to avoid duplicates
    if (newGameBtn) {
        newGameBtn.removeEventListener('click', initGame);
        newGameBtn.addEventListener('click', initGame);
    }

    if (infoBtn) {
        infoBtn.removeEventListener('click', showInfo);
        infoBtn.addEventListener('click', showInfo);
    }

    const closeInfoBtn = document.getElementById('closeInfoBtn');
    if (closeInfoBtn) {
        closeInfoBtn.removeEventListener('click', hideInfo);
        closeInfoBtn.addEventListener('click', hideInfo);
    }

    // Victory overlay click to restart
    if (victoryOverlay) {
        victoryOverlay.removeEventListener('click', initGame);
        victoryOverlay.addEventListener('click', initGame);
    }

    // Prevent info panel clicks from closing the overlay
    const infoPanel = document.querySelector('.info-panel');
    if (infoPanel) {
        infoPanel.removeEventListener('click', stopPropagation);
        infoPanel.addEventListener('click', stopPropagation);
    }
}

// Helper functions for event listeners
function handleBack() {
    window.location.href = 'index.html';
}

function stopPropagation(e) {
    e.stopPropagation();
}

// Setup initial board
function setupBoard() {
    // Clear board
    gameState.board = Array(8).fill(null).map(() => Array(8).fill(null));
    gameState.currentPlayer = 'red';
    gameState.selectedPiece = null;
    gameState.gameOver = false;
    gameState.winner = null;
    gameState.mustJump = false;
    gameState.multiJumpInProgress = false;
    gameState.jumpingPiece = null;

    // Place red pieces (top 3 rows, dark squares only)
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 8; col++) {
            if ((row + col) % 2 === 1) {
                gameState.board[row][col] = { color: 'red', isKing: false };
            }
        }
    }

    // Place white pieces (bottom 3 rows, dark squares only)
    for (let row = 5; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            if ((row + col) % 2 === 1) {
                gameState.board[row][col] = { color: 'white', isKing: false };
            }
        }
    }
}

// Assign random colors to players
function assignColors() {
    if (Math.random() < 0.5) {
        gameState.player1Color = 'red';
        gameState.player2Color = 'white';
    } else {
        gameState.player1Color = 'white';
        gameState.player2Color = 'red';
    }

    document.getElementById('player-1-color').textContent = gameState.player1Color.toUpperCase();
    document.getElementById('player-2-color').textContent = gameState.player2Color.toUpperCase();

    // Rotate board so player's pieces appear on their side
    // Red pieces start at rows 0-2, white pieces at rows 5-7
    const gridContainer = document.getElementById('grid-container');
    const gameBoard = document.querySelector('.game-board');
    if (gameState.player1Color === 'red') {
        // Player 1 (left) is red - rotate 270deg so red pieces appear on left
        gridContainer.style.transform = 'rotate(270deg)';
        gameBoard.classList.add('flipped');
    } else {
        // Player 1 (left) is white - rotate 90deg so white pieces appear on left
        gridContainer.style.transform = 'rotate(90deg)';
        gameBoard.classList.remove('flipped');
    }
}

// Render the board
function renderBoard() {
    const gridContainer = document.getElementById('grid-container');

    // Completely clear the grid container to prevent any duplicate pieces
    gridContainer.innerHTML = '';

    // Clear previous highlights
    gameState.selectedPiece = null;

    // Rebuild the board from game state (single source of truth)
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.classList.add((row + col) % 2 === 0 ? 'light' : 'dark');
            cell.dataset.row = row;
            cell.dataset.col = col;

            // Add piece if present in game state
            const piece = gameState.board[row][col];
            if (piece) {
                const pieceEl = createPiece(piece, row, col);
                cell.appendChild(pieceEl);
            }

            cell.addEventListener('click', () => handleCellClick(row, col));
            gridContainer.appendChild(cell);
        }
    }

    // Setup drag and drop
    setupDragAndDrop();

    // Update piece counts
    updatePieceCounts();
}

// Create piece element
function createPiece(piece, row, col) {
    const pieceEl = document.createElement('div');
    pieceEl.className = `piece ${piece.color}`;
    if (piece.isKing) {
        pieceEl.classList.add('king');
    }
    pieceEl.dataset.row = row;
    pieceEl.dataset.col = col;
    pieceEl.dataset.color = piece.color;

    // Only current player's pieces are draggable
    if (piece.color !== gameState.currentPlayer || gameState.gameOver) {
        pieceEl.classList.add('inactive');
    }

    // During multi-jump, only the jumping piece is draggable
    if (gameState.multiJumpInProgress && gameState.jumpingPiece) {
        if (row !== gameState.jumpingPiece.row || col !== gameState.jumpingPiece.col) {
            pieceEl.classList.add('inactive');
        }
    }

    return pieceEl;
}

// Setup drag and drop
function setupDragAndDrop() {
    const gridContainer = document.getElementById('grid-container');

    // Mouse events
    gridContainer.addEventListener('mousedown', handleDragStart);
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);

    // Touch events
    gridContainer.addEventListener('touchstart', handleDragStart, { passive: false });
    document.addEventListener('touchmove', handleDragMove, { passive: false });
    document.addEventListener('touchend', handleDragEnd, false);
}

// Handle drag start
function handleDragStart(e) {
    if (gameState.gameOver) return;

    const touch = e.type.startsWith('touch') ? e.touches[0] : e;
    const target = e.type.startsWith('touch') ?
        document.elementFromPoint(touch.clientX, touch.clientY) : e.target;

    const piece = target.closest('.piece');
    if (!piece || piece.classList.contains('inactive')) return;

    const row = parseInt(piece.dataset.row);
    const col = parseInt(piece.dataset.col);

    // Check if this piece must jump (during multi-jump)
    if (gameState.multiJumpInProgress && gameState.jumpingPiece) {
        if (row !== gameState.jumpingPiece.row || col !== gameState.jumpingPiece.col) {
            return;
        }
    }

    // Check if forced to jump
    if (gameState.mustJump && !hasJumps(row, col)) {
        return;
    }

    const rect = piece.getBoundingClientRect();
    dragState.dragOffsetX = touch.clientX - rect.left;
    dragState.dragOffsetY = touch.clientY - rect.top;
    dragState.isDragging = true;
    dragState.originalPiece = piece;

    createDragClone(piece, touch.clientX, touch.clientY);
    piece.classList.add('piece-ghost');

    // Highlight valid moves
    highlightValidMoves(row, col);
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

    // Update clone position
    dragState.dragClone.style.left = (touch.clientX - dragState.dragOffsetX) + 'px';
    dragState.dragClone.style.top = (touch.clientY - dragState.dragOffsetY) + 'px';
}

// Clean up drag state
function cleanupDragState() {
    // Remove drag clone if it exists
    if (dragState.dragClone) {
        dragState.dragClone.remove();
        dragState.dragClone = null;
    }

    // Remove ghost class from original piece
    if (dragState.originalPiece) {
        dragState.originalPiece.classList.remove('piece-ghost');
    }

    // Reset drag state
    dragState.isDragging = false;
    dragState.originalPiece = null;
    dragState.dragOffsetX = 0;
    dragState.dragOffsetY = 0;
}

// Handle drag end
function handleDragEnd(e) {
    if (!dragState.isDragging) return;

    e.preventDefault();

    const touch = e.type === 'touchend' ? e.changedTouches[0] : e;
    const dropTarget = document.elementFromPoint(touch.clientX, touch.clientY);
    const cell = dropTarget?.closest('.grid-cell');

    // Store original piece info before cleanup
    const originalPiece = dragState.originalPiece;

    // Clean up drag visuals
    cleanupDragState();

    // Clear highlights
    clearHighlights();

    if (cell && originalPiece) {
        const toRow = parseInt(cell.dataset.row);
        const toCol = parseInt(cell.dataset.col);
        const fromRow = parseInt(originalPiece.dataset.row);
        const fromCol = parseInt(originalPiece.dataset.col);

        tryMove(fromRow, fromCol, toRow, toCol);
    }
}

// Handle cell click (for non-drag interactions)
function handleCellClick(row, col) {
    if (gameState.gameOver || dragState.isDragging) return;

    const piece = gameState.board[row][col];

    // If no piece selected and clicked on own piece, select it
    if (!gameState.selectedPiece && piece && piece.color === gameState.currentPlayer) {
        // Check if must jump
        if (gameState.mustJump && !hasJumps(row, col)) {
            return;
        }

        // During multi-jump, can only select jumping piece
        if (gameState.multiJumpInProgress && gameState.jumpingPiece) {
            if (row !== gameState.jumpingPiece.row || col !== gameState.jumpingPiece.col) {
                return;
            }
        }

        gameState.selectedPiece = { row, col };
        highlightValidMoves(row, col);
    }
    // If piece selected and clicked on different cell, try to move
    else if (gameState.selectedPiece) {
        const fromRow = gameState.selectedPiece.row;
        const fromCol = gameState.selectedPiece.col;

        tryMove(fromRow, fromCol, row, col);

        gameState.selectedPiece = null;
        clearHighlights();
    }
}

// Try to make a move
function tryMove(fromRow, fromCol, toRow, toCol) {
    // Validate source position has a piece
    const piece = gameState.board[fromRow][fromCol];
    if (!piece) {
        console.error('No piece at source position');
        return;
    }

    // Validate it's the current player's piece
    if (piece.color !== gameState.currentPlayer) {
        console.error('Not current player\'s piece');
        return;
    }

    const moves = getValidMoves(fromRow, fromCol);
    const move = moves.find(m => m.row === toRow && m.col === toCol);

    if (move) {
        makeMove(fromRow, fromCol, toRow, toCol, move.isJump, move.capturedPiece);
    }
}

// Make a move
function makeMove(fromRow, fromCol, toRow, toCol, isJump, capturedPiece) {
    const piece = gameState.board[fromRow][fromCol];

    if (!piece) {
        console.error('No piece at source position');
        return;
    }

    // Clear the source position FIRST to prevent duplicates
    gameState.board[fromRow][fromCol] = null;

    // Move piece to destination
    gameState.board[toRow][toCol] = piece;

    // Remove captured piece if jumping
    if (isJump && capturedPiece) {
        gameState.board[capturedPiece.row][capturedPiece.col] = null;
    }

    // Promote to king if reached opposite end
    if ((piece.color === 'red' && toRow === 7) || (piece.color === 'white' && toRow === 0)) {
        piece.isKing = true;
    }

    // Check for additional jumps
    if (isJump) {
        const additionalJumps = getValidMoves(toRow, toCol, true);

        if (additionalJumps.length > 0) {
            // Multi-jump available - clean up any drag state before rendering
            cleanupDragState();
            gameState.multiJumpInProgress = true;
            gameState.jumpingPiece = { row: toRow, col: toCol };
            renderBoard();
            highlightValidMoves(toRow, toCol);
            return;
        }
    }

    // End turn - clean up any drag state before rendering
    cleanupDragState();
    gameState.multiJumpInProgress = false;
    gameState.jumpingPiece = null;
    switchPlayer();
    renderBoard();
    checkGameOver();
    updateStatus();
}

// Get valid moves for a piece
function getValidMoves(row, col, jumpsOnly = false) {
    const piece = gameState.board[row][col];
    if (!piece) return [];

    const moves = [];
    const jumps = [];

    // Direction multiplier: red moves down (+1), white moves up (-1)
    const directions = [];

    if (piece.isKing) {
        // Kings can move in all diagonal directions
        directions.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
    } else {
        // Regular pieces move forward only
        const forwardDir = piece.color === 'red' ? 1 : -1;
        directions.push([forwardDir, -1], [forwardDir, 1]);
    }

    // Check each direction
    for (const [dr, dc] of directions) {
        const newRow = row + dr;
        const newCol = col + dc;

        // Check regular move (one square diagonally)
        if (isInBounds(newRow, newCol) && !gameState.board[newRow][newCol]) {
            moves.push({ row: newRow, col: newCol, isJump: false });
        }

        // Check jump (two squares diagonally, jumping over opponent)
        const jumpRow = row + dr * 2;
        const jumpCol = col + dc * 2;

        if (isInBounds(jumpRow, jumpCol) && !gameState.board[jumpRow][jumpCol]) {
            const capturedRow = row + dr;
            const capturedCol = col + dc;
            const capturedPiece = gameState.board[capturedRow][capturedCol];

            if (capturedPiece && capturedPiece.color !== piece.color) {
                jumps.push({
                    row: jumpRow,
                    col: jumpCol,
                    isJump: true,
                    capturedPiece: { row: capturedRow, col: capturedCol }
                });
            }
        }
    }

    // If jumps available, return only jumps (forced jump rule)
    if (jumps.length > 0 || jumpsOnly) {
        return jumps;
    }

    // If must jump but this piece has no jumps, return empty
    if (gameState.mustJump) {
        return [];
    }

    return moves;
}

// Check if piece has any jumps available
function hasJumps(row, col) {
    const moves = getValidMoves(row, col);
    return moves.some(m => m.isJump);
}

// Check if any piece of current player must jump (optimized - exits early)
function mustJumpCheck() {
    const currentColor = gameState.currentPlayer;
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = gameState.board[row][col];
            if (piece && piece.color === currentColor) {
                // Check jumps directly without calling hasJumps for better performance
                const moves = getValidMoves(row, col, true); // Only get jumps
                if (moves.length > 0) {
                    return true; // Early exit
                }
            }
        }
    }
    return false;
}

// Highlight valid moves
function highlightValidMoves(row, col) {
    clearHighlights();

    const moves = getValidMoves(row, col);

    // Highlight selected cell
    const selectedCell = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (selectedCell) {
        selectedCell.classList.add('selected');
    }

    // Highlight valid move cells
    moves.forEach(move => {
        const cell = document.querySelector(`[data-row="${move.row}"][data-col="${move.col}"]`);
        if (cell) {
            cell.classList.add(move.isJump ? 'valid-jump' : 'valid-move');
        }
    });
}

// Clear all highlights
function clearHighlights() {
    document.querySelectorAll('.grid-cell').forEach(cell => {
        cell.classList.remove('valid-move', 'valid-jump', 'selected');
    });
}

// Check if coordinates are in bounds
function isInBounds(row, col) {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
}

// Switch to next player
function switchPlayer() {
    gameState.currentPlayer = gameState.currentPlayer === 'red' ? 'white' : 'red';
    gameState.mustJump = mustJumpCheck();
}

// Check if game is over
function checkGameOver() {
    const currentColor = gameState.currentPlayer;

    // Count pieces and check for valid moves in a single pass (performance optimization)
    let currentPlayerPieces = 0;
    let hasValidMoves = false;

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = gameState.board[row][col];
            if (piece && piece.color === currentColor) {
                currentPlayerPieces++;

                // Only check for moves if we haven't found any yet
                if (!hasValidMoves) {
                    const moves = getValidMoves(row, col);
                    if (moves.length > 0) {
                        hasValidMoves = true;
                    }
                }
            }
        }

        // Early exit if we have pieces and valid moves
        if (currentPlayerPieces > 0 && hasValidMoves) {
            return;
        }
    }

    // Current player loses if they have no pieces or no valid moves
    if (currentPlayerPieces === 0 || !hasValidMoves) {
        const winner = currentColor === 'red' ? 'white' : 'red';
        endGame(winner);
    }
}

// End game
function endGame(winner) {
    gameState.gameOver = true;
    gameState.winner = winner;

    const winnerPlayer = winner === gameState.player1Color ? 'Player 1' : 'Player 2';

    // Show victory overlay with styled text
    const overlay = document.getElementById('victory-overlay');
    const victoryText = document.getElementById('victory-text');
    const victorySubtext = document.getElementById('victory-subtext');

    victoryText.textContent = 'Victory!';
    victorySubtext.textContent = `${winnerPlayer} (${winner.toUpperCase()}) Wins!`;
    overlay.style.display = 'flex';

    // Update status
    updateStatus();
}

// Update status display
function updateStatus() {
    const status1 = document.getElementById('player-1-status');
    const status2 = document.getElementById('player-2-status');
    const info1 = document.getElementById('player-1-info');
    const info2 = document.getElementById('player-2-info');

    status1.textContent = '';
    status2.textContent = '';

    // Update active player highlighting
    const isPlayer1Active = gameState.currentPlayer === gameState.player1Color && !gameState.gameOver;
    const isPlayer2Active = gameState.currentPlayer === gameState.player2Color && !gameState.gameOver;

    info1.classList.toggle('active', isPlayer1Active);
    info2.classList.toggle('active', isPlayer2Active);

    if (gameState.gameOver) {
        const statusEl = gameState.winner === gameState.player1Color ? status1 : status2;
        statusEl.textContent = 'Winner!';
    } else {
        const statusEl = gameState.currentPlayer === gameState.player1Color ? status1 : status2;

        if (gameState.multiJumpInProgress) {
            statusEl.textContent = 'Continue jumping!';
        } else if (gameState.mustJump) {
            statusEl.textContent = 'Must capture!';
        } else {
            statusEl.textContent = 'Your turn';
        }
    }
}

// Update piece counts
function updatePieceCounts() {
    let redCount = 0;
    let whiteCount = 0;

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = gameState.board[row][col];
            if (piece) {
                if (piece.color === 'red') redCount++;
                else whiteCount++;
            }
        }
    }

    const player1Count = gameState.player1Color === 'red' ? redCount : whiteCount;
    const player2Count = gameState.player2Color === 'red' ? redCount : whiteCount;

    document.getElementById('player-1-count').textContent = `${player1Count} pieces`;
    document.getElementById('player-2-count').textContent = `${player2Count} pieces`;
}

// Show info overlay
function showInfo() {
    document.getElementById('infoModal').classList.add('active');
}

// Hide info overlay
function hideInfo() {
    document.getElementById('infoModal').classList.remove('active');
}

// Initialize on load
window.addEventListener('load', () => {
    initGame();
});
