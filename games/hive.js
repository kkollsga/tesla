/* ========================================
   HIVE GAME - Main Game Logic
   ======================================== */

// ============================================
// HEXAGONAL COORDINATE SYSTEM
// Using axial coordinates (q, r) for hexagonal grid
// ============================================

class Hex {
    constructor(q, r) {
        this.q = q;
        this.r = r;
    }

    equals(other) {
        return this.q === other.q && this.r === other.r;
    }

    toString() {
        return `${this.q},${this.r}`;
    }

    static fromString(str) {
        const [q, r] = str.split(',').map(Number);
        return new Hex(q, r);
    }

    getNeighbors() {
        const directions = [
            new Hex(1, 0), new Hex(1, -1), new Hex(0, -1),
            new Hex(-1, 0), new Hex(-1, 1), new Hex(0, 1)
        ];
        return directions.map(d => new Hex(this.q + d.q, this.r + d.r));
    }

    distance(other) {
        return (Math.abs(this.q - other.q) + Math.abs(this.r - other.r) +
            Math.abs((this.q + this.r) - (other.q + other.r))) / 2;
    }

    static getLine(start, end) {
        const distance = start.distance(end);
        if (distance === 0) return [start];

        const line = [];
        for (let i = 0; i <= distance; i++) {
            const t = distance === 0 ? 0 : i / distance;
            const q = Math.round(start.q + (end.q - start.q) * t);
            const r = Math.round(start.r + (end.r - start.r) * t);
            line.push(new Hex(q, r));
        }
        return line;
    }
}

// ============================================
// GAME STATE & CONSTANTS
// ============================================

const INSECT_TYPES = {
    queen: { name: 'Queen Bee', count: 1, icon: '👑', movement: 'Moves 1 hexagon in any direction', expansion: false },
    ant: { name: 'Soldier Ant', count: 3, icon: '🐜', movement: 'Slides any distance in straight lines', expansion: false },
    beetle: { name: 'Beetle', count: 2, icon: '🪲', movement: 'Moves 1 space, can climb on others', expansion: false },
    hopper: { name: 'Grasshopper', count: 3, icon: '🦗', movement: 'Jumps over connected insects', expansion: false },
    spider: { name: 'Spider', count: 2, icon: '🕷️', movement: 'Moves exactly 3 spaces around the hive', expansion: false },
    mosquito: { name: 'Mosquito', count: 1, icon: '🦟', movement: 'Copies abilities of adjacent insects', expansion: true },
    ladybug: { name: 'Ladybug', count: 1, icon: '🐞', movement: 'Moves exactly 2 spaces up then 1 down', expansion: true },
    pillbug: { name: 'Pillbug', count: 1, icon: '🪲', movement: 'Moves 1 space, can throw adjacent insects', expansion: true }
};

let gameConfig = {
    expansionMosquito: false,
    expansionLadybug: false,
    expansionPillbug: false,
    tournamentRules: false
};

let gameState = {
    board: new Map(), // key: hex.toString(), value: { player: 1|2, insect: type, id: unique }
    hand: {
        player1: {},
        player2: {}
    },
    currentPlayer: 1,
    gameOver: false,
    winner: null,
    turn: 0,
    selectedInsect: null,
    queenPlaced: { 1: false, 2: false },
    turnCount: { 1: 0, 2: 0 }
};

const HEX_SIZE = 50;
const HEX_MARGIN = 2;
const HEX_ACTUAL_SIZE = HEX_SIZE - HEX_MARGIN;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 1.8;
const MIN_AUTO_ZOOM = 0.8;

// ============================================
// HEXAGON RENDERING & CONVERSION
// ============================================

function hexToPixel(hex) {
    const q = hex.q;
    const r = hex.r;
    const x = HEX_ACTUAL_SIZE * (3/2 * q);
    const y = HEX_ACTUAL_SIZE * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r);
    return { x, y };
}

function pixelToHex(x, y) {
    const q = (2/3 * x) / HEX_ACTUAL_SIZE;
    const r = (-1/3 * x + Math.sqrt(3)/3 * y) / HEX_ACTUAL_SIZE;
    return hexRound(q, r);
}

function hexRound(q, r) {
    let rq = Math.round(q);
    let rr = Math.round(r);
    const rs = Math.round(-q - r);

    const qDiff = Math.abs(rq - q);
    const rDiff = Math.abs(rr - r);
    const sDiff = Math.abs(rs - (-q - r));

    if (qDiff > rDiff && qDiff > sDiff) {
        rq = -rr - rs;
    } else if (rDiff > sDiff) {
        rr = -rq - rs;
    }

    return new Hex(rq, rr);
}

// Hexagon cache to avoid recreating DOM elements
const hexagonCache = new Map();

function createHexagon(hex) {
    const hexKey = hex.toString();

    // Return cached hexagon if it exists
    if (hexagonCache.has(hexKey)) {
        return hexagonCache.get(hexKey);
    }

    const pos = hexToPixel(hex);
    const div = document.createElement('div');
    div.className = 'hexagon';
    div.dataset.hex = hexKey;

    const size = HEX_ACTUAL_SIZE;
    div.style.left = (pos.x - size) + 'px';
    div.style.top = (pos.y - size) + 'px';
    div.style.width = (size * 2) + 'px';
    div.style.height = (size * 2) + 'px';

    const svg = createHexagonSVG();
    div.appendChild(svg);

    div.addEventListener('mousedown', handleHexagonMouseDown);
    div.addEventListener('touchstart', handleHexagonTouchStart);

    // Cache the element
    hexagonCache.set(hexKey, div);
    return div;
}

function createHexagonSVG() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    const points = [];
    for (let i = 0; i < 6; i++) {
        const angle = Math.PI / 3 * i;
        const x = 50 + 45 * Math.cos(angle);
        const y = 50 + 45 * Math.sin(angle);
        points.push(`${x},${y}`);
    }
    polygon.setAttribute('points', points.join(' '));
    polygon.setAttribute('fill', 'rgba(45, 122, 79, 0.3)');
    polygon.setAttribute('stroke', '#2d7a4f');
    polygon.setAttribute('stroke-width', '2');

    // Add smooth transitions for fill and stroke
    polygon.style.transition = 'fill 0.15s ease, stroke 0.15s ease, stroke-width 0.15s ease';

    svg.appendChild(polygon);
    return svg;
}

// ============================================
// DRAG AND DROP STATE & MANAGEMENT
// ============================================

let dragState = {
    isDragging: false,
    dragElement: null,
    dragClone: null,
    dragOffsetX: 0,
    dragOffsetY: 0,
    dragSource: null, // 'hand' or 'board'
    sourceData: null,
    highlightTimeout: null,
    lastHighlightedHex: null,
    draggedFromHand: null // Tag for which insect type is being dragged from hand (not yet committed)
};

let selectedElement = null;
let panState = {
    startX: 0,
    startY: 0,
    startPanX: 0,
    startPanY: 0
};

function startPan(e) {
    if (dragState.isDragging) return;

    const wrapper = document.querySelector('.hexagon-zoom-wrapper');
    const panX = parseFloat(wrapper.style.getPropertyValue('--pan-x')) || 0;
    const panY = parseFloat(wrapper.style.getPropertyValue('--pan-y')) || 0;

    panState.startX = e.clientX;
    panState.startY = e.clientY;
    panState.startPanX = panX;
    panState.startPanY = panY;

    document.addEventListener('mousemove', handlePanMove);
    document.addEventListener('mouseup', endPan);
    document.addEventListener('touchmove', handlePanMoveTouch);
    document.addEventListener('touchend', endPan);
}

function handlePanMove(e) {
    const deltaX = e.clientX - panState.startX;
    const deltaY = e.clientY - panState.startY;

    const wrapper = document.querySelector('.hexagon-zoom-wrapper');
    const newX = panState.startPanX + deltaX;
    const newY = panState.startPanY + deltaY;

    wrapper.style.setProperty('--pan-x', newX + 'px');
    wrapper.style.setProperty('--pan-y', newY + 'px');
    updateBoardZoom();
}

function handlePanMoveTouch(e) {
    if (e.touches.length > 0) {
        const touch = e.touches[0];
        handlePanMove({ clientX: touch.clientX, clientY: touch.clientY });
    }
}

function endPan(e) {
    document.removeEventListener('mousemove', handlePanMove);
    document.removeEventListener('mouseup', endPan);
    document.removeEventListener('touchmove', handlePanMoveTouch);
    document.removeEventListener('touchend', endPan);
}

function handleHexagonMouseDown(e) {
    const hexElement = e.currentTarget.closest('.hexagon') || e.currentTarget;
    if (!hexElement.dataset.hex) return;

    const hex = new Hex(...hexElement.dataset.hex.split(',').map(Number));
    const insect = gameState.board.get(hex.toString());

    if (insect && insect.player === gameState.currentPlayer) {
        selectAndDrag(e, 'board', insect);
    } else if (!insect) {
        startPan(e);
    }
}

function handleHexagonTouchStart(e) {
    e.preventDefault();
    const hexElement = e.currentTarget.closest('.hexagon') || e.currentTarget;
    if (!hexElement.dataset.hex) return;

    const hex = new Hex(...hexElement.dataset.hex.split(',').map(Number));
    const insect = gameState.board.get(hex.toString());

    if (insect && insect.player === gameState.currentPlayer) {
        const insectElement = hexElement.querySelector('.insect');
        if (insectElement) {
            const touch = e.touches[0];
            selectAndDragTouch(touch, insectElement, 'board', insect);
        }
    } else if (!insect) {
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        startPan(mouseEvent);
    }
}

function selectAndDrag(e, source, data) {
    if (dragState.isDragging) return;

    const element = e.target.closest('.insect') || e.target.closest('.hand-insect');
    if (!element) return;

    if (selectedElement && selectedElement !== element) {
        selectedElement.classList.remove('selected');
    }
    selectedElement = element;
    selectedElement.classList.add('selected');

    const rect = element.getBoundingClientRect();
    dragState.dragOffsetX = e.clientX - rect.left;
    dragState.dragOffsetY = e.clientY - rect.top;

    dragState.isDragging = false;
    dragState.dragSource = source;
    dragState.sourceData = data;
    dragState.dragElement = element;

    // Don't decrement counter yet - wait until drag actually starts
    // This prevents DOM changes during active touch/mouse interaction

    document.addEventListener('mousemove', beginDragOnMove);
    document.addEventListener('touchmove', beginDragOnMoveTouch, { passive: false });
    document.addEventListener('mouseup', cancelDragIfNotStarted);
    document.addEventListener('touchend', cancelDragIfNotStarted);
}

