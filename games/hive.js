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
    queen: { name: 'Queen', count: 1, icon: '👑', movement: 'Moves 1 hexagon in any direction' },
    ant: { name: 'Ant', count: 3, icon: '🐜', movement: 'Slides any distance in straight lines' },
    beetle: { name: 'Beetle', count: 2, icon: '🪲', movement: 'Moves 1 space, can climb on others' },
    hopper: { name: 'Hopper', count: 3, icon: '🦗', movement: 'Jumps over connected insects' },
    ladybug: { name: 'Ladybug', count: 2, icon: '🐞', movement: 'Moves exactly 3 spaces using pillars' }
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
    lastHighlightedHex: null
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

    document.addEventListener('touchmove', beginDragOnMoveTouch, { passive: false });
    document.addEventListener('touchend', cancelDragIfNotStarted);
}

function beginDragOnMove(e) {
    if (dragState.isDragging) {
        handleDragMove(e);
        return;
    }

    dragState.isDragging = true;

    dragState.dragClone = dragState.dragElement.cloneNode(true);
    dragState.dragClone.style.position = 'fixed';
    dragState.dragClone.style.zIndex = '1000';
    dragState.dragClone.style.pointerEvents = 'none';
    dragState.dragClone.style.transition = 'none';
    dragState.dragClone.style.transform = 'none';
    dragState.dragClone.classList.remove('selected');

    const boardInsectSize = 96;
    if (dragState.dragSource === 'hand') {
        const handInsectSize = 70;
        const scaleRatio = boardInsectSize / handInsectSize;
        dragState.dragClone.style.width = boardInsectSize + 'px';
        dragState.dragClone.style.height = boardInsectSize + 'px';
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
        document.removeEventListener('mousemove', beginDragOnMove);
        document.removeEventListener('touchmove', beginDragOnMoveTouch);
        document.removeEventListener('mouseup', cancelDragIfNotStarted);
        document.removeEventListener('touchend', cancelDragIfNotStarted);
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

    if (!hexElement) {
        if (dragState.lastHighlightedHex) {
            dragState.lastHighlightedHex.classList.remove('valid-move');
            dragState.lastHighlightedHex.style.removeProperty('--player-color');
            dragState.lastHighlightedHex = null;
        }
        return;
    }

    const hexKey = hexElement.dataset.hex;

    if (dragState.lastHighlightedHex === hexElement) {
        return;
    }

    if (dragState.lastHighlightedHex) {
        dragState.lastHighlightedHex.classList.remove('valid-move');
        dragState.lastHighlightedHex.style.removeProperty('--player-color');
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

    if (dragState.lastHighlightedHex) {
        dragState.lastHighlightedHex.classList.remove('valid-move');
        dragState.lastHighlightedHex.style.removeProperty('--player-color');
        dragState.lastHighlightedHex = null;
    }

    if (wasDragging) {
        const dropElement = document.elementFromPoint(e.clientX, e.clientY);
        const hexElement = dropElement?.closest('.hexagon');

        if (hexElement) {
            const hex = new Hex(...hexElement.dataset.hex.split(',').map(Number));

            if (dragState.dragSource === 'hand') {
                placeInsect(hex, dragState.sourceData);
            } else if (dragState.dragSource === 'board') {
                moveInsect(dragState.sourceData, hex);
            }
        }
    }

    dragState = {
        isDragging: false,
        dragElement: null,
        dragClone: null,
        dragOffsetX: 0,
        dragOffsetY: 0,
        dragSource: null,
        sourceData: null
    };

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

    if (gameState.board.has(hexKey)) return;

    if (gameState.board.size > 0 && !canPlaceInsect(hex)) {
        return;
    }

    const insectId = `${gameState.currentPlayer}-${insectType}-${Date.now()}`;
    gameState.board.set(hexKey, {
        player: gameState.currentPlayer,
        insect: insectType,
        id: insectId
    });

    gameState.hand[`player${gameState.currentPlayer}`][insectType]--;

    if (insectType === 'queen') {
        gameState.queenPlaced[gameState.currentPlayer] = true;
    }

    renderGame();
    checkWinCondition();
    endTurn();
}

function canPlaceInsect(hex) {
    const neighbors = hex.getNeighbors();
    const opponentPlayer = gameState.currentPlayer === 1 ? 2 : 1;

    return neighbors.some(n => {
        const insect = gameState.board.get(n.toString());
        return insect && insect.player === opponentPlayer;
    });
}

function moveInsect(insect, targetHex) {
    let currentHex = null;
    for (let [hexKey, bug] of gameState.board) {
        if (bug.id === insect.id) {
            currentHex = Hex.fromString(hexKey);
            break;
        }
    }

    if (!currentHex) return;

    const targetKey = targetHex.toString();
    if (gameState.board.has(targetKey)) return;

    gameState.board.delete(currentHex.toString());
    gameState.board.set(targetKey, insect);

    renderGame();
    checkWinCondition();
    endTurn();
}

function endTurn() {
    gameState.turn++;
    gameState.turnCount[gameState.currentPlayer]++;
    gameState.currentPlayer = gameState.currentPlayer === 1 ? 2 : 1;
    renderGame();
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
            gameState.hand[`player${player}`][type] = INSECT_TYPES[type].count;
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
    const strokeColor = player === 1 ? '#1155cc' : '#dd6611';

    switch (type) {
        case 'queen':
            createQueenSVG(svg, color, strokeColor);
            break;
        case 'ant':
            createAntSVG(svg, color, strokeColor);
            break;
        case 'beetle':
            createBeetleSVG(svg, color, strokeColor);
            break;
        case 'hopper':
            createHopperSVG(svg, color, strokeColor);
            break;
        case 'ladybug':
            createLadybugSVG(svg, color, strokeColor);
            break;
    }

    return svg;
}

function createQueenSVG(svg, color, strokeColor) {
    const abdomen1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    abdomen1.setAttribute('cx', '50');
    abdomen1.setAttribute('cy', '65');
    abdomen1.setAttribute('r', '18');
    abdomen1.setAttribute('fill', color);
    abdomen1.setAttribute('stroke', strokeColor);
    abdomen1.setAttribute('stroke-width', '1.5');
    svg.appendChild(abdomen1);

    const abdomen2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    abdomen2.setAttribute('cx', '50');
    abdomen2.setAttribute('cy', '45');
    abdomen2.setAttribute('r', '16');
    abdomen2.setAttribute('fill', color);
    abdomen2.setAttribute('stroke', strokeColor);
    abdomen2.setAttribute('stroke-width', '1.5');
    svg.appendChild(abdomen2);

    const thorax = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    thorax.setAttribute('cx', '50');
    thorax.setAttribute('cy', '32');
    thorax.setAttribute('rx', '14');
    thorax.setAttribute('ry', '12');
    thorax.setAttribute('fill', color);
    thorax.setAttribute('stroke', strokeColor);
    thorax.setAttribute('stroke-width', '1.5');
    svg.appendChild(thorax);

    const head = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    head.setAttribute('cx', '50');
    head.setAttribute('cy', '18');
    head.setAttribute('r', '10');
    head.setAttribute('fill', color);
    head.setAttribute('stroke', strokeColor);
    head.setAttribute('stroke-width', '1.5');
    svg.appendChild(head);

    const crownArc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    crownArc.setAttribute('d', 'M 38 15 Q 35 5 50 2 Q 65 5 62 15');
    crownArc.setAttribute('fill', 'none');
    crownArc.setAttribute('stroke', strokeColor);
    crownArc.setAttribute('stroke-width', '2.5');
    crownArc.setAttribute('stroke-linecap', 'round');
    svg.appendChild(crownArc);

    for (let i = 0; i < 3; i++) {
        const jewel = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        jewel.setAttribute('cx', 40 + i * 10);
        jewel.setAttribute('cy', 6);
        jewel.setAttribute('r', '2');
        jewel.setAttribute('fill', strokeColor);
        svg.appendChild(jewel);
    }

    for (let side of [-1, 1]) {
        const antenna = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        antenna.setAttribute('d', `M ${50 + side * 6} 10 Q ${50 + side * 15} 0 ${50 + side * 14} -5`);
        antenna.setAttribute('fill', 'none');
        antenna.setAttribute('stroke', strokeColor);
        antenna.setAttribute('stroke-width', '2');
        antenna.setAttribute('stroke-linecap', 'round');
        svg.appendChild(antenna);
    }

    for (let side of [-4, 4]) {
        const eye = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        eye.setAttribute('cx', 50 + side);
        eye.setAttribute('cy', '17');
        eye.setAttribute('r', '1.5');
        eye.setAttribute('fill', strokeColor);
        svg.appendChild(eye);
    }
}

function createAntSVG(svg, color, strokeColor) {
    const head = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    head.setAttribute('cx', '50');
    head.setAttribute('cy', '25');
    head.setAttribute('r', '15');
    head.setAttribute('fill', color);
    head.setAttribute('stroke', strokeColor);
    head.setAttribute('stroke-width', '2');
    svg.appendChild(head);

    const body1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    body1.setAttribute('cx', '50');
    body1.setAttribute('cy', '50');
    body1.setAttribute('r', '18');
    body1.setAttribute('fill', color);
    body1.setAttribute('stroke', strokeColor);
    body1.setAttribute('stroke-width', '2');
    svg.appendChild(body1);

    const body2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    body2.setAttribute('cx', '50');
    body2.setAttribute('cy', '75');
    body2.setAttribute('r', '14');
    body2.setAttribute('fill', color);
    body2.setAttribute('stroke', strokeColor);
    body2.setAttribute('stroke-width', '2');
    svg.appendChild(body2);

    for (let side of [-1, 1]) {
        for (let y of [35, 50, 65]) {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', '50');
            line.setAttribute('y1', y);
            line.setAttribute('x2', 50 + side * 30);
            line.setAttribute('y2', y + 10);
            line.setAttribute('stroke', strokeColor);
            line.setAttribute('stroke-width', '2');
            line.setAttribute('stroke-linecap', 'round');
            svg.appendChild(line);
        }
    }

    for (let side of [-1, 1]) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', 50 + side * 8);
        line.setAttribute('y1', '15');
        line.setAttribute('x2', 50 + side * 20);
        line.setAttribute('y2', '5');
        line.setAttribute('stroke', strokeColor);
        line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke-linecap', 'round');
        svg.appendChild(line);
    }
}

function createBeetleSVG(svg, color, strokeColor) {
    const shell = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    shell.setAttribute('cx', '50');
    shell.setAttribute('cy', '50');
    shell.setAttribute('rx', '38');
    shell.setAttribute('ry', '40');
    shell.setAttribute('fill', color);
    shell.setAttribute('stroke', strokeColor);
    shell.setAttribute('stroke-width', '2');
    svg.appendChild(shell);

    const leftWing = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    leftWing.setAttribute('cx', '35');
    leftWing.setAttribute('cy', '50');
    leftWing.setAttribute('rx', '14');
    leftWing.setAttribute('ry', '35');
    leftWing.setAttribute('fill', 'rgba(255,255,255,0.2)');
    leftWing.setAttribute('stroke', 'none');
    svg.appendChild(leftWing);

    const rightWing = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    rightWing.setAttribute('cx', '65');
    rightWing.setAttribute('cy', '50');
    rightWing.setAttribute('rx', '14');
    rightWing.setAttribute('ry', '35');
    rightWing.setAttribute('fill', 'rgba(255,255,255,0.2)');
    rightWing.setAttribute('stroke', 'none');
    svg.appendChild(rightWing);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '50');
    line.setAttribute('y1', '15');
    line.setAttribute('x2', '50');
    line.setAttribute('y2', '85');
    line.setAttribute('stroke', strokeColor);
    line.setAttribute('stroke-width', '1');
    svg.appendChild(line);

    for (let i = 0; i < 4; i++) {
        const spot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        spot.setAttribute('cx', i % 2 === 0 ? 35 : 65);
        spot.setAttribute('cy', 35 + (i > 1 ? 30 : 0));
        spot.setAttribute('r', '4');
        spot.setAttribute('fill', strokeColor);
        svg.appendChild(spot);
    }
}