function selectAndDragTouch(touch, element, source, data) {
    if (dragState.isDragging) return;

    if (selectedElement && selectedElement !== element) {
        selectedElement.classList.remove('selected');
    }
    selectedElement = element;
    selectedElement.classList.add('selected');

    const rect = element.getBoundingClientRect();
    dragState.dragOffsetX = touch.clientX - rect.left;
    dragState.dragOffsetY = touch.clientY - rect.top;

    dragState.isDragging = false;
    dragState.dragSource = source;
    dragState.sourceData = data;
    dragState.dragElement = element;

    // Don't decrement counter yet - wait until drag actually starts
    // This prevents DOM changes during active touch/mouse interaction

    document.addEventListener('touchmove', beginDragOnMoveTouch, { passive: false });
    document.addEventListener('touchend', cancelDragIfNotStarted);
}

function beginDragOnMove(e) {
    if (dragState.isDragging) {
        handleDragMove(e);
        return;
    }

    dragState.isDragging = true;

    // Tag the insect being dragged from hand (don't modify game state yet)
    if (dragState.dragSource === 'hand') {
        dragState.draggedFromHand = dragState.sourceData;
        renderHand(); // Re-render to show reduced count visually
    }

    // For both hand and board insects, clone only the SVG and use consistent sizing
    const svg = dragState.dragElement.querySelector('svg');
    dragState.dragClone = document.createElement('div');
    dragState.dragClone.style.position = 'fixed';
    dragState.dragClone.style.zIndex = '1000';
    dragState.dragClone.style.pointerEvents = 'none';
    dragState.dragClone.style.transition = 'none';
    dragState.dragClone.style.transform = 'none';
    dragState.dragClone.style.width = '96px';
    dragState.dragClone.style.height = '96px';
    dragState.dragClone.style.display = 'flex';
    dragState.dragClone.style.alignItems = 'center';
    dragState.dragClone.style.justifyContent = 'center';

    if (svg) {
        dragState.dragClone.appendChild(svg.cloneNode(true));
    }

    // Adjust offset for hand insects (scale from 70px to 96px)
    if (dragState.dragSource === 'hand') {
        const handInsectSize = 70;
        const scaleRatio = 96 / handInsectSize;
        dragState.dragOffsetX *= scaleRatio;
        dragState.dragOffsetY *= scaleRatio;
    }

    document.body.appendChild(dragState.dragClone);
    dragState.dragElement.classList.add('insect-ghost');

    if (dragState.dragSource === 'hand') {
        const insectType = dragState.sourceData;
        const insectName = INSECT_TYPES[insectType]?.name || 'Insect';
        const playerLabel = document.getElementById(`player${gameState.currentPlayer}-dragging-label`);
        if (playerLabel) {
            playerLabel.textContent = `Place ${insectName}`;
            playerLabel.classList.add('show');
        }
    }

    document.removeEventListener('mousemove', beginDragOnMove);
    document.removeEventListener('touchmove', beginDragOnMoveTouch);
    document.removeEventListener('mouseup', cancelDragIfNotStarted);
    document.removeEventListener('touchend', cancelDragIfNotStarted);

    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('touchmove', handleDragMoveTouch, { passive: false });
    document.addEventListener('mouseup', handleDragEnd);
    document.addEventListener('touchend', handleDragEnd);

    handleDragMove(e);
}

function beginDragOnMoveTouch(e) {
    if (e.touches.length > 0) {
        e.preventDefault();
        const touch = e.touches[0];
        beginDragOnMove({ clientX: touch.clientX, clientY: touch.clientY });
    }
}

function cancelDragIfNotStarted(e) {
    if (!dragState.isDragging) {
        // Drag never started - just clean up
        document.removeEventListener('mousemove', beginDragOnMove);
        document.removeEventListener('touchmove', beginDragOnMoveTouch, { passive: false });
        document.removeEventListener('mouseup', cancelDragIfNotStarted);
        document.removeEventListener('touchend', cancelDragIfNotStarted);

        // Reset drag state (tag was never set since drag didn't start)
        dragState.isDragging = false;
        dragState.dragElement = null;
        dragState.dragSource = null;
        dragState.sourceData = null;
        dragState.draggedFromHand = null;
    }
}

function handleDragMove(e) {
    if (!dragState.isDragging || !dragState.dragClone) return;

    dragState.dragClone.style.left = (e.clientX - dragState.dragOffsetX) + 'px';
    dragState.dragClone.style.top = (e.clientY - dragState.dragOffsetY) + 'px';

    if (!dragState.highlightTimeout) {
        dragState.highlightTimeout = requestAnimationFrame(() => {
            updateDropZoneHighlight(e.clientX, e.clientY);
            dragState.highlightTimeout = null;
        });
    }
}

function handleDragMoveTouch(e) {
    if (!dragState.isDragging || !dragState.dragClone) return;

    if (e.touches.length > 0) {
        e.preventDefault();
        const touch = e.touches[0];
        handleDragMove({ clientX: touch.clientX, clientY: touch.clientY });
    }
}

function updateDropZoneHighlight(x, y) {
    const elementBelow = document.elementFromPoint(x, y);
    const hexElement = elementBelow?.closest('.hexagon');

    if (!hexElement || !hexElement.dataset.hex) {
        // Clear previous highlight if we're not over a valid hexagon
        if (dragState.lastHighlightedHex) {
            dragState.lastHighlightedHex.classList.remove('valid-move');
            dragState.lastHighlightedHex.style.removeProperty('--player-color');
            dragState.lastHighlightedHex = null;
        }
        return;
    }

    const hexKey = hexElement.dataset.hex;

    // Same hexagon - no need to update
    if (dragState.lastHighlightedHex === hexElement) {
        return;
    }

    // Clear previous highlight
    if (dragState.lastHighlightedHex) {
        dragState.lastHighlightedHex.classList.remove('valid-move');
        dragState.lastHighlightedHex.style.removeProperty('--player-color');
        dragState.lastHighlightedHex = null;
    }

    const hex = new Hex(...hexKey.split(',').map(Number));
    const playerColor = gameState.currentPlayer === 1 ? '#5599ff' : '#ffaa44';

    if (dragState.dragSource === 'hand') {
        if (!gameState.board.has(hexKey) && canPlaceInsect(hex)) {
            hexElement.style.setProperty('--player-color', playerColor);
            hexElement.classList.add('valid-move');
            dragState.lastHighlightedHex = hexElement;
        }
    } else if (dragState.dragSource === 'board') {
        if (!gameState.board.has(hexKey)) {
            hexElement.style.setProperty('--player-color', playerColor);
            hexElement.classList.add('valid-move');
            dragState.lastHighlightedHex = hexElement;
        }
    }
}

function handleDragEnd(e) {
    const wasDragging = dragState.isDragging;
    dragState.isDragging = false;

    if (dragState.highlightTimeout) {
        cancelAnimationFrame(dragState.highlightTimeout);
        dragState.highlightTimeout = null;
    }

    if (dragState.dragClone) {
        dragState.dragClone.remove();
        dragState.dragClone = null;
    }
    if (dragState.dragElement) {
        dragState.dragElement.classList.remove('insect-ghost');
    }

    document.querySelectorAll('.player-dragging-label').forEach(label => {
        label.classList.remove('show');
    });

    // Clear all valid-move highlights (belt and suspenders approach)
    document.querySelectorAll('.hexagon.valid-move').forEach(hex => {
        hex.classList.remove('valid-move');
        hex.style.removeProperty('--player-color');
    });
    dragState.lastHighlightedHex = null;

    if (wasDragging) {
        const dropElement = document.elementFromPoint(e.clientX, e.clientY);
        const hexElement = dropElement?.closest('.hexagon');

        if (hexElement) {
            const hex = new Hex(...hexElement.dataset.hex.split(',').map(Number));

            if (dragState.dragSource === 'hand') {
                const placed = placeInsect(hex, dragState.sourceData);
                if (!placed) {
                    // Placement failed - clear the tag and re-render to restore visual count
                    dragState.draggedFromHand = null;
                    renderHand();
                }
                // If placement succeeded, placeInsect already decremented the counter and tag is cleared below
            } else if (dragState.dragSource === 'board') {
                moveInsect(dragState.sourceData, hex);
            }
        } else {
            // Dropped on invalid location - clear tag and re-render to restore visual count
            if (dragState.dragSource === 'hand' && dragState.draggedFromHand) {
                dragState.draggedFromHand = null;
                renderHand();
            }
        }
    }

    // Clear all drag state
    dragState.isDragging = false;
    dragState.dragElement = null;
    dragState.dragClone = null;
    dragState.dragOffsetX = 0;
    dragState.dragOffsetY = 0;
    dragState.dragSource = null;
    dragState.sourceData = null;
    dragState.draggedFromHand = null;
    dragState.highlightTimeout = null;
    dragState.lastHighlightedHex = null;

    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('touchmove', handleDragMoveTouch, { passive: false });
    document.removeEventListener('mouseup', handleDragEnd);
    document.removeEventListener('touchend', handleDragEnd);
    document.removeEventListener('mousemove', beginDragOnMove);
    document.removeEventListener('touchmove', beginDragOnMoveTouch, { passive: false });
    document.removeEventListener('mouseup', cancelDragIfNotStarted);
    document.removeEventListener('touchend', cancelDragIfNotStarted);
}

// ============================================
// GAME LOGIC
// ============================================

function placeInsect(hex, insectType) {
    const hexKey = hex.toString();

    console.log('Placing insect type:', insectType, 'Name:', INSECT_TYPES[insectType]?.name);

    // Tournament rule: Queen cannot be placed on first turn
    if (gameConfig.tournamentRules && insectType === 'queen' && gameState.turnCount[gameState.currentPlayer] === 0) {
        console.log('Failed: Tournament rules - Queen cannot be placed on first turn');
        showPlayerMessage('Tournament rules: Queen cannot be placed on turn 1');
        return false;
    }

    // Rule: Queen MUST be placed by turn 4
    if (!gameState.queenPlaced[gameState.currentPlayer] &&
        gameState.turnCount[gameState.currentPlayer] === 3 &&
        insectType !== 'queen') {
        console.log('Failed: Queen must be placed by turn 4');
        showPlayerMessage('You must place your Queen now!');
        return false;
    }

    if (gameState.board.has(hexKey)) {
        console.log('Failed: Hexagon already occupied');
        showPlayerMessage('Space already occupied');
        return false;
    }

    if (gameState.board.size > 0 && !canPlaceInsect(hex)) {
        console.log('Failed: Invalid placement location');
        showPlayerMessage('Must touch only your pieces');
        return false;
    }

    const insectId = `${gameState.currentPlayer}-${insectType}-${Date.now()}`;
    gameState.board.set(hexKey, {
        player: gameState.currentPlayer,
        insect: insectType,
        id: insectId
    });

    // Now commit the change - decrement the actual counter
    gameState.hand[`player${gameState.currentPlayer}`][insectType]--;

    // Clear the drag tag since placement succeeded
    dragState.draggedFromHand = null;

    if (insectType === 'queen') {
        gameState.queenPlaced[gameState.currentPlayer] = true;
    }

    renderGame();
    checkWinCondition();
    endTurn();
    return true;
}

function canPlaceInsect(hex) {
    const neighbors = hex.getNeighbors();
    const opponentPlayer = gameState.currentPlayer === 1 ? 2 : 1;
    const currentPlayer = gameState.currentPlayer;

    // Count pieces on the board for each player
    let currentPlayerPieces = 0;
    let opponentPieces = 0;
    for (let [hexKey, insect] of gameState.board) {
        if (insect.player === currentPlayer) currentPlayerPieces++;
        if (insect.player === opponentPlayer) opponentPieces++;
    }

    // First piece: can be placed anywhere (no restrictions)
    if (currentPlayerPieces === 0 && opponentPieces === 0) {
        return true;
    }

    // Second piece (opponent's first piece already placed): must touch opponent
    if (currentPlayerPieces === 0 && opponentPieces > 0) {
        return neighbors.some(n => {
            const insect = gameState.board.get(n.toString());
            return insect && insect.player === opponentPlayer;
        });
    }

    // After first piece: must touch friendly pieces only, NOT opponent pieces
    const hasFriendlyNeighbor = neighbors.some(n => {
        const insect = gameState.board.get(n.toString());
        return insect && insect.player === currentPlayer;
    });

    const hasOpponentNeighbor = neighbors.some(n => {
        const insect = gameState.board.get(n.toString());
        return insect && insect.player === opponentPlayer;
    });

    return hasFriendlyNeighbor && !hasOpponentNeighbor;
}

function moveInsect(insect, targetHex) {
    // Rule: Cannot move insects until Queen is placed
    if (!gameState.queenPlaced[gameState.currentPlayer]) {
        console.log('Failed: Cannot move insects until Queen is placed');
        showPlayerMessage('Place your Queen first to move');
        return;
    }

    // Tournament rule: No bee can be moved in round 1
    if (gameConfig.tournamentRules &&
        insect.insect === 'queen' &&
        gameState.turnCount[gameState.currentPlayer] === 0) {
        console.log('Failed: Tournament rules - Queen cannot move on first turn');
        showPlayerMessage('Tournament rules: Queen cannot move on turn 1');
        return;
    }

    let currentHex = null;
    for (let [hexKey, bug] of gameState.board) {
        if (bug.id === insect.id) {
            currentHex = Hex.fromString(hexKey);
            break;
        }
    }

    if (!currentHex) return;

    const targetKey = targetHex.toString();
    if (gameState.board.has(targetKey)) {
        showPlayerMessage('Space already occupied');
        return;
    }

    // Rule: Cannot move if it breaks hive connectivity (One Hive rule)
    if (!isHiveConnectedWithout(currentHex)) {
        console.log('Failed: Moving this insect would break hive connectivity');
        showPlayerMessage('Move would split the hive');
        return;
    }

    gameState.board.delete(currentHex.toString());
    gameState.board.set(targetKey, insect);

    renderGame();
    checkWinCondition();
    endTurn();
}

function isHiveConnectedWithout(excludeHex) {
    // Check if the hive remains connected when removing the insect at excludeHex
    const excludeKey = excludeHex.toString();

    // Get all insects except the one at excludeHex
    const remainingInsects = [];
    for (let [hexKey, insect] of gameState.board) {
        if (hexKey !== excludeKey) {
            remainingInsects.push(hexKey);
        }
    }

    // If only one or zero insects remain, they're always connected
    if (remainingInsects.length <= 1) {
        return true;
    }

    // Use BFS to check if all remaining insects are connected
    const visited = new Set();
    const queue = [remainingInsects[0]]; // Start from first remaining insect
    visited.add(remainingInsects[0]);

    while (queue.length > 0) {
        const currentKey = queue.shift();
        const currentHex = Hex.fromString(currentKey);
        const neighbors = currentHex.getNeighbors();

        for (let neighbor of neighbors) {
            const neighborKey = neighbor.toString();
            // Check if this neighbor has an insect and hasn't been visited
            if (gameState.board.has(neighborKey) &&
                neighborKey !== excludeKey &&
                !visited.has(neighborKey)) {
                visited.add(neighborKey);
                queue.push(neighborKey);
            }
        }
    }

    // The hive is connected if we visited all remaining insects
    return visited.size === remainingInsects.length;
}

function endTurn() {
    gameState.turn++;
    gameState.turnCount[gameState.currentPlayer]++;
    gameState.currentPlayer = gameState.currentPlayer === 1 ? 2 : 1;
    clearPlayerMessage(); // Clear message when turn ends
    renderGame();

    // Close setup popup and update rules visibility after first move
    if (gameState.turn === 1) {
        closeGameSetup();
    }
    updateGameRulesVisibility();
}

let messageTimeout = null;

function showPlayerMessage(message) {
    const messageEl = document.getElementById(`player${gameState.currentPlayer}-message`);
    if (messageEl) {
        messageEl.textContent = message;
        messageEl.classList.add('show');

        // Clear any existing timeout
        if (messageTimeout) {
            clearTimeout(messageTimeout);
        }

        // Auto-hide after 3 seconds
        messageTimeout = setTimeout(() => {
            messageEl.classList.remove('show');
            messageTimeout = null;
        }, 3000);
    }
}

function clearPlayerMessage() {
    for (let p = 1; p <= 2; p++) {
        const messageEl = document.getElementById(`player${p}-message`);
        if (messageEl) {
            messageEl.classList.remove('show');
        }
    }
    if (messageTimeout) {
        clearTimeout(messageTimeout);
        messageTimeout = null;
    }
}

function checkWinCondition() {
    for (let [hexKey, insect] of gameState.board) {
        if (insect.insect === 'queen') {
            const hex = Hex.fromString(hexKey);
            const neighbors = hex.getNeighbors();
            const adjacentInsects = neighbors.filter(n => {
                const adj = gameState.board.get(n.toString());
                return adj && adj.player !== insect.player;
            });

            if (adjacentInsects.length === 6) {
                gameState.gameOver = true;
                gameState.winner = insect.player === 1 ? 2 : 1;
                showVictory();
                return;
            }
        }
    }
}

function canPassTurn() {
    return gameState.queenPlaced[gameState.currentPlayer] || gameState.turnCount[gameState.currentPlayer] >= 2;
}

function initializeHand() {
    for (let player of [1, 2]) {
        gameState.hand[`player${player}`] = {};
        for (let type in INSECT_TYPES) {
            const insectData = INSECT_TYPES[type];
            // Only include expansion pieces if they're enabled
            if (insectData.expansion) {
                if ((type === 'mosquito' && gameConfig.expansionMosquito) ||
                    (type === 'ladybug' && gameConfig.expansionLadybug) ||
                    (type === 'pillbug' && gameConfig.expansionPillbug)) {
                    gameState.hand[`player${player}`][type] = insectData.count;
                } else {
                    gameState.hand[`player${player}`][type] = 0;
                }
            } else {
                gameState.hand[`player${player}`][type] = insectData.count;
            }
        }
    }
}

// ============================================
// INSECT SVG CREATION
// ============================================

function createInsectSVG(type, player) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    const color = player === 1 ? '#5599ff' : '#ffaa44';

    // Create a group for scaling (all insects except queen are 20% smaller)
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    if (type !== 'queen') {
        // Scale down by 20% (0.8 scale) and center
        group.setAttribute('transform', 'translate(50, 50) scale(0.8) translate(-50, -50)');
    }
    svg.appendChild(group);

    switch (type) {
        case 'queen':
            createQueenSVG(group, color);
            break;
        case 'ant':
            createAntSVG(group, color);
            break;
        case 'beetle':
            createBeetleSVG(group, color);
            break;
        case 'hopper':
            createHopperSVG(group, color);
            break;
        case 'spider':
            createSpiderSVG(group, color);
            break;
        case 'mosquito':
            createMosquitoSVG(group, color);
            break;
        case 'ladybug':
            createLadybugSVG(group, color);
            break;
        case 'pillbug':
            createPillbugSVG(group, color);
            break;
    }

    return svg;
}