function createHopperSVG(svg, color, strokeColor) {
    const head = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    head.setAttribute('cx', '50');
    head.setAttribute('cy', '25');
    head.setAttribute('r', '13');
    head.setAttribute('fill', color);
    head.setAttribute('stroke', strokeColor);
    head.setAttribute('stroke-width', '2');
    svg.appendChild(head);

    const body = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    body.setAttribute('cx', '50');
    body.setAttribute('cy', '50');
    body.setAttribute('rx', '18');
    body.setAttribute('ry', '22');
    body.setAttribute('fill', color);
    body.setAttribute('stroke', strokeColor);
    body.setAttribute('stroke-width', '2');
    svg.appendChild(body);

    const abdomen = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    abdomen.setAttribute('cx', '50');
    abdomen.setAttribute('cy', '68');
    abdomen.setAttribute('rx', '15');
    abdomen.setAttribute('ry', '16');
    abdomen.setAttribute('fill', color);
    abdomen.setAttribute('stroke', strokeColor);
    abdomen.setAttribute('stroke-width', '1.5');
    svg.appendChild(abdomen);

    const leftHindLeg1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    leftHindLeg1.setAttribute('d', 'M 32 65 Q 15 70 12 88');
    leftHindLeg1.setAttribute('fill', 'none');
    leftHindLeg1.setAttribute('stroke', strokeColor);
    leftHindLeg1.setAttribute('stroke-width', '3.5');
    leftHindLeg1.setAttribute('stroke-linecap', 'round');
    svg.appendChild(leftHindLeg1);

    const leftHindLeg2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    leftHindLeg2.setAttribute('d', 'M 32 68 Q 8 75 2 95');
    leftHindLeg2.setAttribute('fill', 'none');
    leftHindLeg2.setAttribute('stroke', strokeColor);
    leftHindLeg2.setAttribute('stroke-width', '2.5');
    leftHindLeg2.setAttribute('stroke-linecap', 'round');
    svg.appendChild(leftHindLeg2);

    const rightHindLeg1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    rightHindLeg1.setAttribute('d', 'M 68 65 Q 85 70 88 88');
    rightHindLeg1.setAttribute('fill', 'none');
    rightHindLeg1.setAttribute('stroke', strokeColor);
    rightHindLeg1.setAttribute('stroke-width', '3.5');
    rightHindLeg1.setAttribute('stroke-linecap', 'round');
    svg.appendChild(rightHindLeg1);

    const rightHindLeg2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    rightHindLeg2.setAttribute('d', 'M 68 68 Q 92 75 98 95');
    rightHindLeg2.setAttribute('fill', 'none');
    rightHindLeg2.setAttribute('stroke', strokeColor);
    rightHindLeg2.setAttribute('stroke-width', '2.5');
    rightHindLeg2.setAttribute('stroke-linecap', 'round');
    svg.appendChild(rightHindLeg2);

    for (let side of [-1, 1]) {
        const midLeg = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        midLeg.setAttribute('d', `M ${50 + side * 16} 50 L ${50 + side * 28} 62`);
        midLeg.setAttribute('fill', 'none');
        midLeg.setAttribute('stroke', strokeColor);
        midLeg.setAttribute('stroke-width', '2');
        midLeg.setAttribute('stroke-linecap', 'round');
        svg.appendChild(midLeg);
    }

    for (let side of [-1, 1]) {
        const frontLeg = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        frontLeg.setAttribute('d', `M ${50 + side * 14} 35 L ${50 + side * 22} 42`);
        frontLeg.setAttribute('fill', 'none');
        frontLeg.setAttribute('stroke', strokeColor);
        frontLeg.setAttribute('stroke-width', '2');
        frontLeg.setAttribute('stroke-linecap', 'round');
        svg.appendChild(frontLeg);
    }

    for (let side of [-5, 5]) {
        const eye = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        eye.setAttribute('cx', 50 + side);
        eye.setAttribute('cy', '16');
        eye.setAttribute('r', '3');
        eye.setAttribute('fill', strokeColor);
        svg.appendChild(eye);

        const shine = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        shine.setAttribute('cx', 50 + side + 1);
        shine.setAttribute('cy', '15');
        shine.setAttribute('r', '1');
        shine.setAttribute('fill', 'rgba(255,255,255,0.6)');
        svg.appendChild(shine);
    }
}