function createQueenSVG(svg, color) {
    // Black legs - 6 legs, draw first
    for (let side of [-1, 1]) {
        for (let y of [38, 48, 58]) {
            const leg = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            leg.setAttribute('x1', '50');
            leg.setAttribute('y1', y);
            leg.setAttribute('x2', 50 + side * 22);
            leg.setAttribute('y2', y + 12);
            leg.setAttribute('stroke', '#000');
            leg.setAttribute('stroke-width', '2');
            leg.setAttribute('stroke-linecap', 'round');
            svg.appendChild(leg);
        }
    }

    // Large body/abdomen (player color with black stripes)
    const body = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    body.setAttribute('cx', '50');
    body.setAttribute('cy', '55');
    body.setAttribute('rx', '20');
    body.setAttribute('ry', '32');
    body.setAttribute('fill', color);
    body.setAttribute('stroke', '#000');
    body.setAttribute('stroke-width', '2');
    svg.appendChild(body);

    // Black stripes on body
    for (let i = 0; i < 4; i++) {
        const stripe = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        stripe.setAttribute('cx', '50');
        stripe.setAttribute('cy', 32 + i * 12);
        stripe.setAttribute('rx', '20');
        stripe.setAttribute('ry', '3');
        stripe.setAttribute('fill', '#000');
        stripe.setAttribute('opacity', '0.7');
        svg.appendChild(stripe);
    }

    // 4 Wings overlaying the body - anchored at spine edges, further out
    // Upper wings (100 degree spread = 50 degrees each side)
    const upperLeftWing = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    upperLeftWing.setAttribute('cx', '22');
    upperLeftWing.setAttribute('cy', '42');
    upperLeftWing.setAttribute('rx', '16');
    upperLeftWing.setAttribute('ry', '26');
    upperLeftWing.setAttribute('fill', 'white');
    upperLeftWing.setAttribute('stroke', '#000');
    upperLeftWing.setAttribute('stroke-width', '1.5');
    upperLeftWing.setAttribute('opacity', '0.85');
    upperLeftWing.setAttribute('transform', 'rotate(-50 22 42)');
    svg.appendChild(upperLeftWing);

    const upperRightWing = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    upperRightWing.setAttribute('cx', '78');
    upperRightWing.setAttribute('cy', '42');
    upperRightWing.setAttribute('rx', '16');
    upperRightWing.setAttribute('ry', '26');
    upperRightWing.setAttribute('fill', 'white');
    upperRightWing.setAttribute('stroke', '#000');
    upperRightWing.setAttribute('stroke-width', '1.5');
    upperRightWing.setAttribute('opacity', '0.85');
    upperRightWing.setAttribute('transform', 'rotate(50 78 42)');
    svg.appendChild(upperRightWing);

    // Lower wings (70 degree spread = 35 degrees each side) - oriented downward
    const lowerLeftWing = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    lowerLeftWing.setAttribute('cx', '26');
    lowerLeftWing.setAttribute('cy', '58');
    lowerLeftWing.setAttribute('rx', '13');
    lowerLeftWing.setAttribute('ry', '20');
    lowerLeftWing.setAttribute('fill', 'white');
    lowerLeftWing.setAttribute('stroke', '#000');
    lowerLeftWing.setAttribute('stroke-width', '1.5');
    lowerLeftWing.setAttribute('opacity', '0.8');
    lowerLeftWing.setAttribute('transform', 'rotate(-70 26 58)');
    svg.appendChild(lowerLeftWing);

    const lowerRightWing = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    lowerRightWing.setAttribute('cx', '74');
    lowerRightWing.setAttribute('cy', '58');
    lowerRightWing.setAttribute('rx', '13');
    lowerRightWing.setAttribute('ry', '20');
    lowerRightWing.setAttribute('fill', 'white');
    lowerRightWing.setAttribute('stroke', '#000');
    lowerRightWing.setAttribute('stroke-width', '1.5');
    lowerRightWing.setAttribute('opacity', '0.8');
    lowerRightWing.setAttribute('transform', 'rotate(70 74 58)');
    svg.appendChild(lowerRightWing);

    // Wing veins
    for (let wingPos of [{x: 22, y: 42, r: -50}, {x: 78, y: 42, r: 50}, {x: 26, y: 58, r: -70}, {x: 74, y: 58, r: 70}]) {
        const vein = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        vein.setAttribute('x1', wingPos.x);
        vein.setAttribute('y1', wingPos.y - 10);
        vein.setAttribute('x2', wingPos.x);
        vein.setAttribute('y2', wingPos.y + 10);
        vein.setAttribute('stroke', '#000');
        vein.setAttribute('stroke-width', '0.5');
        vein.setAttribute('opacity', '0.4');
        svg.appendChild(vein);
    }

    // Head (player color)
    const head = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    head.setAttribute('cx', '50');
    head.setAttribute('cy', '18');
    head.setAttribute('r', '12');
    head.setAttribute('fill', color);
    head.setAttribute('stroke', '#000');
    head.setAttribute('stroke-width', '2');
    svg.appendChild(head);

    // Antennae (black)
    for (let side of [-1, 1]) {
        const antenna = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        antenna.setAttribute('d', `M ${50 + side * 6} 10 Q ${50 + side * 15} 0 ${50 + side * 14} -5`);
        antenna.setAttribute('fill', 'none');
        antenna.setAttribute('stroke', '#000');
        antenna.setAttribute('stroke-width', '2');
        antenna.setAttribute('stroke-linecap', 'round');
        svg.appendChild(antenna);
    }

    // Eyes (black)
    for (let side of [-5, 5]) {
        const eye = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        eye.setAttribute('cx', 50 + side);
        eye.setAttribute('cy', '16');
        eye.setAttribute('r', '2');
        eye.setAttribute('fill', '#000');
        svg.appendChild(eye);
    }
}

function createAntSVG(svg, color) {
    // Black legs - draw first
    for (let side of [-1, 1]) {
        for (let y of [35, 50, 65]) {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', '50');
            line.setAttribute('y1', y);
            line.setAttribute('x2', 50 + side * 30);
            line.setAttribute('y2', y + 10);
            line.setAttribute('stroke', '#000');
            line.setAttribute('stroke-width', '2');
            line.setAttribute('stroke-linecap', 'round');
            svg.appendChild(line);
        }
    }

    // Abdomen (player color)
    const body2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    body2.setAttribute('cx', '50');
    body2.setAttribute('cy', '75');
    body2.setAttribute('r', '14');
    body2.setAttribute('fill', color);
    body2.setAttribute('stroke', '#000');
    body2.setAttribute('stroke-width', '2');
    svg.appendChild(body2);

    // Thorax (player color)
    const body1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    body1.setAttribute('cx', '50');
    body1.setAttribute('cy', '50');
    body1.setAttribute('r', '18');
    body1.setAttribute('fill', color);
    body1.setAttribute('stroke', '#000');
    body1.setAttribute('stroke-width', '2');
    svg.appendChild(body1);

    // Head (player color)
    const head = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    head.setAttribute('cx', '50');
    head.setAttribute('cy', '25');
    head.setAttribute('r', '15');
    head.setAttribute('fill', color);
    head.setAttribute('stroke', '#000');
    head.setAttribute('stroke-width', '2');
    svg.appendChild(head);

    // Antennae (black)
    for (let side of [-1, 1]) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', 50 + side * 8);
        line.setAttribute('y1', '15');
        line.setAttribute('x2', 50 + side * 20);
        line.setAttribute('y2', '5');
        line.setAttribute('stroke', '#000');
        line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke-linecap', 'round');
        svg.appendChild(line);
    }
}

function createBeetleSVG(svg, color) {
    // Black legs - draw first
    for (let side of [-1, 1]) {
        for (let y of [40, 50, 60]) {
            const leg = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            leg.setAttribute('x1', '50');
            leg.setAttribute('y1', y);
            leg.setAttribute('x2', 50 + side * 28);
            leg.setAttribute('y2', y + 20);
            leg.setAttribute('stroke', '#000');
            leg.setAttribute('stroke-width', '2.5');
            leg.setAttribute('stroke-linecap', 'round');
            svg.appendChild(leg);
        }
    }

    // Shell/body (player color)
    const shell = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    shell.setAttribute('cx', '50');
    shell.setAttribute('cy', '55');
    shell.setAttribute('rx', '32');
    shell.setAttribute('ry', '35');
    shell.setAttribute('fill', color);
    shell.setAttribute('stroke', '#000');
    shell.setAttribute('stroke-width', '2');
    svg.appendChild(shell);

    // Wing covers with subtle pattern
    const leftWing = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    leftWing.setAttribute('cx', '35');
    leftWing.setAttribute('cy', '55');
    leftWing.setAttribute('rx', '14');
    leftWing.setAttribute('ry', '32');
    leftWing.setAttribute('fill', 'rgba(0,0,0,0.1)');
    leftWing.setAttribute('stroke', 'none');
    svg.appendChild(leftWing);

    const rightWing = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    rightWing.setAttribute('cx', '65');
    rightWing.setAttribute('cy', '55');
    rightWing.setAttribute('rx', '14');
    rightWing.setAttribute('ry', '32');
    rightWing.setAttribute('fill', 'rgba(0,0,0,0.1)');
    rightWing.setAttribute('stroke', 'none');
    svg.appendChild(rightWing);

    // Center line on shell
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '50');
    line.setAttribute('y1', '25');
    line.setAttribute('x2', '50');
    line.setAttribute('y2', '88');
    line.setAttribute('stroke', '#000');
    line.setAttribute('stroke-width', '1.5');
    svg.appendChild(line);

    // Head (black - special for beetle)
    const head = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    head.setAttribute('cx', '50');
    head.setAttribute('cy', '18');
    head.setAttribute('r', '12');
    head.setAttribute('fill', '#000');
    head.setAttribute('stroke', '#000');
    head.setAttribute('stroke-width', '1.5');
    svg.appendChild(head);

    // Horns (black - special for beetle)
    for (let side of [-1, 1]) {
        const horn = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        horn.setAttribute('d', `M ${50 + side * 6} 12 Q ${50 + side * 10} 5 ${50 + side * 8} 0`);
        horn.setAttribute('fill', 'none');
        horn.setAttribute('stroke', '#000');
        horn.setAttribute('stroke-width', '2.5');
        horn.setAttribute('stroke-linecap', 'round');
        svg.appendChild(horn);
    }

    // Eyes
    for (let side of [-4, 4]) {
        const eye = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        eye.setAttribute('cx', 50 + side);
        eye.setAttribute('cy', '16');
        eye.setAttribute('r', '1.5');
        eye.setAttribute('fill', '#fff');
        svg.appendChild(eye);
    }
}