function createLadybugSVG(svg, color, strokeColor) {
    const shell = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    shell.setAttribute('cx', '50');
    shell.setAttribute('cy', '55');
    shell.setAttribute('rx', '32');
    shell.setAttribute('ry', '35');
    shell.setAttribute('fill', color);
    shell.setAttribute('stroke', strokeColor);
    shell.setAttribute('stroke-width', '2');
    svg.appendChild(shell);

    const head = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    head.setAttribute('cx', '50');
    head.setAttribute('cy', '25');
    head.setAttribute('r', '14');
    head.setAttribute('fill', 'rgba(0,0,0,0.3)');
    head.setAttribute('stroke', strokeColor);
    head.setAttribute('stroke-width', '2');
    svg.appendChild(head);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '50');
    line.setAttribute('y1', '20');
    line.setAttribute('x2', '50');
    line.setAttribute('y2', '90');
    line.setAttribute('stroke', strokeColor);
    line.setAttribute('stroke-width', '1');
    svg.appendChild(line);

    const positions = [
        { x: 35, y: 40 }, { x: 35, y: 55 }, { x: 35, y: 70 },
        { x: 65, y: 40 }, { x: 65, y: 55 }, { x: 65, y: 70 }
    ];

    positions.forEach(pos => {
        const spot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        spot.setAttribute('cx', pos.x);
        spot.setAttribute('cy', pos.y);
        spot.setAttribute('r', '5');
        spot.setAttribute('fill', strokeColor);
        svg.appendChild(spot);
    });

    for (let side of [-4, 4]) {
        const eye = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        eye.setAttribute('cx', 50 + side);
        eye.setAttribute('cy', '22');
        eye.setAttribute('r', '2');
        eye.setAttribute('fill', strokeColor);
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

function areAllPiecesVisible() {
    if (gameState.board.size === 0) return true;

    const boardArea = document.getElementById('boardArea');
    const boardRect = boardArea.getBoundingClientRect();

    const margin = 80;
    const viewMinX = boardRect.left + margin;
    const viewMaxX = boardRect.right - margin;
    const viewMinY = boardRect.top + margin;
    const viewMaxY = boardRect.bottom - margin;

    for (let hexKey of gameState.board.keys()) {
        const hexElement = document.querySelector(`[data-hex="${hexKey}"]`);
        if (!hexElement) return false;

        const hexRect = hexElement.getBoundingClientRect();
        const hexCenterX = hexRect.left + hexRect.width / 2;
        const hexCenterY = hexRect.top + hexRect.height / 2;

        if (hexCenterX < viewMinX || hexCenterX > viewMaxX ||
            hexCenterY < viewMinY || hexCenterY > viewMaxY) {
            return false;
        }
    }

    return true;
}

function renderBoard() {
    const container = document.getElementById('hexagonContainer');

    const usedHexes = new Set(gameState.board.keys());

    let minQ = 0, maxQ = 0, minR = 0, maxR = 0;
    for (let hexKey of usedHexes) {
        const hex = Hex.fromString(hexKey);
        minQ = Math.min(minQ, hex.q);
        maxQ = Math.max(maxQ, hex.q);
        minR = Math.min(minR, hex.r);
        maxR = Math.max(maxR, hex.r);
    }

    minQ -= 2;
    maxQ += 2;
    minR -= 2;
    maxR += 2;

    const visibleHexes = new Set();
    const hexesToRender = [];

    for (let q = minQ; q <= maxQ; q++) {
        for (let r = minR; r <= maxR; r++) {
            const hexKey = `${q},${r}`;
            if (visibleHexes.has(hexKey)) continue;
            visibleHexes.add(hexKey);
            hexesToRender.push(new Hex(q, r));
        }
    }

    const currentHexElements = container.querySelectorAll('.hexagon');
    currentHexElements.forEach(elem => {
        if (!visibleHexes.has(elem.dataset.hex)) {
            elem.remove();
        }
    });

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
            }
        } else {
            const polygon = hexElement.querySelector('svg polygon');
            if (polygon) {
                polygon.setAttribute('fill', 'rgba(45, 122, 79, 0.3)');
            }
        }
    }

    if (!areAllPiecesVisible()) {
        autoFitBoard();
    }
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
        const count = handData[type];
        if (count > 0) {
            const div = document.createElement('div');
            div.className = 'hand-insect';
            div.dataset.insectType = type;
            div.addEventListener('mousedown', handleHandInsectMouseDown);
            div.addEventListener('touchstart', handleHandInsectTouchStart);

            const svg = createInsectSVG(type, player);
            div.appendChild(svg);

            if (count > 1) {
                const countBadge = document.createElement('div');
                countBadge.className = 'insect-count';
                countBadge.textContent = count;
                div.appendChild(countBadge);
            }

            handArea.appendChild(div);
        }
    }
}