function createHopperSVG(svg, color) {
    // Long body drawn first (under legs)
    // Abdomen (player color) - long and segmented looking
    const abdomen = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    abdomen.setAttribute('cx', '50');
    abdomen.setAttribute('cy', '68');
    abdomen.setAttribute('rx', '16');
    abdomen.setAttribute('ry', '20');
    abdomen.setAttribute('fill', color);
    abdomen.setAttribute('stroke', '#000');
    abdomen.setAttribute('stroke-width', '2');
    svg.appendChild(abdomen);

    // Thorax (player color) - where legs attach
    const body = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    body.setAttribute('cx', '50');
    body.setAttribute('cy', '45');
    body.setAttribute('rx', '16');
    body.setAttribute('ry', '18');
    body.setAttribute('fill', color);
    body.setAttribute('stroke', '#000');
    body.setAttribute('stroke-width', '2');
    svg.appendChild(body);

    // 6 legs anchored to front of the body (thorax area)
    // All legs attach near y=40-50 (front of body)

    // 2 Powerful hind legs (player colored - special for grasshopper!)
    // Left hind leg - thick femur, thin tibia
    const leftHindLegFemur = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    leftHindLegFemur.setAttribute('d', 'M 38 50 Q 20 56 15 70');
    leftHindLegFemur.setAttribute('fill', 'none');
    leftHindLegFemur.setAttribute('stroke', color);
    leftHindLegFemur.setAttribute('stroke-width', '6');
    leftHindLegFemur.setAttribute('stroke-linecap', 'round');
    svg.appendChild(leftHindLegFemur);

    const leftHindLegTibia = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    leftHindLegTibia.setAttribute('d', 'M 15 70 Q 8 80 5 92');
    leftHindLegTibia.setAttribute('fill', 'none');
    leftHindLegTibia.setAttribute('stroke', color);
    leftHindLegTibia.setAttribute('stroke-width', '2.5');
    leftHindLegTibia.setAttribute('stroke-linecap', 'round');
    svg.appendChild(leftHindLegTibia);

    // Right hind leg - thick femur, thin tibia
    const rightHindLegFemur = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    rightHindLegFemur.setAttribute('d', 'M 62 50 Q 80 56 85 70');
    rightHindLegFemur.setAttribute('fill', 'none');
    rightHindLegFemur.setAttribute('stroke', color);
    rightHindLegFemur.setAttribute('stroke-width', '6');
    rightHindLegFemur.setAttribute('stroke-linecap', 'round');
    svg.appendChild(rightHindLegFemur);

    const rightHindLegTibia = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    rightHindLegTibia.setAttribute('d', 'M 85 70 Q 92 80 95 92');
    rightHindLegTibia.setAttribute('fill', 'none');
    rightHindLegTibia.setAttribute('stroke', color);
    rightHindLegTibia.setAttribute('stroke-width', '2.5');
    rightHindLegTibia.setAttribute('stroke-linecap', 'round');
    svg.appendChild(rightHindLegTibia);

    // Middle 2 legs (player colored, anchored at front)
    for (let side of [-1, 1]) {
        const midLeg1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        midLeg1.setAttribute('x1', 50 + side * 12);
        midLeg1.setAttribute('y1', '45');
        midLeg1.setAttribute('x2', 50 + side * 24);
        midLeg1.setAttribute('y2', '55');
        midLeg1.setAttribute('stroke', color);
        midLeg1.setAttribute('stroke-width', '2.5');
        midLeg1.setAttribute('stroke-linecap', 'round');
        svg.appendChild(midLeg1);

        const midLeg2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        midLeg2.setAttribute('x1', 50 + side * 24);
        midLeg2.setAttribute('y1', '55');
        midLeg2.setAttribute('x2', 50 + side * 30);
        midLeg2.setAttribute('y2', '68');
        midLeg2.setAttribute('stroke', color);
        midLeg2.setAttribute('stroke-width', '2');
        midLeg2.setAttribute('stroke-linecap', 'round');
        svg.appendChild(midLeg2);
    }

    // Front 2 legs (player colored, anchored at front)
    for (let side of [-1, 1]) {
        const frontLeg1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        frontLeg1.setAttribute('x1', 50 + side * 10);
        frontLeg1.setAttribute('y1', '38');
        frontLeg1.setAttribute('x2', 50 + side * 18);
        frontLeg1.setAttribute('y2', '45');
        frontLeg1.setAttribute('stroke', color);
        frontLeg1.setAttribute('stroke-width', '2');
        frontLeg1.setAttribute('stroke-linecap', 'round');
        svg.appendChild(frontLeg1);

        const frontLeg2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        frontLeg2.setAttribute('x1', 50 + side * 18);
        frontLeg2.setAttribute('y1', '45');
        frontLeg2.setAttribute('x2', 50 + side * 24);
        frontLeg2.setAttribute('y2', '54');
        frontLeg2.setAttribute('stroke', color);
        frontLeg2.setAttribute('stroke-width', '1.5');
        frontLeg2.setAttribute('stroke-linecap', 'round');
        svg.appendChild(frontLeg2);
    }

    // Head (player color) - elongated
    const head = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    head.setAttribute('cx', '50');
    head.setAttribute('cy', '22');
    head.setAttribute('rx', '11');
    head.setAttribute('ry', '13');
    head.setAttribute('fill', color);
    head.setAttribute('stroke', '#000');
    head.setAttribute('stroke-width', '2');
    svg.appendChild(head);

    // Antennae (thin, player colored)
    for (let side of [-1, 1]) {
        const antenna = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        antenna.setAttribute('d', `M ${50 + side * 6} 15 Q ${50 + side * 12} 8 ${50 + side * 15} 2`);
        antenna.setAttribute('fill', 'none');
        antenna.setAttribute('stroke', color);
        antenna.setAttribute('stroke-width', '1.5');
        antenna.setAttribute('stroke-linecap', 'round');
        svg.appendChild(antenna);
    }

    // Large compound eyes (black)
    for (let side of [-6, 6]) {
        const eye = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        eye.setAttribute('cx', 50 + side);
        eye.setAttribute('cy', '20');
        eye.setAttribute('r', '4');
        eye.setAttribute('fill', '#000');
        svg.appendChild(eye);

        const shine = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        shine.setAttribute('cx', 50 + side + 1);
        shine.setAttribute('cy', '19');
        shine.setAttribute('r', '1.5');
        shine.setAttribute('fill', 'rgba(255,255,255,0.7)');
        svg.appendChild(shine);
    }
}

function createLadybugSVG(svg, color) {
    // Black legs - draw first
    for (let side of [-1, 1]) {
        for (let y of [45, 55, 65]) {
            const leg = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            leg.setAttribute('x1', '50');
            leg.setAttribute('y1', y);
            leg.setAttribute('x2', 50 + side * 25);
            leg.setAttribute('y2', y + 12);
            leg.setAttribute('stroke', '#000');
            leg.setAttribute('stroke-width', '2');
            leg.setAttribute('stroke-linecap', 'round');
            svg.appendChild(leg);
        }
    }

    // Shell/wings (player color)
    const shell = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    shell.setAttribute('cx', '50');
    shell.setAttribute('cy', '60');
    shell.setAttribute('rx', '28');
    shell.setAttribute('ry', '32');
    shell.setAttribute('fill', color);
    shell.setAttribute('stroke', '#000');
    shell.setAttribute('stroke-width', '2');
    svg.appendChild(shell);

    // Center line (black)
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '50');
    line.setAttribute('y1', '30');
    line.setAttribute('x2', '50');
    line.setAttribute('y2', '90');
    line.setAttribute('stroke', '#000');
    line.setAttribute('stroke-width', '1.5');
    svg.appendChild(line);

    // Spots (black)
    const positions = [
        { x: 35, y: 45 }, { x: 35, y: 60 }, { x: 35, y: 75 },
        { x: 65, y: 45 }, { x: 65, y: 60 }, { x: 65, y: 75 }
    ];

    positions.forEach(pos => {
        const spot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        spot.setAttribute('cx', pos.x);
        spot.setAttribute('cy', pos.y);
        spot.setAttribute('r', '4');
        spot.setAttribute('fill', '#000');
        svg.appendChild(spot);
    });

    // Head (black)
    const head = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    head.setAttribute('cx', '50');
    head.setAttribute('cy', '25');
    head.setAttribute('r', '12');
    head.setAttribute('fill', '#000');
    head.setAttribute('stroke', '#000');
    head.setAttribute('stroke-width', '2');
    svg.appendChild(head);

    // Eyes (white)
    for (let side of [-4, 4]) {
        const eye = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        eye.setAttribute('cx', 50 + side);
        eye.setAttribute('cy', '23');
        eye.setAttribute('r', '2');
        eye.setAttribute('fill', '#fff');
        svg.appendChild(eye);
    }
}

function createSpiderSVG(svg, color) {
    // 8 long black jointed legs surrounding the body
    // Pattern: 2 forward, 4 middle (2 forward-facing, 2 back-facing), 2 backward
    const legConfigs = [
        // 2 forward legs (left and right) - pointing upward
        { side: -1, baseAngle: -135, endAngle: -160 },  // Left forward
        { side: 1, baseAngle: -135, endAngle: -160 },   // Right forward

        // 4 middle legs - 2 forward-facing
        { side: -1, baseAngle: -90, endAngle: -115 },  // Left middle-forward
        { side: 1, baseAngle: -90, endAngle: -115 },   // Right middle-forward

        // 4 middle legs - 2 back-facing
        { side: -1, baseAngle: 0, endAngle: 25 },     // Left middle-back
        { side: 1, baseAngle: 0, endAngle: 25 },      // Right middle-back

        // 2 backward legs (left and right) - pointing downward
        { side: -1, baseAngle: 45, endAngle: 70 },     // Left backward
        { side: 1, baseAngle: 45, endAngle: 70 }       // Right backward
    ];

    let legIndex = 0;
    legConfigs.forEach(leg => {
        // Calculate positions for two-segment jointed leg
        const baseRad = (leg.baseAngle + 90) * Math.PI / 180;
        const endRad = (leg.endAngle + 90) * Math.PI / 180;

        const baseX = 50 + leg.side * 12;
        const baseY = 48;

        // Middle-back legs (indices 4-5) are longer
        const firstSegmentLength = (legIndex >= 4 && legIndex <= 5) ? 22 : 18;
        const secondSegmentLength = (legIndex >= 4 && legIndex <= 5) ? 26 : 20;

        const jointX = baseX + leg.side * firstSegmentLength * Math.cos(baseRad);
        const jointY = baseY + firstSegmentLength * Math.sin(baseRad);

        const endX = jointX + leg.side * secondSegmentLength * Math.cos(endRad);
        const endY = jointY + secondSegmentLength * Math.sin(endRad);

        // First segment (femur) - thicker
        const segment1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        segment1.setAttribute('x1', baseX);
        segment1.setAttribute('y1', baseY);
        segment1.setAttribute('x2', jointX);
        segment1.setAttribute('y2', jointY);
        segment1.setAttribute('stroke', '#000');
        segment1.setAttribute('stroke-width', '2.5');
        segment1.setAttribute('stroke-linecap', 'round');
        svg.appendChild(segment1);

        // Second segment (tibia) - thinner
        const segment2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        segment2.setAttribute('x1', jointX);
        segment2.setAttribute('y1', jointY);
        segment2.setAttribute('x2', endX);
        segment2.setAttribute('y2', endY);
        segment2.setAttribute('stroke', '#000');
        segment2.setAttribute('stroke-width', '2');
        segment2.setAttribute('stroke-linecap', 'round');
        svg.appendChild(segment2);

        // Joint marker (small circle at joint)
        const joint = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        joint.setAttribute('cx', jointX);
        joint.setAttribute('cy', jointY);
        joint.setAttribute('r', '1.5');
        joint.setAttribute('fill', '#000');
        svg.appendChild(joint);

        // Add larger feet (tarsi) to the front 2 legs (first 2 in the array)
        if (legIndex < 2) {
            const foot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            foot.setAttribute('cx', endX);
            foot.setAttribute('cy', endY);
            foot.setAttribute('r', '2.5');
            foot.setAttribute('fill', '#000');
            svg.appendChild(foot);
        }

        legIndex++;
    });

    // Small abdomen (player color) - rear segment
    const abdomen = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    abdomen.setAttribute('cx', '50');
    abdomen.setAttribute('cy', '58');
    abdomen.setAttribute('rx', '14');
    abdomen.setAttribute('ry', '16');
    abdomen.setAttribute('fill', color);
    abdomen.setAttribute('stroke', '#000');
    abdomen.setAttribute('stroke-width', '2');
    svg.appendChild(abdomen);

    // Small cephalothorax (player color) - head+thorax combined
    const cephalothorax = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    cephalothorax.setAttribute('cx', '50');
    cephalothorax.setAttribute('cy', '38');
    cephalothorax.setAttribute('rx', '12');
    cephalothorax.setAttribute('ry', '14');
    cephalothorax.setAttribute('fill', color);
    cephalothorax.setAttribute('stroke', '#000');
    cephalothorax.setAttribute('stroke-width', '2');
    svg.appendChild(cephalothorax);

    // 8 eyes arranged in typical spider pattern
    const eyePositions = [
        // Front row (4 eyes)
        { x: 44, y: 32 }, { x: 48, y: 31 }, { x: 52, y: 31 }, { x: 56, y: 32 },
        // Back row (4 eyes)
        { x: 42, y: 36 }, { x: 48, y: 37 }, { x: 52, y: 37 }, { x: 58, y: 36 }
    ];

    eyePositions.forEach(pos => {
        const eye = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        eye.setAttribute('cx', pos.x);
        eye.setAttribute('cy', pos.y);
        eye.setAttribute('r', '1.2');
        eye.setAttribute('fill', '#000');
        svg.appendChild(eye);
    });
}

function createMosquitoSVG(svg, color) {
    // Small body parts first (under wings and legs)
    // Abdomen (player color) - long thin segment
    const abdomen = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    abdomen.setAttribute('cx', '50');
    abdomen.setAttribute('cy', '65');
    abdomen.setAttribute('rx', '6');
    abdomen.setAttribute('ry', '24');
    abdomen.setAttribute('fill', color);
    abdomen.setAttribute('stroke', '#000');
    abdomen.setAttribute('stroke-width', '1.5');
    svg.appendChild(abdomen);

    // Thorax (player color) - small
    const thorax = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    thorax.setAttribute('cx', '50');
    thorax.setAttribute('cy', '38');
    thorax.setAttribute('rx', '8');
    thorax.setAttribute('ry', '10');
    thorax.setAttribute('fill', color);
    thorax.setAttribute('stroke', '#000');
    thorax.setAttribute('stroke-width', '1.5');
    svg.appendChild(thorax);

    // Head (player color) - small
    const head = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    head.setAttribute('cx', '50');
    head.setAttribute('cy', '20');
    head.setAttribute('r', '7');
    head.setAttribute('fill', color);
    head.setAttribute('stroke', '#000');
    head.setAttribute('stroke-width', '1.5');
    svg.appendChild(head);

    // 2 large wings in V-shape extending back from head (white with black outline)
    const leftWing = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    leftWing.setAttribute('cx', '25');
    leftWing.setAttribute('cy', '50');
    leftWing.setAttribute('rx', '12');
    leftWing.setAttribute('ry', '35');
    leftWing.setAttribute('fill', 'white');
    leftWing.setAttribute('stroke', '#000');
    leftWing.setAttribute('stroke-width', '1.5');
    leftWing.setAttribute('opacity', '0.9');
    leftWing.setAttribute('transform', 'rotate(-10 25 50)');
    svg.appendChild(leftWing);

    const rightWing = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    rightWing.setAttribute('cx', '75');
    rightWing.setAttribute('cy', '50');
    rightWing.setAttribute('rx', '12');
    rightWing.setAttribute('ry', '35');
    rightWing.setAttribute('fill', 'white');
    rightWing.setAttribute('stroke', '#000');
    rightWing.setAttribute('stroke-width', '1.5');
    rightWing.setAttribute('opacity', '0.9');
    rightWing.setAttribute('transform', 'rotate(10 75 50)');
    svg.appendChild(rightWing);

    // Wing veins (black lines inside wings)
    for (let wingX of [25, 75]) {
        const vein1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        vein1.setAttribute('x1', wingX);
        vein1.setAttribute('y1', '20');
        vein1.setAttribute('x2', wingX);
        vein1.setAttribute('y2', '75');
        vein1.setAttribute('stroke', '#000');
        vein1.setAttribute('stroke-width', '0.5');
        vein1.setAttribute('opacity', '0.4');
        svg.appendChild(vein1);
    }

    // 6 thin long legs (black)
    const legPositions = [
        { x: 50, y: 35 },   // Front pair
        { x: 50, y: 40 },   // Middle pair
        { x: 50, y: 45 }    // Back pair
    ];

    legPositions.forEach(pos => {
        for (let side of [-1, 1]) {
            const leg = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            leg.setAttribute('x1', pos.x);
            leg.setAttribute('y1', pos.y);
            leg.setAttribute('x2', pos.x + side * 26);
            leg.setAttribute('y2', pos.y + 20);
            leg.setAttribute('stroke', '#000');
            leg.setAttribute('stroke-width', '1');
            leg.setAttribute('stroke-linecap', 'round');
            svg.appendChild(leg);
        }
    });

    // Proboscis (long needle-like mouthpart)
    const proboscis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    proboscis.setAttribute('x1', '50');
    proboscis.setAttribute('y1', '13');
    proboscis.setAttribute('x2', '50');
    proboscis.setAttribute('y2', '0');
    proboscis.setAttribute('stroke', '#000');
    proboscis.setAttribute('stroke-width', '1.5');
    proboscis.setAttribute('stroke-linecap', 'round');
    svg.appendChild(proboscis);

    // Eyes (black)
    for (let side of [-3, 3]) {
        const eye = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        eye.setAttribute('cx', 50 + side);
        eye.setAttribute('cy', '19');
        eye.setAttribute('r', '2');
        eye.setAttribute('fill', '#000');
        svg.appendChild(eye);
    }
}

function createPillbugSVG(svg, color) {
    // Black legs - draw first
    for (let side of [-1, 1]) {
        for (let y of [40, 50, 60, 70]) {
            const leg = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            leg.setAttribute('x1', '50');
            leg.setAttribute('y1', y);
            leg.setAttribute('x2', 50 + side * 22);
            leg.setAttribute('y2', y + 8);
            leg.setAttribute('stroke', '#000');
            leg.setAttribute('stroke-width', '2');
            leg.setAttribute('stroke-linecap', 'round');
            svg.appendChild(leg);
        }
    }

    // Segmented body (player color) - pillbugs have armored segments
    const segments = [
        { cy: 70, rx: 28, ry: 12 },
        { cy: 58, rx: 30, ry: 12 },
        { cy: 46, rx: 28, ry: 11 },
        { cy: 35, rx: 24, ry: 10 }
    ];

    segments.forEach(seg => {
        const segment = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        segment.setAttribute('cx', '50');
        segment.setAttribute('cy', seg.cy);
        segment.setAttribute('rx', seg.rx);
        segment.setAttribute('ry', seg.ry);
        segment.setAttribute('fill', color);
        segment.setAttribute('stroke', '#000');
        segment.setAttribute('stroke-width', '1.5');
        svg.appendChild(segment);
    });

    // Head (player color)
    const head = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    head.setAttribute('cx', '50');
    head.setAttribute('cy', '22');
    head.setAttribute('rx', '16');
    head.setAttribute('ry', '10');
    head.setAttribute('fill', color);
    head.setAttribute('stroke', '#000');
    head.setAttribute('stroke-width', '1.5');
    svg.appendChild(head);

    // Antennae (black)
    for (let side of [-1, 1]) {
        const antenna = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        antenna.setAttribute('x1', 50 + side * 8);
        antenna.setAttribute('y1', '18');
        antenna.setAttribute('x2', 50 + side * 18);
        antenna.setAttribute('y2', '10');
        antenna.setAttribute('stroke', '#000');
        antenna.setAttribute('stroke-width', '1.5');
        antenna.setAttribute('stroke-linecap', 'round');
        svg.appendChild(antenna);
    }

    // Eyes (black)
    for (let side of [-6, 6]) {
        const eye = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        eye.setAttribute('cx', 50 + side);
        eye.setAttribute('cy', '20');
        eye.setAttribute('r', '1.5');
        eye.setAttribute('fill', '#000');
        svg.appendChild(eye);
    }
}

// ============================================
// RENDERING FUNCTIONS
// ============================================

function renderGame() {
    renderBoard();
    renderHand();
    updatePlayerInfo();
}

// Helper: Calculate minimum distance from a hex to the nearest insect (or grid center if no insects)
function getDistanceToNearestReference(hex) {
    // If no insects, use distance to grid center (0,0)
    if (gameState.board.size === 0) {
        return hex.distance(new Hex(0, 0));
    }

    // Find minimum distance to any insect
    let minDistance = Infinity;
    for (let hexKey of gameState.board.keys()) {
        const insectHex = Hex.fromString(hexKey);
        const dist = hex.distance(insectHex);
        minDistance = Math.min(minDistance, dist);
    }
    return minDistance;
}

// Smart grid rendering: only render hexes within MAX_GRID_DISTANCE of insects or grid center
const MAX_GRID_DISTANCE = 2;