function handleHandInsectMouseDown(e) {
    const type = e.currentTarget.dataset.insectType;
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
            const turnsLeft = Math.max(0, 3 - gameState.turnCount[p]);
            queenStatus.textContent = `Queen: ${turnsLeft} turns left`;
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
        const panX = wrapper.style.getPropertyValue('--pan-x') || '0px';
        const panY = wrapper.style.getPropertyValue('--pan-y') || '0px';
        wrapper.style.transform = `scale(${currentZoom}) translate(${panX}, ${panY})`;
    }
}

function autoFitBoard() {
    const container = document.getElementById('hexagonContainer');

    if (!container) {
        return;
    }

    if (gameState.board.size === 0) {
        currentZoom = 1;
        const wrapper = document.querySelector('.hexagon-zoom-wrapper');
        if (wrapper) {
            wrapper.style.setProperty('--pan-x', '400px');
            wrapper.style.setProperty('--pan-y', '350px');
        }
        updateBoardZoom();
        return;
    }

    let minQ = Infinity, maxQ = -Infinity, minR = Infinity, maxR = -Infinity;
    for (let hexKey of gameState.board.keys()) {
        const [q, r] = hexKey.split(',').map(Number);
        minQ = Math.min(minQ, q);
        maxQ = Math.max(maxQ, q);
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
    }

    if (minQ === Infinity) {
        currentZoom = 1;
        const wrapper = document.querySelector('.hexagon-zoom-wrapper');
        if (wrapper) {
            wrapper.style.setProperty('--pan-x', '0px');
            wrapper.style.setProperty('--pan-y', '0px');
        }
    } else {
        const qSpan = maxQ - minQ + 4;
        const rSpan = maxR - minR + 4;
        const boardWidth = 800;
        const boardHeight = 700;
        const hexSize = 100;

        const requiredZoom = Math.min(
            boardWidth / (qSpan * hexSize * 1.5),
            boardHeight / (rSpan * hexSize * Math.sqrt(3))
        );

        currentZoom = Math.max(MIN_AUTO_ZOOM, requiredZoom);
        currentZoom = Math.min(currentZoom, MAX_ZOOM);

        const centerQ = (minQ + maxQ) / 2;
        const centerR = (minR + maxR) / 2;

        const centerX = centerQ * hexSize * 1.5;
        const centerY = (centerR + centerQ / 2) * hexSize * Math.sqrt(3);

        const panX = -centerX;
        const panY = -centerY;

        const wrapper = document.querySelector('.hexagon-zoom-wrapper');
        if (wrapper) {
            wrapper.style.setProperty('--pan-x', panX + 'px');
            wrapper.style.setProperty('--pan-y', panY + 'px');
        }
    }

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
    autoFitBoard();
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
        document.querySelectorAll('.victory-overlay').forEach(el => el.remove());
        document.querySelectorAll('.confetti').forEach(el => el.remove());
        initGame();
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
        autoFitBoard();
    });
}

// Start game on load
window.addEventListener('load', () => {
    initializeEventListeners();
    initGame();
});