function renderBoard() {
    const container = document.getElementById('hexagonContainer');

    const visibleHexes = new Set();
    const hexesToRender = [];

    // Determine search bounds based on insects or grid center
    let minQ, maxQ, minR, maxR;

    if (gameState.board.size === 0) {
        // No insects: render around grid center (0,0)
        minQ = -MAX_GRID_DISTANCE;
        maxQ = MAX_GRID_DISTANCE;
        minR = -MAX_GRID_DISTANCE;
        maxR = MAX_GRID_DISTANCE;
    } else {
        // Insects exist: find bounds and expand by MAX_GRID_DISTANCE
        minQ = Infinity;
        maxQ = -Infinity;
        minR = Infinity;
        maxR = -Infinity;

        for (let hexKey of gameState.board.keys()) {
            const hex = Hex.fromString(hexKey);
            minQ = Math.min(minQ, hex.q);
            maxQ = Math.max(maxQ, hex.q);
            minR = Math.min(minR, hex.r);
            maxR = Math.max(maxR, hex.r);
        }

        minQ -= MAX_GRID_DISTANCE;
        maxQ += MAX_GRID_DISTANCE;
        minR -= MAX_GRID_DISTANCE;
        maxR += MAX_GRID_DISTANCE;
    }

    // Only render hexes within MAX_GRID_DISTANCE of reference points
    for (let q = minQ; q <= maxQ; q++) {
        for (let r = minR; r <= maxR; r++) {
            const hex = new Hex(q, r);
            const hexKey = hex.toString();

            // Skip if already processed
            if (visibleHexes.has(hexKey)) continue;

            // Check distance to nearest reference (insect or grid center)
            const distance = getDistanceToNearestReference(hex);

            if (distance <= MAX_GRID_DISTANCE) {
                visibleHexes.add(hexKey);
                hexesToRender.push(hex);
            }
        }
    }

    // Remove hexes that are no longer visible
    const currentHexElements = container.querySelectorAll('.hexagon');
    currentHexElements.forEach(elem => {
        if (!visibleHexes.has(elem.dataset.hex)) {
            elem.remove();
        }
    });

    // Render visible hexes
    for (let hex of hexesToRender) {
        const hexKey = hex.toString();
        let hexElement = container.querySelector(`[data-hex="${hexKey}"]`);

        if (!hexElement) {
            hexElement = createHexagon(hex);
            container.appendChild(hexElement);
        }

        const existingInsects = hexElement.querySelectorAll('.insect');
        existingInsects.forEach(el => el.remove());

        const insect = gameState.board.get(hexKey);
        if (insect) {
            const insectElement = createInsectElement(insect);
            hexElement.appendChild(insectElement);

            const polygon = hexElement.querySelector('svg polygon');
            if (polygon) {
                const playerColor = insect.player === 1 ? 'rgba(85, 153, 255, 0.2)' : 'rgba(255, 170, 68, 0.2)';
                const strokeColor = insect.player === 1 ? '#5599ff' : '#ffaa44';
                polygon.setAttribute('fill', playerColor);
                polygon.setAttribute('stroke', strokeColor);
                polygon.setAttribute('stroke-width', '2');
            }
        } else {
            // Reset to default empty hexagon appearance
            const polygon = hexElement.querySelector('svg polygon');
            if (polygon) {
                polygon.setAttribute('fill', 'rgba(45, 122, 79, 0.3)');
                polygon.setAttribute('stroke', '#2d7a4f');
                polygon.setAttribute('stroke-width', '2');
            }
        }
    }

    // Use double requestAnimationFrame to ensure DOM is fully rendered before calculating zoom
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            centerBoard();
        });
    });
}

function createInsectElement(insect) {
    const div = document.createElement('div');
    div.className = 'insect';
    div.dataset.insectId = insect.id;

    const svg = createInsectSVG(insect.insect, insect.player);
    div.appendChild(svg);

    div.addEventListener('mousedown', handleHexagonMouseDown);
    div.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showPieceInfo(insect, e);
    });
    div.addEventListener('click', (e) => {
        if (e.button === 2) return;
        if (dragState.isDragging) return;
        showPieceInfo(insect, e);
    });

    return div;
}

function renderHand() {
    const handArea = document.getElementById('handArea');
    const player = gameState.currentPlayer;
    const handData = gameState.hand[`player${player}`];

    handArea.innerHTML = '';

    for (let type in INSECT_TYPES) {
        let count = handData[type];

        // If this insect type is being dragged, show reduced count visually
        const visualCount = (dragState.draggedFromHand === type) ? count - 1 : count;
        const isBeingDragged = (dragState.draggedFromHand === type && count === 1);

        // Show insects if count > 0 (including when being dragged)
        if (count > 0) {
            const div = document.createElement('div');
            div.className = 'hand-insect';
            div.dataset.insectType = type;

            // Check if this insect can be placed
            const canPlace = canPlaceInsectType(type);

            // Disable if: cannot be placed OR is the last one being dragged
            if (!canPlace || isBeingDragged) {
                div.classList.add('disabled');
            } else {
                div.addEventListener('mousedown', handleHandInsectMouseDown);
                div.addEventListener('touchstart', handleHandInsectTouchStart);
            }

            const svg = createInsectSVG(type, player);
            div.appendChild(svg);

            // Show count badge if visualCount > 1 (not if being dragged and was the last one)
            if (visualCount > 1) {
                const countBadge = document.createElement('div');
                countBadge.className = 'insect-count';
                countBadge.textContent = visualCount;
                div.appendChild(countBadge);
            }

            handArea.appendChild(div);
        }
    }
}

function canPlaceInsectType(insectType) {
    // Tournament rule: Queen cannot be placed on first turn
    if (gameConfig.tournamentRules && insectType === 'queen' && gameState.turnCount[gameState.currentPlayer] === 0) {
        return false;
    }

    // Rule: Queen MUST be placed by turn 4 (only queen can be placed)
    if (!gameState.queenPlaced[gameState.currentPlayer] &&
        gameState.turnCount[gameState.currentPlayer] === 3 &&
        insectType !== 'queen') {
        return false;
    }

    return true;
}

function handleHandInsectMouseDown(e) {
    const type = e.currentTarget.dataset.insectType;
    console.log('Clicked hand insect type:', type, 'Name:', INSECT_TYPES[type]?.name);
    selectAndDrag(e, 'hand', type);
}

function handleHandInsectTouchStart(e) {
    e.preventDefault();
    const element = e.currentTarget;
    const type = element.dataset.insectType;
    const touch = e.touches[0];
    selectAndDragTouch(touch, element, 'hand', type);
}

function updatePlayerInfo() {
    for (let p = 1; p <= 2; p++) {
        const info = document.getElementById(`player${p}-info`);
        const isActive = p === gameState.currentPlayer && !gameState.gameOver;
        info.classList.toggle('active', isActive);

        const queenStatus = document.getElementById(`player${p}-queen`);
        if (gameState.queenPlaced[p]) {
            queenStatus.textContent = 'Queen: Placed ✓';
        } else {
            const turnsLeft = Math.max(0, 4 - gameState.turnCount[p]);
            if (turnsLeft === 4) {
                queenStatus.textContent = `Queen: Cannot place (turn 1)`;
            } else if (turnsLeft === 1) {
                queenStatus.textContent = `Queen: MUST place now!`;
            } else {
                queenStatus.textContent = `Queen: ${turnsLeft} turns left`;
            }
        }

        const status = document.getElementById(`player${p}-status`);
        if (gameState.gameOver) {
            status.textContent = p === gameState.winner ? 'WINNER!' : 'DEFEATED';
        } else {
            status.textContent = isActive ? 'Your Turn' : 'Waiting...';
        }
    }

    const passButton = document.getElementById('pass-turn');
    if (passButton) {
        const player1Info = document.getElementById('player1-info');
        const player2Info = document.getElementById('player2-info');
        const player1Column = player1Info?.parentElement;
        const player2Column = player2Info?.parentElement;

        if (gameState.currentPlayer === 1 && player1Column && passButton.parentElement !== player1Column) {
            player1Column.appendChild(passButton);
        } else if (gameState.currentPlayer === 2 && player2Column && passButton.parentElement !== player2Column) {
            player2Column.appendChild(passButton);
        }
    }
}

// ============================================
// PIECE INFO POPUP
// ============================================

let currentPopupCloser = null;

function showPieceInfo(insect, event) {
    const popup = document.getElementById('pieceInfoPopup');
    const insectData = INSECT_TYPES[insect.insect];

    if (currentPopupCloser) {
        document.removeEventListener('click', currentPopupCloser);
        document.removeEventListener('contextmenu', currentPopupCloser);
    }

    document.getElementById('pieceInfoTitle').textContent = insectData.name;
    document.getElementById('pieceInfoDetails').textContent = insectData.movement;
    document.getElementById('pieceInfoOwner').textContent = `${insect.player === 1 ? 'Left (Blue)' : 'Right (Orange)'}`;

    popup.classList.add('active');

    let x = event.clientX + 10;
    let y = event.clientY + 10;

    popup.style.left = x + 'px';
    popup.style.top = y + 'px';

    const rect = popup.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        x = window.innerWidth - rect.width - 10;
        popup.style.left = x + 'px';
    }
    if (rect.bottom > window.innerHeight) {
        y = window.innerHeight - rect.height - 10;
        popup.style.top = y + 'px';
    }

    currentPopupCloser = (e) => {
        if (popup.contains(e.target)) return;
        popup.classList.remove('active');
        document.removeEventListener('click', currentPopupCloser);
        document.removeEventListener('contextmenu', currentPopupCloser);
        currentPopupCloser = null;
    };

    setTimeout(() => {
        document.addEventListener('click', currentPopupCloser);
        document.addEventListener('contextmenu', currentPopupCloser);
    }, 10);
}

// ============================================
// ZOOM SYSTEM
// ============================================

let currentZoom = 1;

function updateBoardZoom() {
    const wrapper = document.querySelector('.hexagon-zoom-wrapper');
    if (wrapper) {
        const panX = parseFloat(wrapper.style.getPropertyValue('--pan-x')) || 0;
        const panY = parseFloat(wrapper.style.getPropertyValue('--pan-y')) || 0;
        // Use translate() scale() order so pan values are in pre-scale coordinate space
        wrapper.style.transform = `translate(${panX}px, ${panY}px) scale(${currentZoom})`;
    }
}

// Single source of truth for centering and zooming the board
// Considers all pieces, highlighted hexagons, and ensures everything is visible
function centerBoard() {
    const boardArea = document.getElementById('boardArea');
    const wrapper = document.querySelector('.hexagon-zoom-wrapper');

    if (!boardArea || !wrapper) {
        return;
    }

    const boardRect = boardArea.getBoundingClientRect();
    const boardWidth = boardRect.width;
    const boardHeight = boardRect.height;

    // Safety check: DOM not ready
    if (boardWidth === 0 || boardHeight === 0) {
        currentZoom = 1;
        wrapper.style.setProperty('--pan-x', '0px');
        wrapper.style.setProperty('--pan-y', '0px');
        updateBoardZoom();
        return;
    }

    // Collect all hexagons that need to be visible: pieces + highlighted hexagons
    const hexesToShow = new Set();

    // Add all placed pieces
    for (let hexKey of gameState.board.keys()) {
        hexesToShow.add(hexKey);
    }

    // Add all highlighted hexagons (during drag operations)
    document.querySelectorAll('.hexagon.valid-move').forEach(hex => {
        if (hex.dataset.hex) {
            hexesToShow.add(hex.dataset.hex);
        }
    });

    // If nothing to show, center on grid origin (hex 0,0)
    if (hexesToShow.size === 0) {
        currentZoom = 1;
        // Center hex (0,0) in the viewport
        // Hex (0,0) is at pixel position (0,0) in container coordinates
        // We want it at the center of the viewport
        const viewportCenterX = boardWidth / 2;
        const viewportCenterY = boardHeight / 2;
        wrapper.style.setProperty('--pan-x', viewportCenterX + 'px');
        wrapper.style.setProperty('--pan-y', viewportCenterY + 'px');
        updateBoardZoom();
        return;
    }

    // Find bounds of all hexagons to show
    let minQ = Infinity, maxQ = -Infinity, minR = Infinity, maxR = -Infinity;
    for (let hexKey of hexesToShow) {
        const [q, r] = hexKey.split(',').map(Number);
        minQ = Math.min(minQ, q);
        maxQ = Math.max(maxQ, q);
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
    }

    // Safety check
    if (!isFinite(minQ) || !isFinite(maxQ)) {
        currentZoom = 1;
        const viewportCenterX = boardWidth / 2;
        const viewportCenterY = boardHeight / 2;
        wrapper.style.setProperty('--pan-x', viewportCenterX + 'px');
        wrapper.style.setProperty('--pan-y', viewportCenterY + 'px');
        updateBoardZoom();
        return;
    }

    const hexSize = HEX_ACTUAL_SIZE;
    const margin = 3; // Margin in hexagon units

    // Calculate required space
    const qSpan = (maxQ - minQ) + 1 + (margin * 2);
    const rSpan = (maxR - minR) + 1 + (margin * 2);
    const requiredWidth = qSpan * hexSize * 1.5;
    const requiredHeight = rSpan * hexSize * Math.sqrt(3);

    // Calculate zoom to fit
    const zoomX = boardWidth / requiredWidth;
    const zoomY = boardHeight / requiredHeight;
    const requiredZoom = Math.min(zoomX, zoomY);

    // Safety check
    if (!isFinite(requiredZoom) || requiredZoom <= 0) {
        currentZoom = 1;
        const viewportCenterX = boardWidth / 2;
        const viewportCenterY = boardHeight / 2;
        wrapper.style.setProperty('--pan-x', viewportCenterX + 'px');
        wrapper.style.setProperty('--pan-y', viewportCenterY + 'px');
        updateBoardZoom();
        return;
    }

    // Clamp zoom - never exceed MAX_ZOOM, and use MIN_AUTO_ZOOM as lower bound for auto-centering
    currentZoom = Math.max(MIN_AUTO_ZOOM, Math.min(requiredZoom, MAX_ZOOM));

    // Calculate center point
    const centerQ = (minQ + maxQ) / 2;
    const centerR = (minR + maxR) / 2;
    const centerX = hexSize * (3/2 * centerQ);
    const centerY = hexSize * (Math.sqrt(3)/2 * centerQ + Math.sqrt(3) * centerR);

    // Center in viewport
    const viewportCenterX = boardWidth / 2;
    const viewportCenterY = boardHeight / 2;
    const panX = viewportCenterX - centerX * currentZoom;
    const panY = viewportCenterY - centerY * currentZoom;

    wrapper.style.setProperty('--pan-x', panX + 'px');
    wrapper.style.setProperty('--pan-y', panY + 'px');

    updateBoardZoom();
}

// ============================================
// VICTORY SCREEN
// ============================================

function showVictory() {
    const overlay = document.createElement('div');
    overlay.className = 'victory-overlay';

    const winner = gameState.winner === 1 ? 'Left' : 'Right';
    const winnerColor = gameState.winner === 1 ? 'Blue' : 'Orange';

    overlay.innerHTML = `
        <div class="victory-text">${winner} Wins!</div>
        <div class="victory-subtext">${winnerColor} player has surrounded the Queen!</div>
    `;

    document.body.appendChild(overlay);

    for (let i = 0; i < 50; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.background = Math.random() > 0.5 ? '#FFD700' : '#FFA500';
        confetti.style.setProperty('--drift-x', (Math.random() - 0.5) * 200 + 'px');
        document.body.appendChild(confetti);
    }
}

// ============================================
// GAME INITIALIZATION & EVENT LISTENERS
// ============================================

// Load game config from localStorage
function loadGameConfig() {
    try {
        const saved = localStorage.getItem('hiveGameConfig');
        if (saved) {
            const config = JSON.parse(saved);
            gameConfig.expansionMosquito = config.expansionMosquito || false;
            gameConfig.expansionLadybug = config.expansionLadybug || false;
            gameConfig.expansionPillbug = config.expansionPillbug || false;
            gameConfig.tournamentRules = config.tournamentRules || false;
        }
    } catch (e) {
        console.error('Failed to load game config:', e);
    }
}

// Save game config to localStorage
function saveGameConfig() {
    try {
        localStorage.setItem('hiveGameConfig', JSON.stringify(gameConfig));
    } catch (e) {
        console.error('Failed to save game config:', e);
    }
}

// Update checkboxes from config
function updateCheckboxes() {
    document.getElementById('expansionMosquito').checked = gameConfig.expansionMosquito;
    document.getElementById('expansionLadybug').checked = gameConfig.expansionLadybug;
    document.getElementById('expansionPillbug').checked = gameConfig.expansionPillbug;
    document.getElementById('tournamentRules').checked = gameConfig.tournamentRules;
}

// Update expansion insects in player hands based on config
function updateExpansionInsects() {
    for (let player of [1, 2]) {
        const playerKey = `player${player}`;
        if (gameState.hand[playerKey]) {
            // Count how many of each expansion type are already on the board for this player
            const onBoard = { mosquito: 0, ladybug: 0, pillbug: 0 };
            for (let [, insect] of gameState.board) {
                if (insect.player === player && onBoard.hasOwnProperty(insect.insect)) {
                    onBoard[insect.insect]++;
                }
            }

            // Update mosquito
            if (gameConfig.expansionMosquito) {
                // Add back to hand (total count minus what's on board)
                gameState.hand[playerKey]['mosquito'] = Math.max(0, INSECT_TYPES.mosquito.count - onBoard.mosquito);
            } else {
                // Don't allow new ones, but keep count of what's already placed
                gameState.hand[playerKey]['mosquito'] = 0;
            }

            // Update ladybug
            if (gameConfig.expansionLadybug) {
                gameState.hand[playerKey]['ladybug'] = Math.max(0, INSECT_TYPES.ladybug.count - onBoard.ladybug);
            } else {
                gameState.hand[playerKey]['ladybug'] = 0;
            }

            // Update pillbug
            if (gameConfig.expansionPillbug) {
                gameState.hand[playerKey]['pillbug'] = Math.max(0, INSECT_TYPES.pillbug.count - onBoard.pillbug);
            } else {
                gameState.hand[playerKey]['pillbug'] = 0;
            }
        }
    }
}

// Update game rules link visibility
function updateGameRulesVisibility() {
    const rulesLink = document.getElementById('gameRulesLink');
    if (gameState.turn === 0 && !gameState.gameOver) {
        rulesLink.classList.add('visible');
    } else {
        rulesLink.classList.remove('visible');
    }
}

// Close game setup popup
function closeGameSetup() {
    document.getElementById('gameSetupPopup').classList.remove('active');
}

function initGame() {
    gameState = {
        board: new Map(),
        hand: {},
        currentPlayer: Math.random() < 0.5 ? 1 : 2,
        gameOver: false,
        winner: null,
        turn: 0,
        selectedInsect: null,
        queenPlaced: { 1: false, 2: false },
        turnCount: { 1: 0, 2: 0 }
    };
    initializeHand();
    renderGame();
    centerBoard();
    updateGameRulesVisibility();
}

// Initialize event listeners
function initializeEventListeners() {
    document.getElementById('infoBtn').addEventListener('click', () => {
        document.getElementById('infoModal').classList.add('active');
    });

    document.getElementById('closeInfoBtn').addEventListener('click', () => {
        document.getElementById('infoModal').classList.remove('active');
    });

    document.getElementById('infoModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('infoModal')) {
            document.getElementById('infoModal').classList.remove('active');
        }
    });

    document.getElementById('new-game').addEventListener('click', () => {
        // Clear any existing victory screens
        document.querySelectorAll('.victory-overlay').forEach(el => el.remove());
        document.querySelectorAll('.confetti').forEach(el => el.remove());

        // Start the game
        initGame();
    });

    // Game rules link click - open setup popup
    document.getElementById('gameRulesLink').addEventListener('click', () => {
        updateCheckboxes();
        document.getElementById('gameSetupPopup').classList.add('active');
    });

    // Game setup popup - click outside to close
    document.getElementById('gameSetupPopup').addEventListener('click', (e) => {
        if (e.target === document.getElementById('gameSetupPopup')) {
            closeGameSetup();
        }
    });

    // Checkbox change listeners - apply immediately and save to localStorage
    const checkboxIds = ['expansionMosquito', 'expansionLadybug', 'expansionPillbug', 'tournamentRules'];
    checkboxIds.forEach(id => {
        document.getElementById(id).addEventListener('change', (e) => {
            if (id === 'tournamentRules') {
                gameConfig.tournamentRules = e.target.checked;
            } else {
                gameConfig[id] = e.target.checked;
            }
            saveGameConfig();

            // Apply changes immediately to current game
            if (id !== 'tournamentRules') {
                // Update expansion insects in hands
                updateExpansionInsects();
                // Re-render to show changes
                renderGame();
            }
            // Tournament rules take effect immediately without re-render
        });
    });

    document.getElementById('pass-turn').addEventListener('click', () => {
        if (canPassTurn()) {
            endTurn();
        }
    });

    document.getElementById('zoomInBtn').addEventListener('click', () => {
        currentZoom = Math.min(currentZoom + 0.2, MAX_ZOOM);
        updateBoardZoom();
    });

    document.getElementById('zoomOutBtn').addEventListener('click', () => {
        currentZoom = Math.max(currentZoom - 0.2, MIN_ZOOM);
        updateBoardZoom();
    });

    document.getElementById('resetZoomBtn').addEventListener('click', () => {
        centerBoard();
    });
}

// Start game on load
window.addEventListener('load', () => {
    loadGameConfig();
    initializeEventListeners();
    initGame();
});
