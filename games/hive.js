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
// MOVEMENT SYSTEM & PATHFINDING
// ============================================

class MovementSystem {
    constructor() {
        this.currentPath = null; // Store the current path for visualization
        this.pathElement = null; // SVG path element for visualization
    }

    /**
     * Draw the movement path on the board
     * @param {Array<Hex>} path - Array of Hex coordinates forming the path
     * @param {string} playerColor - Color for the path
     * @param {boolean} isValid - Whether the path reaches the target successfully
     */
    drawPath(path, playerColor, isValid) {
        // Remove existing path if any
        this.clearPath();

        if (!path || path.length < 2) {
            return;
        }

        const container = document.getElementById('hexagonContainer');
        if (!container) return;

        // Create SVG element for the path
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'movement-path');
        svg.style.position = 'absolute';
        svg.style.left = '0';
        svg.style.top = '0';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.pointerEvents = 'none';
        svg.style.zIndex = '5';
        svg.style.overflow = 'visible';

        // Create the path element
        const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');

        // Build the path data
        let pathData = '';
        for (let i = 0; i < path.length; i++) {
            const hex = path[i];
            const pos = hexToPixel(hex);

            if (i === 0) {
                pathData += `M ${pos.x} ${pos.y}`;
            } else {
                pathData += ` L ${pos.x} ${pos.y}`;
            }
        }

        pathElement.setAttribute('d', pathData);
        pathElement.setAttribute('fill', 'none');

        // Use player color with transparency
        const pathColor = isValid ? playerColor : '#ff4444';
        pathElement.setAttribute('stroke', pathColor);
        pathElement.setAttribute('stroke-width', '8');
        pathElement.setAttribute('stroke-opacity', '0.4');
        pathElement.setAttribute('stroke-linecap', 'round');
        pathElement.setAttribute('stroke-linejoin', 'round');

        // Add dashed style for invalid paths
        if (!isValid) {
            pathElement.setAttribute('stroke-dasharray', '10 5');
        }

        svg.appendChild(pathElement);
        container.appendChild(svg);

        this.pathElement = svg;
    }

    /**
     * Clear the current path visualization
     */
    clearPath() {
        if (this.pathElement && this.pathElement.parentNode) {
            this.pathElement.parentNode.removeChild(this.pathElement);
        }
        this.pathElement = null;
        this.currentPath = null;
    }

    // ==========================================
    // ANT PATHFINDING
    // ==========================================

    /**
     * Find the shortest path for an ant from start to target
     * Ants can walk unlimited distance but cannot pass through gates
     * Returns { success: boolean, path: Hex[], blockedAt: Hex|null }
     */
    findAntPath(fromHex, toHex, movingInsectId) {
        // BFS to find shortest path
        const queue = [{ hex: fromHex, path: [fromHex] }];
        const visited = new Set([fromHex.toString()]);

        while (queue.length > 0) {
            const current = queue.shift();
            const currentHex = current.hex;
            const currentPath = current.path;

            // Found the target
            if (currentHex.equals(toHex)) {
                return { success: true, path: currentPath, blockedAt: null };
            }

            // Get valid neighbors (walking moves)
            const neighbors = this.getWalkingNeighbors(currentHex, movingInsectId);

            for (const neighbor of neighbors) {
                const neighborKey = neighbor.toString();
                if (!visited.has(neighborKey)) {
                    visited.add(neighborKey);
                    queue.push({
                        hex: neighbor,
                        path: [...currentPath, neighbor]
                    });
                }
            }
        }

        // No path found - return the longest path we explored toward the target
        const longestPath = this.findLongestPathToward(fromHex, toHex, movingInsectId);
        return {
            success: false,
            path: longestPath.path,
            blockedAt: longestPath.path[longestPath.path.length - 1]
        };
    }

    /**
     * Get valid walking neighbors for a hex
     * Walking means sliding along the edge of the hive without passing through gates
     */
    getWalkingNeighbors(hex, movingInsectId) {
        const allNeighbors = hex.getNeighbors();
        const validNeighbors = [];

        for (const neighbor of allNeighbors) {
            const neighborKey = neighbor.toString();

            // Cannot walk to occupied hexes (unless it's where we're moving from, which is handled elsewhere)
            if (isHexOccupied(neighborKey)) {
                // Check if this is the insect's own position (which will become empty)
                const stack = getInsectStack(neighborKey);
                if (!stack || stack.length === 0 ||
                    (stack.length === 1 && stack[0].id === movingInsectId)) {
                    // This hex will be empty after the move, skip it
                    continue;
                } else {
                    // Hex is occupied by another insect
                    continue;
                }
            }

            // Check if this move would pass through a gate
            if (this.isGate(hex, neighbor, movingInsectId)) {
                continue;
            }

            // Must maintain hive connectivity - neighbor must touch at least one other insect
            // (not counting the insect being moved)
            if (!this.touchesHive(neighbor, movingInsectId, hex)) {
                continue;
            }

            validNeighbors.push(neighbor);
        }

        return validNeighbors;
    }

    /**
     * Check if moving from hex1 to hex2 would pass through a gate
     * A gate is when two adjacent occupied hexes create a narrow passage
     */
    isGate(fromHex, toHex, movingInsectId) {
        // Get the two hexes that are common neighbors of both fromHex and toHex
        const fromNeighbors = fromHex.getNeighbors();
        const toNeighbors = toHex.getNeighbors();

        const commonNeighbors = fromNeighbors.filter(fHex =>
            toNeighbors.some(tHex => fHex.equals(tHex))
        );

        if (commonNeighbors.length !== 2) {
            // This shouldn't happen for adjacent hexes, but just in case
            return false;
        }

        // Check if both common neighbors are occupied
        let occupiedCount = 0;
        for (const commonHex of commonNeighbors) {
            const hexKey = commonHex.toString();
            if (isHexOccupied(hexKey)) {
                // Don't count the insect being moved
                const stack = getInsectStack(hexKey);
                if (stack && stack.length > 0) {
                    // If this hex only has the moving insect, don't count it as occupied
                    if (stack.length === 1 && stack[0].id === movingInsectId) {
                        continue;
                    }
                    occupiedCount++;
                }
            }
        }

        // It's a gate if both common neighbors are occupied
        return occupiedCount === 2;
    }

    /**
     * Check if a hex touches the hive (has at least one occupied neighbor)
     */
    touchesHive(hex, movingInsectId, excludeHex = null) {
        const neighbors = hex.getNeighbors();

        for (const neighbor of neighbors) {
            // Don't count the hex we're moving from
            if (excludeHex && neighbor.equals(excludeHex)) {
                continue;
            }

            const neighborKey = neighbor.toString();
            if (isHexOccupied(neighborKey)) {
                // Don't count if this hex only contains the moving insect
                const stack = getInsectStack(neighborKey);
                if (stack && stack.length > 0) {
                    if (stack.length === 1 && stack[0].id === movingInsectId) {
                        continue;
                    }
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Find the longest valid path toward the target when no complete path exists
     */
    findLongestPathToward(fromHex, toHex, movingInsectId) {
        let bestPath = [fromHex];
        let bestDistance = fromHex.distance(toHex);

        const visited = new Set([fromHex.toString()]);
        const queue = [{ hex: fromHex, path: [fromHex] }];

        while (queue.length > 0) {
            const current = queue.shift();
            const currentHex = current.hex;
            const currentPath = current.path;
            const distanceToTarget = currentHex.distance(toHex);

            // Update best path if this is closer to the target
            if (distanceToTarget < bestDistance ||
                (distanceToTarget === bestDistance && currentPath.length > bestPath.length)) {
                bestDistance = distanceToTarget;
                bestPath = currentPath;
            }

            // Explore neighbors
            const neighbors = this.getWalkingNeighbors(currentHex, movingInsectId);
            for (const neighbor of neighbors) {
                const neighborKey = neighbor.toString();
                if (!visited.has(neighborKey)) {
                    visited.add(neighborKey);
                    queue.push({
                        hex: neighbor,
                        path: [...currentPath, neighbor]
                    });
                }
            }
        }

        return { path: bestPath };
    }

    // ==========================================
    // GRASSHOPPER PATHFINDING
    // ==========================================

    /**
     * Find valid grasshopper jump to target
     * Grasshoppers jump in straight lines over occupied hexes with no gaps
     * Returns { success: boolean, path: Hex[], blockedAt: Hex|null }
     */
    findHopperPath(fromHex, toHex, movingInsectId) {
        // Get all 6 hex directions
        const directions = [
            { q: 1, r: 0 },   // East
            { q: 1, r: -1 },  // Northeast
            { q: 0, r: -1 },  // Northwest
            { q: -1, r: 0 },  // West
            { q: -1, r: 1 },  // Southwest
            { q: 0, r: 1 }    // Southeast
        ];

        // Check each direction
        for (const dir of directions) {
            const landingHex = this.findHopperLanding(fromHex, dir, movingInsectId);

            if (landingHex && landingHex.equals(toHex)) {
                // Found a valid jump to the target
                // Build the path showing the jump
                const jumpPath = this.buildHopperJumpPath(fromHex, toHex, dir, movingInsectId);
                return { success: true, path: jumpPath, blockedAt: null };
            }
        }

        // No valid jump to target - return empty path
        return { success: false, path: [fromHex], blockedAt: fromHex };
    }

    /**
     * Find where a grasshopper lands when jumping in a given direction
     * Returns the landing hex or null if jump is invalid
     */
    findHopperLanding(fromHex, direction, movingInsectId) {
        let currentHex = new Hex(fromHex.q + direction.q, fromHex.r + direction.r);
        let jumpedOverCount = 0;

        // Move in the direction while hexes are occupied
        while (true) {
            const hexKey = currentHex.toString();
            const isOccupied = isHexOccupied(hexKey);

            // Check if this hex contains only the moving insect
            const stack = getInsectStack(hexKey);
            const isMovingInsectOnly = stack && stack.length === 1 && stack[0].id === movingInsectId;

            if (!isOccupied || isMovingInsectOnly) {
                // Found an empty hex (or the hex we're moving from)
                if (jumpedOverCount === 0) {
                    // Must jump over at least one insect
                    return null;
                }
                // This is the landing spot
                return currentHex;
            }

            // This hex is occupied, continue jumping
            jumpedOverCount++;
            currentHex = new Hex(currentHex.q + direction.q, currentHex.r + direction.r);

            // Safety check: don't search too far
            if (jumpedOverCount > 50) {
                return null;
            }
        }
    }

    /**
     * Build the visual path for a grasshopper jump
     * Shows the arc from start to end, passing over all jumped hexes
     */
    buildHopperJumpPath(fromHex, toHex, direction, movingInsectId) {
        const path = [fromHex];
        let currentHex = new Hex(fromHex.q + direction.q, fromHex.r + direction.r);

        // Add all jumped-over hexes to show the path
        while (!currentHex.equals(toHex)) {
            path.push(currentHex);
            currentHex = new Hex(currentHex.q + direction.q, currentHex.r + direction.r);
        }

        path.push(toHex);
        return path;
    }

    /**
     * Get all valid grasshopper landing positions from a hex
     */
    getHopperLandings(fromHex, movingInsectId) {
        const directions = [
            { q: 1, r: 0 },   // East
            { q: 1, r: -1 },  // Northeast
            { q: 0, r: -1 },  // Northwest
            { q: -1, r: 0 },  // West
            { q: -1, r: 1 },  // Southwest
            { q: 0, r: 1 }    // Southeast
        ];

        const landings = [];
        for (const dir of directions) {
            const landing = this.findHopperLanding(fromHex, dir, movingInsectId);
            if (landing) {
                landings.push(landing);
            }
        }

        return landings;
    }

    // ==========================================
    // PLACEHOLDER METHODS FOR OTHER INSECTS
    // ==========================================

    // ==========================================
    // QUEEN PATHFINDING
    // ==========================================

    /**
     * Find a valid queen path to target
     * Queen walks exactly 1 space (same walking rules as ant/spider)
     * Returns { success: boolean, path: Hex[], blockedAt: Hex|null }
     */
    findQueenPath(fromHex, toHex, movingInsectId) {
        // Queen can only move 1 space
        if (fromHex.distance(toHex) !== 1) {
            return { success: false, path: [fromHex], blockedAt: fromHex };
        }

        // Check if this is a valid walking move (no gates, maintains connectivity)
        const walkingNeighbors = this.getWalkingNeighbors(fromHex, movingInsectId);
        const canReach = walkingNeighbors.some(neighbor => neighbor.equals(toHex));

        if (canReach) {
            return { success: true, path: [fromHex, toHex], blockedAt: null };
        } else {
            return { success: false, path: [fromHex], blockedAt: fromHex };
        }
    }

    // ==========================================
    // BEETLE PATHFINDING
    // ==========================================

    /**
     * Find a valid beetle path to target
     * Beetle moves exactly 1 space but can climb onto/over other insects
     * Returns { success: boolean, path: Hex[], blockedAt: Hex|null }
     */
    findBeetlePath(fromHex, toHex, movingInsectId) {
        // Beetle can only move 1 space
        if (fromHex.distance(toHex) !== 1) {
            return { success: false, path: [fromHex], blockedAt: fromHex };
        }

        // Check if this is a valid beetle move
        const validNeighbors = this.getBeetleNeighbors(fromHex, movingInsectId);
        const canReach = validNeighbors.some(neighbor => neighbor.equals(toHex));

        if (canReach) {
            return { success: true, path: [fromHex, toHex], blockedAt: null };
        } else {
            return { success: false, path: [fromHex], blockedAt: fromHex };
        }
    }

    /**
     * Get valid neighbors for a beetle move
     * Beetles can move to both empty hexes (like walking) and occupied hexes (climbing)
     */
    getBeetleNeighbors(fromHex, movingInsectId) {
        const allNeighbors = fromHex.getNeighbors();
        const validNeighbors = [];

        // Check if beetle is currently on top of the hive
        const fromStack = getInsectStack(fromHex.toString());
        const isOnTop = fromStack && fromStack.length > 1;

        for (const neighbor of allNeighbors) {
            const neighborKey = neighbor.toString();
            const neighborStack = getInsectStack(neighborKey);
            const isNeighborOccupied = neighborStack && neighborStack.length > 0 &&
                !(neighborStack.length === 1 && neighborStack[0].id === movingInsectId);

            if (isOnTop) {
                // Beetle is on top of the hive - can move to any adjacent hex (occupied or empty)
                // Must maintain at least one common neighbor with occupied hexes (can't break away completely)
                if (this.canBeetleMoveOnHive(fromHex, neighbor, movingInsectId)) {
                    validNeighbors.push(neighbor);
                }
            } else {
                // Beetle is on the ground
                if (isNeighborOccupied) {
                    // Can climb onto occupied hex (no gate restriction, unlimited stacking)
                    // Works regardless of stack height at destination
                    validNeighbors.push(neighbor);
                } else {
                    // Moving to empty hex - use normal walking rules (no gates)
                    if (!this.isGate(fromHex, neighbor, movingInsectId) &&
                        this.touchesHive(neighbor, movingInsectId, fromHex)) {
                        validNeighbors.push(neighbor);
                    }
                }
            }
        }

        return validNeighbors;
    }

    /**
     * Check if a beetle on top of the hive can move to a neighbor
     * When on top, beetle must maintain contact with the hive
     * Beetles can stack infinitely - no height limit
     */
    canBeetleMoveOnHive(fromHex, toHex, movingInsectId) {
        // Check if destination is occupied
        const toStack = getInsectStack(toHex.toString());
        const isToOccupied = toStack && toStack.length > 0 &&
            !(toStack.length === 1 && toStack[0].id === movingInsectId);

        // Special case: moving to another occupied hex (unlimited stacking)
        // Beetle can always climb onto another stack, regardless of height
        if (isToOccupied) {
            return true;
        }

        // Moving to an empty hex - need to verify connection to hive
        // Get common neighbors of fromHex and toHex
        const fromNeighbors = fromHex.getNeighbors();
        const toNeighbors = toHex.getNeighbors();

        const commonNeighbors = fromNeighbors.filter(fHex =>
            toNeighbors.some(tHex => fHex.equals(tHex))
        );

        // At least one common neighbor must be occupied (maintaining connection to hive)
        for (const commonHex of commonNeighbors) {
            const hexKey = commonHex.toString();
            const stack = getInsectStack(hexKey);

            if (stack && stack.length > 0) {
                // Don't count if this hex only contains the moving beetle
                if (stack.length === 1 && stack[0].id === movingInsectId) {
                    continue;
                }
                return true; // Found an occupied common neighbor
            }
        }

        // Moving down to an empty hex - must still touch the hive at destination
        return this.touchesHive(toHex, movingInsectId, fromHex);
    }

    // ==========================================
    // SPIDER PATHFINDING
    // ==========================================

    /**
     * Find a valid spider path to target
     * Spiders must walk exactly 3 spaces - no more, no less
     * Returns { success: boolean, path: Hex[], blockedAt: Hex|null }
     */
    findSpiderPath(fromHex, toHex, movingInsectId) {
        // BFS to find all paths of exactly 3 steps
        const queue = [{ hex: fromHex, path: [fromHex] }];
        const visited = new Map(); // Track visited hexes at each step
        visited.set(`${fromHex.toString()}-0`, true);

        let validPaths = []; // Store all valid 3-step paths to the target

        while (queue.length > 0) {
            const current = queue.shift();
            const currentHex = current.hex;
            const currentPath = current.path;
            const steps = currentPath.length - 1; // Number of steps taken

            // If we've taken 3 steps, check if we're at the target
            if (steps === 3) {
                if (currentHex.equals(toHex)) {
                    validPaths.push(currentPath);
                }
                continue; // Don't explore further from 3-step positions
            }

            // If we've taken fewer than 3 steps, continue exploring
            if (steps < 3) {
                const neighbors = this.getWalkingNeighbors(currentHex, movingInsectId);

                for (const neighbor of neighbors) {
                    const neighborKey = neighbor.toString();
                    const visitKey = `${neighborKey}-${steps + 1}`;

                    // Spider rule: cannot revisit a hex during the same move
                    const alreadyInPath = currentPath.some(hex => hex.equals(neighbor));

                    if (!visited.has(visitKey) && !alreadyInPath) {
                        visited.set(visitKey, true);
                        queue.push({
                            hex: neighbor,
                            path: [...currentPath, neighbor]
                        });
                    }
                }
            }
        }

        // If we found valid paths, return the first one (shortest/BFS order)
        if (validPaths.length > 0) {
            return { success: true, path: validPaths[0], blockedAt: null };
        }

        // No valid path found - try to find the longest valid path toward the target
        const partialPath = this.findLongestSpiderPathToward(fromHex, toHex, movingInsectId);
        return {
            success: false,
            path: partialPath.path,
            blockedAt: partialPath.path[partialPath.path.length - 1]
        };
    }

    /**
     * Find the longest valid spider path toward the target (up to 3 steps)
     * Used when no complete 3-step path exists
     */
    findLongestSpiderPathToward(fromHex, toHex, movingInsectId) {
        let bestPath = [fromHex];
        let bestDistance = fromHex.distance(toHex);

        const queue = [{ hex: fromHex, path: [fromHex] }];
        const visited = new Map();
        visited.set(`${fromHex.toString()}-0`, true);

        while (queue.length > 0) {
            const current = queue.shift();
            const currentHex = current.hex;
            const currentPath = current.path;
            const steps = currentPath.length - 1;
            const distanceToTarget = currentHex.distance(toHex);

            // Update best path if this is closer to the target
            if (distanceToTarget < bestDistance ||
                (distanceToTarget === bestDistance && currentPath.length > bestPath.length)) {
                bestDistance = distanceToTarget;
                bestPath = currentPath;
            }

            // Only explore up to 3 steps
            if (steps < 3) {
                const neighbors = this.getWalkingNeighbors(currentHex, movingInsectId);

                for (const neighbor of neighbors) {
                    const neighborKey = neighbor.toString();
                    const visitKey = `${neighborKey}-${steps + 1}`;

                    // Cannot revisit a hex during the same move
                    const alreadyInPath = currentPath.some(hex => hex.equals(neighbor));

                    if (!visited.has(visitKey) && !alreadyInPath) {
                        visited.set(visitKey, true);
                        queue.push({
                            hex: neighbor,
                            path: [...currentPath, neighbor]
                        });
                    }
                }
            }
        }

        return { path: bestPath };
    }

    // ==========================================
    // PLACEHOLDER METHODS FOR OTHER INSECTS
    // ==========================================

    // ==========================================
    // MOSQUITO PATHFINDING
    // ==========================================

    /**
     * Find valid mosquito path to target
     * Mosquito copies movement abilities from adjacent insects
     * Returns { success: boolean, path: Hex[], blockedAt: Hex|null, copiedFrom: string|null }
     */
    findMosquitoPath(fromHex, toHex, movingInsectId) {
        // Get all unique insect types adjacent to the mosquito
        const adjacentInsects = this.getMosquitoAdjacentInsects(fromHex, movingInsectId);

        // Early exit: No adjacent insects means mosquito can't move
        if (adjacentInsects.size === 0) {
            return { success: false, path: [fromHex], blockedAt: fromHex, copiedFrom: null };
        }

        // Try each adjacent insect's movement style
        for (const insectType of adjacentInsects) {
            let result = null;

            // Use the appropriate pathfinding based on the copied insect type
            switch (insectType) {
                case 'queen':
                    result = this.findQueenPath(fromHex, toHex, movingInsectId);
                    break;
                case 'ant':
                    result = this.findAntPath(fromHex, toHex, movingInsectId);
                    break;
                case 'beetle':
                    result = this.findBeetlePath(fromHex, toHex, movingInsectId);
                    break;
                case 'hopper':
                    result = this.findHopperPath(fromHex, toHex, movingInsectId);
                    break;
                case 'spider':
                    result = this.findSpiderPath(fromHex, toHex, movingInsectId);
                    break;
                case 'ladybug':
                    result = this.findLadybugPath(fromHex, toHex, movingInsectId);
                    break;
                case 'pillbug':
                    result = this.findPillbugPath(fromHex, toHex, movingInsectId);
                    break;
                // Note: Mosquito cannot copy another mosquito
            }

            // If this movement style works, use it!
            if (result && result.success) {
                result.copiedFrom = insectType;
                return result;
            }
        }

        // No valid movement found with any adjacent insect's abilities
        return { success: false, path: [fromHex], blockedAt: fromHex, copiedFrom: null };
    }

    /**
     * Get unique insect types adjacent to the mosquito
     * Returns array of insect type strings
     */
    getMosquitoAdjacentInsects(fromHex, movingInsectId) {
        const neighbors = fromHex.getNeighbors();
        const adjacentTypes = new Set();

        for (const neighbor of neighbors) {
            const neighborKey = neighbor.toString();
            const stack = getInsectStack(neighborKey);

            if (stack && stack.length > 0) {
                const topInsect = stack[stack.length - 1];

                // Don't copy from the mosquito itself
                if (topInsect.id === movingInsectId) {
                    continue;
                }

                // Mosquito cannot copy another mosquito
                if (topInsect.insect !== 'mosquito') {
                    adjacentTypes.add(topInsect.insect);
                }
            }
        }

        return adjacentTypes; // Return Set directly, not array
    }

    /**
     * Check if mosquito can use pillbug throw ability
     * Mosquito next to pillbug gains the throw ability!
     */
    canMosquitoUsePillbugThrow(mosquitoHex, mosquitoId) {
        // Performance check: Only check if mosquito is adjacent to a pillbug
        const adjacentInsects = this.getMosquitoAdjacentInsects(mosquitoHex, mosquitoId);

        if (!adjacentInsects.has('pillbug')) {
            return null; // No pillbug adjacent, mosquito can't throw
        }

        // Mosquito can act as a pillbug!
        // Check if there are throwable pieces adjacent to the mosquito
        const mosquitoNeighbors = mosquitoHex.getNeighbors();

        for (const neighbor of mosquitoNeighbors) {
            const neighborKey = neighbor.toString();
            const stack = getInsectStack(neighborKey);

            if (stack && stack.length > 0) {
                const piece = stack[stack.length - 1];

                // Skip the mosquito itself
                if (piece.id === mosquitoId) continue;

                // Check if mosquito (acting as pillbug) can throw this piece
                if (this.canPillbugThrowPiece(mosquitoHex, neighbor, piece.id)) {
                    return {
                        mosquito: true,
                        mosquitoHex: mosquitoHex,
                        canThrow: true
                    };
                }
            }
        }

        return null; // No throwable pieces
    }

    /**
     * Find which mosquito (if any) can throw a piece at the given hex
     * Mosquito must be adjacent to a pillbug AND able to throw the piece
     * Returns the mosquito insect object and its hex, or null
     */
    findMosquitoThatCanThrow(pieceHex, pieceId, currentPlayer) {
        // Find all mosquitoes belonging to the current player
        for (let hexKey of gameState.board.keys()) {
            const stack = getInsectStack(hexKey);
            if (!stack || stack.length === 0) continue;

            const topInsect = stack[stack.length - 1];

            // Check if this is the current player's mosquito
            if (topInsect.player === currentPlayer && topInsect.insect === 'mosquito') {
                const mosquitoHex = Hex.fromString(hexKey);

                // Performance: Early exit if mosquito is not adjacent to a pillbug
                const adjacentInsects = this.getMosquitoAdjacentInsects(mosquitoHex, topInsect.id);
                if (!adjacentInsects.has('pillbug')) {
                    continue; // This mosquito can't throw (no pillbug adjacent)
                }

                // Check if this mosquito can throw the piece
                if (this.canPillbugThrowPiece(mosquitoHex, pieceHex, pieceId)) {
                    return { mosquito: topInsect, mosquitoHex: mosquitoHex };
                }
            }
        }

        return null;
    }

    // ==========================================
    // LADYBUG PATHFINDING
    // ==========================================

    /**
     * Find a valid ladybug path to target
     * Ladybug has a specific 3-step movement pattern:
     * Step 1: Move ONTO the hive (to an occupied hex)
     * Step 2: Move ACROSS on top of the hive (to another occupied hex)
     * Step 3: Move DOWN from the hive (to an empty hex)
     * Returns { success: boolean, path: Hex[], blockedAt: Hex|null }
     */
    findLadybugPath(fromHex, toHex, movingInsectId) {
        // BFS to find all valid 3-step ladybug paths
        const queue = [{ hex: fromHex, path: [fromHex], step: 0 }];
        const visited = new Map();
        visited.set(`${fromHex.toString()}-0`, true);

        let validPaths = [];

        while (queue.length > 0) {
            const current = queue.shift();
            const currentHex = current.hex;
            const currentPath = current.path;
            const step = current.step;

            // If we've completed 3 steps, check if we're at the target
            if (step === 3) {
                if (currentHex.equals(toHex)) {
                    validPaths.push(currentPath);
                }
                continue;
            }

            // Get valid neighbors based on current step
            let validNeighbors = [];

            if (step === 0) {
                // Step 1: Must move ONTO the hive (to an occupied hex)
                validNeighbors = this.getLadybugStepOneNeighbors(currentHex, movingInsectId);
            } else if (step === 1) {
                // Step 2: Must move ACROSS on the hive (to another occupied hex)
                validNeighbors = this.getLadybugStepTwoNeighbors(currentHex, movingInsectId);
            } else if (step === 2) {
                // Step 3: Must move DOWN from the hive (to an empty hex)
                validNeighbors = this.getLadybugStepThreeNeighbors(currentHex, movingInsectId, fromHex);
            }

            for (const neighbor of validNeighbors) {
                const neighborKey = neighbor.toString();
                const visitKey = `${neighborKey}-${step + 1}`;

                if (!visited.has(visitKey)) {
                    visited.set(visitKey, true);
                    queue.push({
                        hex: neighbor,
                        path: [...currentPath, neighbor],
                        step: step + 1
                    });
                }
            }
        }

        // If we found valid paths, return the first one
        if (validPaths.length > 0) {
            return { success: true, path: validPaths[0], blockedAt: null };
        }

        // No valid path found - return partial path
        return { success: false, path: [fromHex], blockedAt: fromHex };
    }

    /**
     * Step 1: Get neighbors for climbing ONTO the hive
     * Must be adjacent occupied hexes
     */
    getLadybugStepOneNeighbors(fromHex, movingInsectId) {
        const allNeighbors = fromHex.getNeighbors();
        const validNeighbors = [];

        for (const neighbor of allNeighbors) {
            const neighborKey = neighbor.toString();
            const stack = getInsectStack(neighborKey);

            // Must be occupied (not counting the ladybug itself)
            if (stack && stack.length > 0) {
                if (stack.length === 1 && stack[0].id === movingInsectId) {
                    continue; // This is the ladybug's own position
                }
                validNeighbors.push(neighbor);
            }
        }

        return validNeighbors;
    }

    /**
     * Step 2: Get neighbors for moving ACROSS on top of the hive
     * Must be adjacent occupied hexes (staying on top)
     */
    getLadybugStepTwoNeighbors(fromHex, movingInsectId) {
        const allNeighbors = fromHex.getNeighbors();
        const validNeighbors = [];

        for (const neighbor of allNeighbors) {
            const neighborKey = neighbor.toString();
            const stack = getInsectStack(neighborKey);

            // Must be occupied (staying on top of the hive)
            if (stack && stack.length > 0) {
                if (stack.length === 1 && stack[0].id === movingInsectId) {
                    continue; // This is the ladybug's own starting position
                }
                validNeighbors.push(neighbor);
            }
        }

        return validNeighbors;
    }

    /**
     * Step 3: Get neighbors for climbing DOWN from the hive
     * Must be adjacent empty hexes that touch the hive
     */
    getLadybugStepThreeNeighbors(fromHex, movingInsectId, originalFromHex) {
        const allNeighbors = fromHex.getNeighbors();
        const validNeighbors = [];

        for (const neighbor of allNeighbors) {
            const neighborKey = neighbor.toString();
            const stack = getInsectStack(neighborKey);

            // Must be empty
            const isEmpty = !stack || stack.length === 0 ||
                (stack.length === 1 && stack[0].id === movingInsectId);

            if (isEmpty) {
                // Must still touch the hive after landing
                if (this.touchesHive(neighbor, movingInsectId, originalFromHex)) {
                    validNeighbors.push(neighbor);
                }
            }
        }

        return validNeighbors;
    }

    // ==========================================
    // PILLBUG PATHFINDING
    // ==========================================

    /**
     * Find a valid pillbug path to target
     * Pillbug walks exactly 1 space (like queen, no climbing)
     * Note: Pillbug also has a special "throw" ability handled separately
     * Returns { success: boolean, path: Hex[], blockedAt: Hex|null }
     */
    findPillbugPath(fromHex, toHex, movingInsectId) {
        // Pillbug walks exactly 1 space (like queen)
        if (fromHex.distance(toHex) !== 1) {
            return { success: false, path: [fromHex], blockedAt: fromHex };
        }

        // Check if this is a valid walking move (no gates, maintains connectivity)
        const walkingNeighbors = this.getWalkingNeighbors(fromHex, movingInsectId);
        const canReach = walkingNeighbors.some(neighbor => neighbor.equals(toHex));

        if (canReach) {
            return { success: true, path: [fromHex, toHex], blockedAt: null };
        } else {
            return { success: false, path: [fromHex], blockedAt: fromHex };
        }
    }

    /**
     * Check if a pillbug can throw an adjacent piece
     * The piece must:
     * 1. Be adjacent to the pillbug
     * 2. Not be in a stack (can't throw beetles on/under other pieces)
     * 3. Removing it won't split the hive
     */
    canPillbugThrowPiece(pillbugHex, pieceHex, pieceId) {
        // Must be adjacent
        if (pillbugHex.distance(pieceHex) !== 1) {
            return false;
        }

        const stack = getInsectStack(pieceHex.toString());

        // Piece must exist
        if (!stack || stack.length === 0) {
            return false;
        }

        // Must not be in a stack (only single pieces can be thrown)
        if (stack.length > 1) {
            return false;
        }

        // Check if removing this piece would split the hive
        if (this.wouldSplitHive(pieceHex, pieceId)) {
            return false;
        }

        return true;
    }

    /**
     * Get valid throw destinations for a piece being thrown by pillbug
     * Must be adjacent to the pillbug (but not the original position)
     */
    getPillbugThrowDestinations(pillbugHex, thrownPieceHex, thrownPieceId) {
        const neighbors = pillbugHex.getNeighbors();
        const validDestinations = [];

        for (const neighbor of neighbors) {
            // Can't throw back to original position
            if (neighbor.equals(thrownPieceHex)) {
                continue;
            }

            const neighborKey = neighbor.toString();
            const stack = getInsectStack(neighborKey);

            // Must be empty (or will become empty when the piece is removed)
            const isEmpty = !stack || stack.length === 0 ||
                (stack.length === 1 && stack[0].id === thrownPieceId);

            if (isEmpty) {
                // Must touch the hive after placement (excluding the thrown piece's current position)
                if (this.touchesHive(neighbor, thrownPieceId, thrownPieceHex)) {
                    validDestinations.push(neighbor);
                }
            }
        }

        return validDestinations;
    }

    /**
     * Find which pillbug (if any) can throw a piece at the given hex
     * Returns the pillbug insect object and its hex, or null
     */
    findPillbugThatCanThrow(pieceHex, pieceId, currentPlayer) {
        // Find all pillbugs belonging to the current player
        for (let hexKey of gameState.board.keys()) {
            const stack = getInsectStack(hexKey);
            if (!stack || stack.length === 0) continue;

            const topInsect = stack[stack.length - 1];

            // Check if this is the current player's pillbug
            if (topInsect.player === currentPlayer && topInsect.insect === 'pillbug') {
                const pillbugHex = Hex.fromString(hexKey);

                // Check if this pillbug can throw the piece
                if (this.canPillbugThrowPiece(pillbugHex, pieceHex, pieceId)) {
                    return { pillbug: topInsect, pillbugHex: pillbugHex };
                }
            }
        }

        return null;
    }

    /**
     * Get valid throw destinations from a specific pillbug for a piece
     * This creates the path for the throw movement
     */
    findPillbugThrowPath(pillbugHex, fromHex, toHex, pieceId) {
        // Check if the destination is valid
        const validDestinations = this.getPillbugThrowDestinations(pillbugHex, fromHex, pieceId);
        const canReach = validDestinations.some(dest => dest.equals(toHex));

        if (canReach) {
            // Path shows: start -> pillbug -> destination (visual representation of throw)
            return {
                success: true,
                path: [fromHex, pillbugHex, toHex],
                blockedAt: null,
                isPillbugThrow: true
            };
        } else {
            return {
                success: false,
                path: [fromHex],
                blockedAt: fromHex,
                isPillbugThrow: false
            };
        }
    }

    /**
     * Check if removing a piece from a hex would split the hive
     * This is crucial for validating pillbug throws
     */
    wouldSplitHive(hexToRemove) {
        const hexKey = hexToRemove.toString();

        // Temporarily mark this hex as if the piece was removed
        const originalStack = getInsectStack(hexKey);
        if (!originalStack || originalStack.length === 0) {
            return false; // No piece to remove
        }

        // Find all occupied hexes (excluding the one we're checking)
        const occupiedHexes = [];
        for (let key of gameState.board.keys()) {
            if (key === hexKey) continue; // Skip the hex we're removing from

            const stack = getInsectStack(key);
            if (stack && stack.length > 0) {
                occupiedHexes.push(Hex.fromString(key));
            }
        }

        if (occupiedHexes.length === 0) {
            return false; // Only one piece left, can't split
        }

        // Use flood fill to check if all remaining pieces are connected
        const visited = new Set();
        const queue = [occupiedHexes[0]];
        visited.add(occupiedHexes[0].toString());

        while (queue.length > 0) {
            const current = queue.shift();
            const neighbors = current.getNeighbors();

            for (const neighbor of neighbors) {
                const neighborKey = neighbor.toString();

                // Skip the hex we're removing from
                if (neighborKey === hexKey) continue;

                // If this neighbor is occupied and not visited, add to queue
                if (!visited.has(neighborKey)) {
                    const isOccupied = occupiedHexes.some(hex => hex.toString() === neighborKey);
                    if (isOccupied) {
                        visited.add(neighborKey);
                        queue.push(neighbor);
                    }
                }
            }
        }

        // If we visited all occupied hexes, the hive stays connected
        return visited.size !== occupiedHexes.length;
    }
}

// Create a global instance of the movement system
const movementSystem = new MovementSystem();

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

// Centralized theme color definitions (organized by UI component)
const THEME_COLORS = {
    green: {
        // === HEXAGONS ===
        'hexagon-empty': '#071508',
        'hexagon-stroke': '#1a4530',
        'hexagon-glow': 'rgba(45, 122, 79, 0.8)',
        'valid-move-glow': 'rgba(74, 159, 104, 0.9)',

        // === BOARD AREA ===
        'board-area-gradient-start': 'rgba(26, 71, 42, 0.3)',
        'board-area-gradient-end': 'rgba(13, 42, 24, 0.3)',
        'board-dark': '#050f08',

        // === HAND AREA ===
        'hand-border': '#2d7a4f',
        'hand-insect-bg-start': '#1a4530',
        'hand-insect-bg-end': '#0d2a18',
        'hand-insect-border': '#2d7a4f',
        'hand-insect-hover': '#6bb98a',
        'hand-insect-shadow': 'rgba(45, 122, 79, 0.1)',
        'hand-insect-hover-shadow': 'rgba(45, 122, 79, 0.6)',

        // === BUTTONS ===
        'button-background': 'rgba(45, 122, 79, 0.5)',
        'button-border': '#2d7a4f',
        'button-border-opacity': 'rgba(45, 122, 79, 0.3)',
        'button-hover-bg': '#3d9a5f',
        'button-hover-border': 'rgba(45, 122, 79, 0.6)',
        'button-hover-shadow': 'rgba(45, 122, 79, 0.2)',
        'button-active-light': '#3d9a5f',
        'button-active-bg-end': '#2a5540',

        // === PLAYER INFO ===
        'player-info-bg': '#0a1f13',
        'player-message-bg': '#0a1f13',
        'player-dragging-label': '#4a9f68',

        // === MODALS & POPUPS ===
        'modal-border': '#2d7a4f',
        'modal-bg': 'rgba(13, 42, 24, 0.95)',
        'piece-info-popup-bg': 'rgba(13, 42, 24, 0.95)',
        'piece-info-popup-border': '#4a9f68',
        'popup-background': 'rgba(45, 122, 79, 0.1)',

        // === BODY & CONTAINER ===
        'body-bg-light': '#1a472a',
        'body-bg-dark': '#0a1f13',
        'container-bg-start': '#1a472a',
        'container-bg-end': '#0d2a18',
        'wrapper-gradient-start': 'rgba(45, 122, 79, 0.5)',
        'wrapper-gradient-end': 'rgba(45, 122, 79, 0.1)',

        // === MISC ===
        'default-accent': '#4a9f68',
        'game-rules-link': '#ff8800'
    },
    blue: {
        // === HEXAGONS ===
        'hexagon-empty': '#051020',
        'hexagon-stroke': '#2255aa',
        'hexagon-glow': 'rgba(85, 153, 255, 0.8)',
        'valid-move-glow': 'rgba(100, 170, 255, 0.9)',

        // === BOARD AREA ===
        'board-area-gradient-start': 'rgba(40, 70, 130, 0.3)',
        'board-area-gradient-end': 'rgba(25, 42, 75, 0.3)',
        'board-dark': '#030c18',

        // === HAND AREA ===
        'hand-border': '#5599ff',
        'hand-insect-bg-start': '#1a3d77',
        'hand-insect-bg-end': '#0d2550',
        'hand-insect-border': '#5599ff',
        'hand-insect-hover': '#88bbff',
        'hand-insect-shadow': 'rgba(85, 153, 255, 0.05)',
        'hand-insect-hover-shadow': 'rgba(85, 153, 255, 0.6)',

        // === BUTTONS ===
        'button-background': 'rgba(85, 153, 255, 0.5)',
        'button-border': '#5599ff',
        'button-border-opacity': 'rgba(85, 153, 255, 0.3)',
        'button-hover-bg': '#66aaff',
        'button-hover-border': 'rgba(85, 153, 255, 0.6)',
        'button-hover-shadow': 'rgba(85, 153, 255, 0.2)',
        'button-active-light': '#66aaff',
        'button-active-bg-end': '#3377cc',

        // === PLAYER INFO ===
        'player-info-bg': '#0a1a35',
        'player-message-bg': '#0a1a35',
        'player-dragging-label': '#5599ff',

        // === MODALS & POPUPS ===
        'modal-border': '#5599ff',
        'modal-bg': 'rgba(25, 50, 90, 0.95)',
        'piece-info-popup-bg': 'rgba(25, 50, 90, 0.95)',
        'piece-info-popup-border': '#5599ff',
        'popup-background': 'rgba(85, 153, 255, 0.05)',

        // === BODY & CONTAINER ===
        'body-bg-light': '#1a3a6a',
        'body-bg-dark': '#0a1a35',
        'container-bg-start': '#1a3a6a',
        'container-bg-end': '#0d2550',
        'wrapper-gradient-start': 'rgba(85, 153, 255, 0.5)',
        'wrapper-gradient-end': 'rgba(85, 153, 255, 0.05)',

        // === MISC ===
        'default-accent': '#5599ff',
        'game-rules-link': '#88bbff'
    },
    orange: {
        // === HEXAGONS ===
        'hexagon-empty': '#201508',
        'hexagon-stroke': '#cc7722',
        'hexagon-glow': 'rgba(255, 170, 68, 0.8)',
        'valid-move-glow': 'rgba(255, 190, 100, 0.9)',

        // === BOARD AREA ===
        'board-area-gradient-start': 'rgba(130, 85, 35, 0.3)',
        'board-area-gradient-end': 'rgba(75, 50, 20, 0.3)',
        'board-dark': '#150c05',

        // === HAND AREA ===
        'hand-border': '#ffaa44',
        'hand-insect-bg-start': '#995522',
        'hand-insect-bg-end': '#503510',
        'hand-insect-border': '#ffaa44',
        'hand-insect-hover': '#ffcc88',
        'hand-insect-shadow': 'rgba(255, 170, 68, 0.05)',
        'hand-insect-hover-shadow': 'rgba(255, 170, 68, 0.6)',

        // === BUTTONS ===
        'button-background': 'rgba(255, 170, 68, 0.5)',
        'button-border': '#ffaa44',
        'button-border-opacity': 'rgba(255, 170, 68, 0.3)',
        'button-hover-bg': '#ffbb66',
        'button-hover-border': 'rgba(255, 170, 68, 0.6)',
        'button-hover-shadow': 'rgba(255, 170, 68, 0.2)',
        'button-active-light': '#ffbb66',
        'button-active-bg-end': '#dd8833',

        // === PLAYER INFO ===
        'player-info-bg': '#352510',
        'player-message-bg': '#352510',
        'player-dragging-label': '#ffaa44',

        // === MODALS & POPUPS ===
        'modal-border': '#ffaa44',
        'modal-bg': 'rgba(90, 60, 25, 0.95)',
        'piece-info-popup-bg': 'rgba(90, 60, 25, 0.95)',
        'piece-info-popup-border': '#ffaa44',
        'popup-background': 'rgba(255, 170, 68, 0.05)',

        // === BODY & CONTAINER ===
        'body-bg-light': '#6a4a1a',
        'body-bg-dark': '#352510',
        'container-bg-start': '#6a4a1a',
        'container-bg-end': '#503510',
        'wrapper-gradient-start': 'rgba(255, 170, 68, 0.5)',
        'wrapper-gradient-end': 'rgba(255, 170, 68, 0.05)',

        // === MISC ===
        'default-accent': '#ffaa44',
        'game-rules-link': '#dd6611'
    }
};

let gameState = {
    board: new Map(), // key: hex.toString(), value: Array of insects (stacked, top = last)
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
    turnCount: { 1: 0, 2: 0 },
    // Statistics tracking
    startTime: null,
    moveHistory: [], // Array of {player, insect, from, to, timestamp}
    insectMoveCount: {} // Track moves per insect type for "most active insect"
};

// Helper functions for stacked insects
function getTopInsect(hexKey) {
    const stack = gameState.board.get(hexKey);
    if (!stack || stack.length === 0) return null;
    return stack[stack.length - 1];
}

function getInsectStack(hexKey) {
    return gameState.board.get(hexKey) || [];
}

function isHexOccupied(hexKey) {
    const stack = gameState.board.get(hexKey);
    return stack && stack.length > 0;
}

function addInsectToHex(hexKey, insect) {
    if (!gameState.board.has(hexKey)) {
        gameState.board.set(hexKey, []);
    }
    gameState.board.get(hexKey).push(insect);
}

function removeTopInsect(hexKey) {
    const stack = gameState.board.get(hexKey);
    if (stack && stack.length > 0) {
        const removed = stack.pop();
        if (stack.length === 0) {
            gameState.board.delete(hexKey);
        }
        return removed;
    }
    return null;
}

const HEX_SIZE = 50;
const HEX_MARGIN = 2;
const HEX_ACTUAL_SIZE = HEX_SIZE - HEX_MARGIN;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 1.4;
const MIN_AUTO_ZOOM = 0.8;

// ============================================
// HEXAGON RENDERING & CONVERSION
// ============================================

function hexToPixel(hex) {
    const q = hex.q;
    const r = hex.r;
    // Pointy-top orientation
    const x = HEX_ACTUAL_SIZE * (Math.sqrt(3) * q + Math.sqrt(3)/2 * r);
    const y = HEX_ACTUAL_SIZE * (3/2 * r);
    return { x, y };
}

function pixelToHex(x, y) {
    // Pointy-top orientation
    const q = (Math.sqrt(3)/3 * x - 1/3 * y) / HEX_ACTUAL_SIZE;
    const r = (2/3 * y) / HEX_ACTUAL_SIZE;
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

    // Cache the element (event listeners added via delegation)
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
        // Rotate by 30 degrees (π/6) to make pointy edge down
        const angle = Math.PI / 3 * i + Math.PI / 6;
        const x = 50 + 45 * Math.cos(angle);
        const y = 50 + 45 * Math.sin(angle);
        points.push(`${x},${y}`);
    }
    polygon.setAttribute('points', points.join(' '));
    polygon.setAttribute('fill', getComputedStyle(document.documentElement).getPropertyValue('--theme-hexagon-empty') || 'rgba(45, 122, 79, 0.35)');
    polygon.setAttribute('stroke', getComputedStyle(document.documentElement).getPropertyValue('--theme-hexagon-stroke') || '#2d7a4f');
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
    draggedFromHand: null, // Tag for which insect type is being dragged from hand (not yet committed)
    lastClientX: 0, // Track last known position for touch events
    lastClientY: 0
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
    document.addEventListener('touchcancel', endPan);
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
    document.removeEventListener('touchcancel', endPan);
}

function handleHexagonMouseDown(e) {
    const hexElement = e.currentTarget.closest('.hexagon') || e.currentTarget;
    if (!hexElement.dataset.hex) return;

    const hex = new Hex(...hexElement.dataset.hex.split(',').map(Number));
    const insect = getTopInsect(hex.toString());

    if (insect) {
        // Simple check: Can this piece move at all?
        const movementTypes = getAvailableMovementTypes(insect, hex);
        if (movementTypes.length > 0) {
            selectAndDrag(e, 'board', insect);
        }
    } else {
        startPan(e);
    }
}

function handleHexagonTouchStart(e) {
    e.preventDefault();
    const hexElement = e.currentTarget.closest('.hexagon') || e.currentTarget;
    if (!hexElement.dataset.hex) return;

    const hex = new Hex(...hexElement.dataset.hex.split(',').map(Number));
    const insect = getTopInsect(hex.toString());

    if (insect) {
        // Simple check: Can this piece move at all?
        const movementTypes = getAvailableMovementTypes(insect, hex);
        if (movementTypes.length > 0) {
            const insectElement = hexElement.querySelector('.insect, .stacked-insect');
            if (insectElement) {
                const touch = e.touches[0];
                selectAndDragTouch(touch, insectElement, 'board', insect);
            }
        }
    } else {
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
    document.addEventListener('touchcancel', cancelDragIfNotStarted);
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
    document.addEventListener('touchcancel', cancelDragIfNotStarted);
}

function beginDragOnMove(e) {
    if (dragState.isDragging) {
        handleDragMove(e);
        return;
    }

    dragState.isDragging = true;

    // Set global cursor to grabbing during drag
    document.body.classList.add('dragging');

    // Tag the insect being dragged from hand (don't modify game state yet)
    if (dragState.dragSource === 'hand') {
        dragState.draggedFromHand = dragState.sourceData;
        updateHandVisualCount(); // Update count badge without full re-render (performance)
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
    document.removeEventListener('touchcancel', cancelDragIfNotStarted);

    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('touchmove', handleDragMoveTouch, { passive: false });
    document.addEventListener('mouseup', handleDragEnd);
    document.addEventListener('touchend', handleDragEnd);
    document.addEventListener('touchcancel', handleDragEnd);

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
        document.removeEventListener('touchcancel', cancelDragIfNotStarted);

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

    // Track last known position for touch events (touchend doesn't have clientX/Y)
    dragState.lastClientX = e.clientX;
    dragState.lastClientY = e.clientY;

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
            dragState.lastHighlightedHex.classList.remove('valid-move', 'invalid-move');
            dragState.lastHighlightedHex.style.removeProperty('--player-color');
            dragState.lastHighlightedHex = null;
        }
        // Clear path visualization
        movementSystem.clearPath();
        return;
    }

    const hexKey = hexElement.dataset.hex;

    // Same hexagon - no need to update
    if (dragState.lastHighlightedHex === hexElement) {
        return;
    }

    // Clear previous highlight
    if (dragState.lastHighlightedHex) {
        dragState.lastHighlightedHex.classList.remove('valid-move', 'invalid-move');
        dragState.lastHighlightedHex.style.removeProperty('--player-color');
        dragState.lastHighlightedHex = null;
    }

    const hex = new Hex(...hexKey.split(',').map(Number));
    const playerColor = gameState.currentPlayer === 1 ? '#5599ff' : '#ffaa44';

    if (dragState.dragSource === 'hand') {
        const isOccupied = isHexOccupied(hexKey);

        // Cannot place on occupied hexes (beetles can only climb when moving, not placing)
        const canPlace = !isOccupied && canPlaceInsect(hex);

        if (canPlace) {
            hexElement.style.setProperty('--player-color', playerColor);
            hexElement.classList.add('valid-move');
            dragState.lastHighlightedHex = hexElement;
        } else {
            // Invalid placement
            hexElement.classList.add('invalid-move');
            dragState.lastHighlightedHex = hexElement;
        }
    } else if (dragState.dragSource === 'board') {
        // Get the insect being moved
        const insect = dragState.sourceData;

        // Find current position
        let fromHex = null;
        for (let hKey of gameState.board.keys()) {
            const stack = getInsectStack(hKey);
            if (stack && stack.some(bug => bug.id === insect.id)) {
                fromHex = Hex.fromString(hKey);
                break;
            }
        }

        if (fromHex && isValidMove(insect, fromHex, hex)) {
            hexElement.style.setProperty('--player-color', playerColor);
            hexElement.classList.add('valid-move');
            dragState.lastHighlightedHex = hexElement;

            // Draw path for insects with pathfinding
            const insectsWithPaths = ['ant', 'hopper', 'spider', 'queen', 'beetle', 'ladybug', 'pillbug', 'mosquito'];
            if (insectsWithPaths.includes(insect.insect) && movementSystem.currentPath) {
                movementSystem.drawPath(
                    movementSystem.currentPath.path,
                    playerColor,
                    movementSystem.currentPath.success
                );
            }
        } else {
            // Invalid move
            hexElement.classList.add('invalid-move');
            dragState.lastHighlightedHex = hexElement;

            // Draw truncated path even if move is invalid
            const insectsWithPaths = ['ant', 'hopper', 'spider', 'queen', 'beetle', 'ladybug', 'pillbug', 'mosquito'];
            if (insectsWithPaths.includes(insect.insect) && movementSystem.currentPath && movementSystem.currentPath.path) {
                movementSystem.drawPath(
                    movementSystem.currentPath.path,
                    playerColor,
                    false // Invalid path
                );
            }
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

    // Clear all valid-move and invalid-move highlights (belt and suspenders approach)
    document.querySelectorAll('.hexagon.valid-move, .hexagon.invalid-move').forEach(hex => {
        hex.classList.remove('valid-move', 'invalid-move');
        hex.style.removeProperty('--player-color');
    });
    dragState.lastHighlightedHex = null;

    // Clear path visualization
    movementSystem.clearPath();

    if (wasDragging) {
        // For touch events, touchend doesn't have clientX/Y, use last tracked position
        const clientX = e.clientX !== undefined ? e.clientX : dragState.lastClientX;
        const clientY = e.clientY !== undefined ? e.clientY : dragState.lastClientY;

        const dropElement = document.elementFromPoint(clientX, clientY);
        const hexElement = dropElement?.closest('.hexagon');

        if (hexElement) {
            const hex = new Hex(...hexElement.dataset.hex.split(',').map(Number));

            if (dragState.dragSource === 'hand') {
                const placed = placeInsect(hex, dragState.sourceData);
                if (!placed) {
                    // Placement failed - clear the tag and update count (performance)
                    dragState.draggedFromHand = null;
                    updateHandVisualCount();
                }
                // If placement succeeded, placeInsect already decremented the counter and tag is cleared below
            } else if (dragState.dragSource === 'board') {
                moveInsect(dragState.sourceData, hex);
            }
        } else {
            // Dropped on invalid location - clear tag and update count (performance)
            if (dragState.dragSource === 'hand' && dragState.draggedFromHand) {
                dragState.draggedFromHand = null;
                updateHandVisualCount();
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

    // Reset cursor
    document.body.classList.remove('dragging');
    dragState.lastClientX = 0;
    dragState.lastClientY = 0;

    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('touchmove', handleDragMoveTouch, { passive: false });
    document.removeEventListener('mouseup', handleDragEnd);
    document.removeEventListener('touchend', handleDragEnd);
    document.removeEventListener('touchcancel', handleDragEnd);
    document.removeEventListener('mousemove', beginDragOnMove);
    document.removeEventListener('touchmove', beginDragOnMoveTouch, { passive: false });
    document.removeEventListener('mouseup', cancelDragIfNotStarted);
    document.removeEventListener('touchend', cancelDragIfNotStarted);
    document.removeEventListener('touchcancel', cancelDragIfNotStarted);
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

    // Cannot place on occupied hexes (beetles can only climb when moving, not placing)
    if (isHexOccupied(hexKey)) {
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
    addInsectToHex(hexKey, {
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

    // Track move history and insect move count
    gameState.moveHistory.push({
        player: gameState.currentPlayer,
        insect: insectType,
        from: null,
        to: hexKey,
        timestamp: Date.now()
    });
    gameState.insectMoveCount[insectType] = (gameState.insectMoveCount[insectType] || 0) + 1;

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
    for (let hexKey of gameState.board.keys()) {
        const insect = getTopInsect(hexKey);
        if (insect && insect.player === currentPlayer) currentPlayerPieces++;
        if (insect && insect.player === opponentPlayer) opponentPieces++;
    }

    // First piece: can be placed anywhere (no restrictions)
    if (currentPlayerPieces === 0 && opponentPieces === 0) {
        return true;
    }

    // Second piece (opponent's first piece already placed): must touch opponent
    if (currentPlayerPieces === 0 && opponentPieces > 0) {
        return neighbors.some(n => {
            const insect = getTopInsect(n.toString());
            return insect && insect.player === opponentPlayer;
        });
    }

    // After first piece: must touch friendly pieces only, NOT opponent pieces
    const hasFriendlyNeighbor = neighbors.some(n => {
        const insect = getTopInsect(n.toString());
        return insect && insect.player === currentPlayer;
    });

    const hasOpponentNeighbor = neighbors.some(n => {
        const insect = getTopInsect(n.toString());
        return insect && insect.player === opponentPlayer;
    });

    return hasFriendlyNeighbor && !hasOpponentNeighbor;
}

// ============================================
// MOVEMENT VALIDATION
// ============================================

// Check if a move is valid for an insect
// This function checks MULTIPLE movement styles and returns true if ANY are valid
// ============================================
// LAYERED MOVEMENT SYSTEM
// ============================================

/**
 * LAYER 1: Get all available movement types for a piece
 * This is the simple layer - just checks what's theoretically possible
 */
function getAvailableMovementTypes(insect, fromHex) {
    const types = [];

    // Type 1: Normal movement (if it's the current player's piece)
    if (insect.player === gameState.currentPlayer) {
        types.push({
            type: 'normal',
            insectType: insect.insect
        });
    }

    // Type 2: Pillbug throw (only check if there might be pillbugs nearby)
    // This is still cheap - just checks if current player has pillbugs on the board
    const currentPlayerHasPillbugs = Array.from(gameState.board.values()).some(stack => {
        const top = stack[stack.length - 1];
        return top && top.player === gameState.currentPlayer && top.insect === 'pillbug';
    });

    if (currentPlayerHasPillbugs) {
        const pillbugInfo = movementSystem.findPillbugThatCanThrow(fromHex, insect.id, gameState.currentPlayer);
        if (pillbugInfo) {
            types.push({
                type: 'pillbug_throw',
                throwerHex: pillbugInfo.pillbugHex,
                throwerId: pillbugInfo.pillbug.id
            });
        }
    }

    // Type 3: Mosquito throw (only check if current player has mosquitoes)
    const currentPlayerHasMosquitoes = Array.from(gameState.board.values()).some(stack => {
        const top = stack[stack.length - 1];
        return top && top.player === gameState.currentPlayer && top.insect === 'mosquito';
    });

    if (currentPlayerHasMosquitoes) {
        const mosquitoInfo = movementSystem.findMosquitoThatCanThrow(fromHex, insect.id, gameState.currentPlayer);
        if (mosquitoInfo) {
            types.push({
                type: 'mosquito_throw',
                throwerHex: mosquitoInfo.mosquitoHex,
                throwerId: mosquitoInfo.mosquito.id
            });
        }
    }

    return types;
}

/**
 * LAYER 2: Check if a specific movement type allows a move
 * This is where the complex pathfinding happens
 */
function canMoveUsingType(movementType, insect, fromHex, toHex) {
    switch (movementType.type) {
        case 'normal':
            return canMoveNormally(insect, fromHex, toHex);

        case 'pillbug_throw':
            const throwResult = movementSystem.findPillbugThrowPath(
                movementType.throwerHex,
                fromHex,
                toHex,
                insect.id
            );
            if (throwResult.success) {
                movementSystem.currentPath = throwResult;
                return true;
            }
            return false;

        case 'mosquito_throw':
            const mosquitoThrowResult = movementSystem.findPillbugThrowPath(
                movementType.throwerHex,
                fromHex,
                toHex,
                insect.id
            );
            if (mosquitoThrowResult.success) {
                movementSystem.currentPath = mosquitoThrowResult;
                return true;
            }
            return false;

        default:
            return false;
    }
}

/**
 * Check if piece can move normally (own movement pattern)
 */
function canMoveNormally(insect, fromHex, toHex) {
    // Rule: Target must be unoccupied (unless beetle/mosquito climbing)
    const targetOccupied = isHexOccupied(toHex.toString());
    if (targetOccupied) {
        const canClimb = insect.insect === 'beetle' ||
                        (insect.insect === 'mosquito' && canMosquitoClimbAsBeelle(fromHex, insect.id));
        if (!canClimb) {
            return false;
        }
    }

    // Rule: Target must touch at least one other insect (connectivity)
    const neighbors = toHex.getNeighbors();
    const touchesOtherInsect = neighbors.some(n => {
        const neighborKey = n.toString();
        if (neighborKey === fromHex.toString()) return false;
        return isHexOccupied(neighborKey);
    });

    if (!touchesOtherInsect && gameState.board.size > 1) {
        return false;
    }

    // Try insect-specific movement validation
    return canInsectReach(insect, fromHex, toHex);
}

/**
 * LAYER 3: Main validation function - checks all movement types
 */
function isValidMove(insect, fromHex, toHex) {
    const movementTypes = getAvailableMovementTypes(insect, fromHex);

    // Try each movement type until we find one that works
    for (const movementType of movementTypes) {
        if (canMoveUsingType(movementType, insect, fromHex, toHex)) {
            return true;
        }
    }

    return false;
}

// Check if mosquito is adjacent to a beetle (for climbing ability)
function canMosquitoClimbAsBeelle(mosquitoHex, mosquitoId) {
    // Check if mosquito has beetle adjacent
    const adjacentInsects = movementSystem.getMosquitoAdjacentInsects(mosquitoHex, mosquitoId);
    return adjacentInsects.has('beetle');
}

// Insect-specific pathfinding (placeholders)
function canInsectReach(insect, fromHex, toHex) {
    const insectType = insect.insect;

    switch (insectType) {
        case 'queen':
            return canQueenReach(insect, fromHex, toHex);
        case 'ant':
            return canAntReach(insect, fromHex, toHex);
        case 'beetle':
            return canBeetleReach(insect, fromHex, toHex);
        case 'hopper':
            return canHopperReach(insect, fromHex, toHex);
        case 'spider':
            return canSpiderReach(insect, fromHex, toHex);
        case 'mosquito':
            return canMosquitoReach(insect, fromHex, toHex);
        case 'ladybug':
            return canLadybugReach(insect, fromHex, toHex);
        case 'pillbug':
            return canPillbugReach(insect, fromHex, toHex);
        default:
            return false;
    }
}

// Insect pathfinding functions
function canQueenReach(insect, fromHex, toHex) {
    // Queen walks exactly 1 space using pathfinding
    const result = movementSystem.findQueenPath(fromHex, toHex, insect.id);

    // Store the path for visualization
    movementSystem.currentPath = result;

    return result.success;
}

function canAntReach(insect, fromHex, toHex) {
    // Ant can move any distance around the hive using pathfinding
    const result = movementSystem.findAntPath(fromHex, toHex, insect.id);

    // Store the path for visualization
    movementSystem.currentPath = result;

    return result.success;
}

function canBeetleReach(insect, fromHex, toHex) {
    // Beetle moves 1 space, can climb using pathfinding
    const result = movementSystem.findBeetlePath(fromHex, toHex, insect.id);

    // Store the path for visualization
    movementSystem.currentPath = result;

    return result.success;
}

function canHopperReach(insect, fromHex, toHex) {
    // Grasshopper jumps in straight line over insects using pathfinding
    const result = movementSystem.findHopperPath(fromHex, toHex, insect.id);

    // Store the path for visualization
    movementSystem.currentPath = result;

    return result.success;
}

function canSpiderReach(insect, fromHex, toHex) {
    // Spider must walk exactly 3 spaces using pathfinding
    const result = movementSystem.findSpiderPath(fromHex, toHex, insect.id);

    // Store the path for visualization
    movementSystem.currentPath = result;

    return result.success;
}

function canMosquitoReach(insect, fromHex, toHex) {
    // Mosquito copies movement from adjacent insects
    const result = movementSystem.findMosquitoPath(fromHex, toHex, insect.id);

    // Store the path for visualization
    movementSystem.currentPath = result;

    return result.success;
}

function canLadybugReach(insect, fromHex, toHex) {
    // Ladybug has specific 3-step pattern: up, across, down
    const result = movementSystem.findLadybugPath(fromHex, toHex, insect.id);

    // Store the path for visualization
    movementSystem.currentPath = result;

    return result.success;
}

function canPillbugReach(insect, fromHex, toHex) {
    // Pillbug walks exactly 1 space (like queen)
    const result = movementSystem.findPillbugPath(fromHex, toHex, insect.id);

    // Store the path for visualization
    movementSystem.currentPath = result;

    return result.success;
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
    // Search through all hexes and their stacks to find the insect
    for (let hexKey of gameState.board.keys()) {
        const stack = getInsectStack(hexKey);
        if (stack && stack.some(bug => bug.id === insect.id)) {
            currentHex = Hex.fromString(hexKey);
            break;
        }
    }

    if (!currentHex) return;

    const targetKey = targetHex.toString();

    // Validate the move
    if (!isValidMove(insect, currentHex, targetHex)) {
        showPlayerMessage('Invalid move for this insect');
        return;
    }

    // Rule: Cannot move if it breaks hive connectivity (One Hive rule)
    if (!isHiveConnectedWithout(currentHex, insect.id)) {
        console.log('Failed: Moving this insect would break hive connectivity');
        showPlayerMessage('Move would split the hive');
        return;
    }

    // Remove insect from current position (only the top one if stacked)
    const currentKey = currentHex.toString();
    const stack = getInsectStack(currentKey);
    if (stack) {
        // Find and remove the specific insect from the stack
        const insectIndex = stack.findIndex(bug => bug.id === insect.id);
        if (insectIndex !== -1) {
            stack.splice(insectIndex, 1);
            if (stack.length === 0) {
                gameState.board.delete(currentKey);
            }
        }
    }

    // Add insect to target position (potentially stacking on top)
    addInsectToHex(targetKey, insect);

    // Track move history and insect move count
    gameState.moveHistory.push({
        player: gameState.currentPlayer,
        insect: insect.insect,
        from: currentKey,
        to: targetKey,
        timestamp: Date.now()
    });
    gameState.insectMoveCount[insect.insect] = (gameState.insectMoveCount[insect.insect] || 0) + 1;

    renderGame();
    checkWinCondition();
    endTurn();
}

function isHiveConnectedWithout(excludeHex, excludeInsectId) {
    // Check if the hive remains connected when removing a specific insect
    const excludeKey = excludeHex.toString();

    // Get all occupied hexes, excluding the one if it would become empty
    const remainingHexes = [];
    for (let hexKey of gameState.board.keys()) {
        if (hexKey === excludeKey) {
            // Check if this hex would still be occupied after removing the insect
            const stack = getInsectStack(hexKey);
            if (stack && stack.length > 1) {
                // Other insects remain, so this hex is still occupied
                remainingHexes.push(hexKey);
            }
            // If stack.length === 1, this hex becomes empty, so don't include it
        } else {
            remainingHexes.push(hexKey);
        }
    }

    // If only one or zero hexes remain, they're always connected
    if (remainingHexes.length <= 1) {
        return true;
    }

    // Use BFS to check if all remaining hexes are connected
    const visited = new Set();
    const queue = [remainingHexes[0]]; // Start from first remaining hex
    visited.add(remainingHexes[0]);

    while (queue.length > 0) {
        const currentKey = queue.shift();
        const currentHex = Hex.fromString(currentKey);
        const neighbors = currentHex.getNeighbors();

        for (let neighbor of neighbors) {
            const neighborKey = neighbor.toString();
            // Check if this neighbor is in our remaining hexes and hasn't been visited
            if (remainingHexes.includes(neighborKey) && !visited.has(neighborKey)) {
                visited.add(neighborKey);
                queue.push(neighborKey);
            }
        }
    }

    // The hive is connected if we visited all remaining hexes
    return visited.size === remainingHexes.length;
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
        // Remove queen class and add error class
        messageEl.classList.remove('queen');
        messageEl.classList.add('error');
        messageEl.textContent = message;

        // Clear any existing timeout
        if (messageTimeout) {
            clearTimeout(messageTimeout);
        }

        // Auto-hide error after 3 seconds and restore queen message if needed
        messageTimeout = setTimeout(() => {
            messageEl.classList.remove('error');
            updatePlayerInfo(); // Restore queen message or clear
            messageTimeout = null;
        }, 3000);
    }
}

function clearPlayerMessage() {
    for (let p = 1; p <= 2; p++) {
        const messageEl = document.getElementById(`player${p}-message`);
        if (messageEl) {
            messageEl.classList.remove('error', 'queen');
        }
    }
    if (messageTimeout) {
        clearTimeout(messageTimeout);
        messageTimeout = null;
    }
    // Restore queen messages if needed
    updatePlayerInfo();
}

function checkWinCondition() {
    for (let hexKey of gameState.board.keys()) {
        const stack = getInsectStack(hexKey);
        // Check if there's a queen in this stack (look at bottom insect, queens can't be on top)
        if (stack && stack.length > 0) {
            const queenInStack = stack.find(insect => insect.insect === 'queen');
            if (queenInStack) {
                const hex = Hex.fromString(hexKey);
                const neighbors = hex.getNeighbors();
                const adjacentInsects = neighbors.filter(n => {
                    const adj = getTopInsect(n.toString());
                    return adj !== null;
                });

                if (adjacentInsects.length === 6) {
                    gameState.gameOver = true;
                    gameState.winner = queenInStack.player === 1 ? 2 : 1;
                    showVictory();
                    return;
                }
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

// SVG template cache for performance optimization
const svgTemplateCache = new Map();

function createInsectSVG(type, player) {
    // Check cache first
    const cacheKey = `${type}-${player}`;
    if (svgTemplateCache.has(cacheKey)) {
        return svgTemplateCache.get(cacheKey).cloneNode(true);
    }

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

    // Cache the template for future reuse
    svgTemplateCache.set(cacheKey, svg.cloneNode(true));

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

        const stack = getInsectStack(hexKey);
        const topInsect = getTopInsect(hexKey);
        const existingInsects = hexElement.querySelectorAll('.insect, .stacked-insect');

        // Performance optimization: only update if stack changed
        if (stack && stack.length > 0) {
            // Check if we need to update the display by comparing full stack
            const stackIds = stack.map(i => i.id).join(',');
            const existingIds = Array.from(existingInsects).map(el => el.dataset.insectId).join(',');
            const needsUpdate = stackIds !== existingIds;

            if (needsUpdate) {
                // Remove all existing insects
                existingInsects.forEach(el => el.remove());

                // Render all insects in the stack with incremental z-index
                stack.forEach((insect, index) => {
                    const insectElement = createInsectElement(insect);
                    insectElement.style.position = 'absolute';
                    insectElement.style.zIndex = (10 + index).toString();

                    // Disable pointer events on all except the top insect
                    if (index < stack.length - 1) {
                        insectElement.style.pointerEvents = 'none';
                    }

                    hexElement.appendChild(insectElement);
                });
            }

            // Update hexagon appearance based on top insect
            const polygon = hexElement.querySelector('svg polygon');
            if (polygon) {
                const playerColor = topInsect.player === 1 ? 'rgba(85, 153, 255, 0.2)' : 'rgba(255, 170, 68, 0.2)';
                const strokeColor = topInsect.player === 1 ? '#5599ff' : '#ffaa44';
                polygon.setAttribute('fill', playerColor);
                polygon.setAttribute('stroke', strokeColor);
                polygon.setAttribute('stroke-width', '2');
            }

            // Mark hexagon as movable if it belongs to current player and queen is placed
            // Note: Pieces affected by pillbug powers are handled in drag handlers
            const isOwnPiece = topInsect.player === gameState.currentPlayer && gameState.queenPlaced[gameState.currentPlayer];

            if (isOwnPiece) {
                hexElement.classList.add('movable');
            } else {
                hexElement.classList.remove('movable');
            }
        } else {
            // No insects on this hex - remove if exists and reset appearance
            existingInsects.forEach(el => el.remove());

            const polygon = hexElement.querySelector('svg polygon');
            if (polygon) {
                polygon.setAttribute('fill', getComputedStyle(document.documentElement).getPropertyValue('--theme-hexagon-empty') || 'rgba(45, 122, 79, 0.35)');
                polygon.setAttribute('stroke', getComputedStyle(document.documentElement).getPropertyValue('--theme-hexagon-stroke') || '#2d7a4f');
                polygon.setAttribute('stroke-width', '2');
            }

            // Remove movable class from empty hexagons
            hexElement.classList.remove('movable');
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

    // mousedown handled by hexagon delegation
    // contextmenu and click for piece info popup
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

// Performance optimization: Update hand count without full re-render
function updateHandVisualCount() {
    const handArea = document.getElementById('handArea');
    const player = gameState.currentPlayer;
    const handData = gameState.hand[`player${player}`];

    // Update visual counts for all hand insects
    handArea.querySelectorAll('.hand-insect').forEach(insectDiv => {
        const type = insectDiv.dataset.insectType;
        const count = handData[type];
        const visualCount = (dragState.draggedFromHand === type) ? count - 1 : count;

        const countBadge = insectDiv.querySelector('.insect-count');
        if (visualCount > 1) {
            if (countBadge) {
                countBadge.textContent = visualCount;
            } else {
                // Need to add badge
                const badge = document.createElement('div');
                badge.className = 'insect-count';
                badge.textContent = visualCount;
                insectDiv.appendChild(badge);
            }
        } else if (countBadge) {
            // Remove badge if count is 1 or less
            countBadge.remove();
        }
    });
}

function renderHand() {
    const handArea = document.getElementById('handArea');
    const player = gameState.currentPlayer;
    const handData = gameState.hand[`player${player}`];

    if (!handData) return; // Safety check

    handArea.innerHTML = '';

    // Get current theme
    const currentTheme = loadThemeColor();
    const theme = THEME_COLORS[currentTheme];

    for (let type in INSECT_TYPES) {
        let count = handData[type] || 0;

        // If this insect type is being dragged, show reduced count visually
        const visualCount = (dragState.draggedFromHand === type) ? count - 1 : count;
        const isBeingDragged = (dragState.draggedFromHand === type && count === 1);

        // Show insects if count > 0 (including when being dragged)
        if (count > 0) {
            const div = document.createElement('div');
            div.className = 'hand-insect';
            div.dataset.insectType = type;

            // Apply theme colors (hand insects match theme: green/blue/orange)
            div.style.background = `linear-gradient(135deg, ${theme['hand-insect-bg-start']}, ${theme['hand-insect-bg-end']})`;
            div.style.borderColor = theme['hand-insect-border'];
            div.style.boxShadow = `0 4px 12px rgba(0,0,0,0.4)`;

            // Check if this insect can be placed
            const canPlace = canPlaceInsectType(type);

            // Disable if: cannot be placed OR is the last one being dragged
            if (!canPlace || isBeingDragged) {
                div.classList.add('disabled');
            }
            // Event listeners added via delegation in initializeEventListeners

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

        // Update persistent queen status messages
        const messageEl = document.getElementById(`player${p}-message`);
        if (!gameState.queenPlaced[p]) {
            // Queen not placed - show persistent queen message (unless error is active)
            if (!messageEl.classList.contains('error')) {
                messageEl.classList.remove('error');
                messageEl.classList.add('queen');
                const turnsLeft = Math.max(0, 4 - gameState.turnCount[p]);
                if (turnsLeft === 4 && gameConfig.tournamentRules) {
                    messageEl.textContent = `Queen: Cannot place (turn 1)`;
                } else if (turnsLeft === 1) {
                    messageEl.textContent = `Queen: MUST place now!`;
                } else {
                    messageEl.textContent = `Queen: ${turnsLeft} turns left`;
                }
            }
        } else if (!messageEl.classList.contains('error')) {
            // Queen placed and no error message - clear the message
            messageEl.classList.remove('queen');
            messageEl.textContent = '';
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
function centerBoard(animate = true) {
    const boardArea = document.getElementById('boardArea');
    const wrapper = document.querySelector('.hexagon-zoom-wrapper');

    if (!boardArea || !wrapper) {
        return;
    }

    // Add animation class for smooth centering
    if (animate) {
        wrapper.classList.add('animate-zoom');
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
        if (animate) {
            setTimeout(() => wrapper.classList.remove('animate-zoom'), 300);
        }
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

    // If nothing to show, center on grid origin (hex 0,0) at max zoom
    if (hexesToShow.size === 0) {
        currentZoom = MAX_ZOOM;
        // Center hex (0,0) in the viewport
        // Hex (0,0) is at pixel position (0,0) in container coordinates
        // We want it at the center of the viewport
        const viewportCenterX = boardWidth / 2;
        const viewportCenterY = boardHeight / 2;
        wrapper.style.setProperty('--pan-x', viewportCenterX + 'px');
        wrapper.style.setProperty('--pan-y', viewportCenterY + 'px');
        updateBoardZoom();
        if (animate) {
            setTimeout(() => wrapper.classList.remove('animate-zoom'), 300);
        }
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
        if (animate) {
            setTimeout(() => wrapper.classList.remove('animate-zoom'), 300);
        }
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
        if (animate) {
            setTimeout(() => wrapper.classList.remove('animate-zoom'), 300);
        }
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

    // Remove animation class after transition completes
    if (animate) {
        setTimeout(() => {
            wrapper.classList.remove('animate-zoom');
        }, 300);
    }
}

// ============================================
// VICTORY SCREEN
// ============================================

function showVictory() {
    const winnerPlayer = gameState.winner === 1 ? 'Left' : 'Right';
    const winnerColor = gameState.winner === 1 ? '#5599ff' : '#ffaa44';
    const winnerColorName = gameState.winner === 1 ? 'Blue' : 'Orange';

    // Calculate game duration
    const gameTime = Math.floor((Date.now() - gameState.startTime) / 1000); // in seconds
    const minutes = Math.floor(gameTime / 60);
    const seconds = gameTime % 60;
    const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    // Animate losing team pieces - fall off screen
    const losingPlayer = gameState.winner === 1 ? 2 : 1;
    const container = document.getElementById('hexagonContainer');
    const allHexes = container.querySelectorAll('.hexagon');

    allHexes.forEach(hexElement => {
        const insects = hexElement.querySelectorAll('.insect');
        let hasWinningPiece = false;
        let hasLosingPiece = false;

        insects.forEach(insectElement => {
            const insectId = insectElement.dataset.insectId;
            // Find the insect data
            for (let hexKey of gameState.board.keys()) {
                const stack = getInsectStack(hexKey);
                const insect = stack?.find(i => i.id === insectId);
                if (insect) {
                    if (insect.player === losingPlayer) {
                        hasLosingPiece = true;
                        // Losing team: fall off screen
                        const randomDelay = Math.random() * 1000;
                        const randomRotation = (Math.random() - 0.5) * 720;
                        const randomX = (Math.random() - 0.5) * 500;

                        setTimeout(() => {
                            insectElement.style.transition = 'all 1.5s ease-in';
                            insectElement.style.transform = `translateY(1000px) translateX(${randomX}px) rotate(${randomRotation}deg)`;
                            insectElement.style.opacity = '0';
                        }, randomDelay);
                    } else {
                        hasWinningPiece = true;
                        // Winning team: celebratory dance (jump animation)
                        const randomDelay = Math.random() * 500;
                        setTimeout(() => {
                            insectElement.style.animation = 'victoryDance 1s ease-in-out infinite';
                        }, randomDelay);
                    }
                    break;
                }
            }
        });

        // If hexagon only has losing pieces, reset to theme color (remove player coloring)
        if (hasLosingPiece && !hasWinningPiece) {
            const polygon = hexElement.querySelector('svg polygon');
            if (polygon) {
                setTimeout(() => {
                    polygon.style.transition = 'fill 1.5s ease-in, stroke 1.5s ease-in';
                    polygon.setAttribute('fill', getComputedStyle(document.documentElement).getPropertyValue('--theme-hexagon-empty') || 'rgba(45, 122, 79, 0.35)');
                    polygon.setAttribute('stroke', getComputedStyle(document.documentElement).getPropertyValue('--theme-hexagon-stroke') || '#2d7a4f');
                }, 1200); // Delay slightly after pieces start falling
            }
        }
    });

    // Create victory display on the board (not a modal)
    setTimeout(() => {
        const victoryDisplay = document.createElement('div');
        victoryDisplay.className = 'victory-display';
        victoryDisplay.style.cssText = `
            position: fixed;
            top: 70px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, rgba(30, 30, 40, 0.98), rgba(20, 20, 30, 0.98));
            border: 4px solid ${winnerColor};
            border-radius: 20px;
            padding: 30px 50px;
            text-align: center;
            z-index: 10000;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px ${winnerColor}80;
            animation: victorySlideInFromTop 0.5s ease-out;
        `;

        victoryDisplay.innerHTML = `
            <div style="font-size: 48px; font-weight: bold; color: ${winnerColor}; margin-bottom: 10px; text-shadow: 0 0 20px ${winnerColor};">
                ${winnerPlayer} Player Wins!
            </div>
            <div style="font-size: 20px; color: #aaa; margin-bottom: 25px;">
                ${winnerColorName} team has surrounded the opponent's Queen Bee!
            </div>
            <div style="border-top: 2px solid ${winnerColor}40; padding-top: 15px; margin-top: 15px; font-size: 16px;">
                <div style="color: #999; text-align: center;">
                    Game Duration: <span style="color: #fff; font-weight: bold;">${timeStr}</span>
                </div>
            </div>
        `;

        document.body.appendChild(victoryDisplay);
    }, 800);

    // Add CSS animations if not already present
    if (!document.getElementById('victory-animations-style')) {
        const style = document.createElement('style');
        style.id = 'victory-animations-style';
        style.textContent = `
            @keyframes victoryDance {
                0%, 100% { transform: translateY(0) scale(1); }
                25% { transform: translateY(-20px) scale(1.1) rotate(-5deg); }
                50% { transform: translateY(-10px) scale(1.05) rotate(5deg); }
                75% { transform: translateY(-20px) scale(1.1) rotate(-5deg); }
            }

            @keyframes victorySlideInFromTop {
                from {
                    opacity: 0;
                    transform: translateX(-50%) translateY(-100px);
                }
                to {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0);
                }
            }
        `;
        document.head.appendChild(style);
    }

    // Save victor's theme color
    const themeColor = gameState.winner === 1 ? 'blue' : 'orange';
    saveThemeColor(themeColor);
    applyThemeColor(themeColor);
}

// ============================================
// THEME COLOR SYSTEM
// ============================================

function saveThemeColor(color) {
    try {
        localStorage.setItem('hiveThemeColor', color);
    } catch (e) {
        console.error('Failed to save theme color:', e);
    }
}

function loadThemeColor() {
    try {
        const saved = localStorage.getItem('hiveThemeColor');
        return saved || 'green'; // Default to green
    } catch (e) {
        console.error('Failed to load theme color:', e);
        return 'green';
    }
}

// Helper function to get current theme colors
function getThemeColor(key) {
    const currentTheme = loadThemeColor();
    return THEME_COLORS[currentTheme][key];
}

function applyThemeColor(color) {
    const theme = THEME_COLORS[color] || THEME_COLORS.green;

    // Update CSS custom properties
    document.documentElement.style.setProperty('--theme-hexagon-empty', theme['hexagon-empty']);
    document.documentElement.style.setProperty('--theme-hexagon-stroke', theme['hexagon-stroke']);
    document.documentElement.style.setProperty('--theme-board-dark', theme['board-dark']);
    document.documentElement.style.setProperty('--theme-button-background', theme['button-background']);
    document.documentElement.style.setProperty('--theme-button-border', theme['button-border']);

    // Apply theme to UI elements
    applyThemeToUI(theme);

    // Re-render the game to apply new colors
    if (gameState.board) {
        renderGame();
    }
}

function applyThemeToUI(theme) {
    // Update all buttons with gradients
    const gameButtons = document.querySelectorAll('.game-button');
    gameButtons.forEach(btn => {
        btn.style.background = `linear-gradient(135deg, ${theme['hand-insect-bg-start']}, ${theme['hand-insect-bg-end']})`;
        btn.style.borderColor = theme['button-border'];
    });

    // Update zoom buttons with gradients
    const zoomButtons = document.querySelectorAll('.zoom-btn');
    zoomButtons.forEach(btn => {
        btn.style.background = `linear-gradient(135deg, ${theme['hand-insect-bg-start']}, ${theme['hand-insect-bg-end']})`;
        btn.style.borderColor = theme['button-border'];
    });

    // Update game container
    const gameContainer = document.querySelector('.game-container');
    if (gameContainer) {
        gameContainer.style.background = `linear-gradient(135deg, ${theme['container-bg-start']}, ${theme['container-bg-end']})`;
    }

    // Update game wrapper
    const gameWrapper = document.querySelector('.game-wrapper');
    if (gameWrapper) {
        gameWrapper.style.background = `linear-gradient(135deg, ${theme['wrapper-gradient-start']}, ${theme['wrapper-gradient-end']})`;
    }

    // Update board area with dark background
    const boardArea = document.querySelector('.board-area');
    if (boardArea) {
        boardArea.style.backgroundColor = theme['board-dark'];
        boardArea.style.borderColor = theme['hexagon-stroke'];
    }

    // Update hand area
    const handArea = document.querySelector('.hand-area');
    if (handArea) {
        handArea.style.borderColor = theme['hand-border'];
    }

    // Update hand insect circles (match theme: green/blue/orange)
    const handInsects = document.querySelectorAll('.hand-insect');
    handInsects.forEach(insect => {
        insect.style.background = `linear-gradient(135deg, ${theme['hand-insect-bg-start']}, ${theme['hand-insect-bg-end']})`;
        insect.style.borderColor = theme['hand-insect-border'];
        insect.style.boxShadow = `0 4px 12px rgba(0,0,0,0.4)`;
    });

    // Update player info backgrounds
    const playerInfos = document.querySelectorAll('.player-info');
    playerInfos.forEach(info => {
        info.style.backgroundColor = theme['player-info-bg'];
    });

    // Update player dragging labels
    const draggingLabels = document.querySelectorAll('.player-dragging-label');
    draggingLabels.forEach(label => {
        label.style.color = theme['player-dragging-label'];
    });

    // Update game rules link
    const gameRulesLink = document.querySelector('.game-rules-link');
    if (gameRulesLink) {
        gameRulesLink.style.color = theme['game-rules-link'];
    }

    // Update modals
    const modals = document.querySelectorAll('.info-panel, .setup-panel');
    modals.forEach(modal => {
        modal.style.background = `linear-gradient(135deg, ${theme['container-bg-start']}, ${theme['container-bg-end']})`;
        modal.style.borderColor = theme['modal-border'];
    });

    // Update piece info popup
    const pieceInfoPopup = document.querySelector('.piece-info-popup');
    if (pieceInfoPopup) {
        pieceInfoPopup.style.backgroundColor = theme['piece-info-popup-bg'];
        pieceInfoPopup.style.borderColor = theme['piece-info-popup-border'];
    }

    // Update game setup popup background
    const setupPopup = document.querySelector('.game-setup-popup');
    if (setupPopup) {
        setupPopup.style.backgroundColor = theme['popup-background'];
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
            for (let hexKey of gameState.board.keys()) {
                const stack = getInsectStack(hexKey);
                if (stack) {
                    for (let insect of stack) {
                        if (insect.player === player && onBoard.hasOwnProperty(insect.insect)) {
                            onBoard[insect.insect]++;
                        }
                    }
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
        turnCount: { 1: 0, 2: 0 },
        // Statistics tracking
        startTime: Date.now(),
        moveHistory: [],
        insectMoveCount: {}
    };
    initializeHand();
    // Keep current theme (don't reset on new game)
    renderGame();
    centerBoard(false); // Disable animation during initialization
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
        document.querySelectorAll('.victory-display').forEach(el => el.remove());

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
            }
            // Re-render to show changes (updates Queen status for tournament rules, hand display for expansions)
            renderGame();
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

    // Event delegation for hexagons (performance optimization)
    const hexagonContainer = document.getElementById('hexagonContainer');
    hexagonContainer.addEventListener('mousedown', (e) => {
        const hexElement = e.target.closest('.hexagon');
        if (hexElement && hexElement.dataset.hex) {
            // Wrap event with correct currentTarget
            const delegatedEvent = {
                ...e,
                currentTarget: hexElement,
                target: e.target,
                clientX: e.clientX,
                clientY: e.clientY,
                preventDefault: () => e.preventDefault(),
                stopPropagation: () => e.stopPropagation()
            };
            handleHexagonMouseDown.call(hexElement, delegatedEvent);
        }
    });
    hexagonContainer.addEventListener('touchstart', (e) => {
        const hexElement = e.target.closest('.hexagon');
        if (hexElement && hexElement.dataset.hex) {
            // Wrap event with correct currentTarget
            const delegatedEvent = {
                ...e,
                currentTarget: hexElement,
                target: e.target,
                touches: e.touches,
                preventDefault: () => e.preventDefault(),
                stopPropagation: () => e.stopPropagation()
            };
            handleHexagonTouchStart.call(hexElement, delegatedEvent);
        }
    }, { passive: false });

    // Event delegation for hand pieces (performance optimization)
    const handArea = document.getElementById('handArea');
    handArea.addEventListener('mousedown', (e) => {
        const handInsect = e.target.closest('.hand-insect');
        if (handInsect && !handInsect.classList.contains('disabled')) {
            // Wrap event with correct currentTarget
            const delegatedEvent = {
                ...e,
                currentTarget: handInsect,
                target: e.target,
                clientX: e.clientX,
                clientY: e.clientY,
                preventDefault: () => e.preventDefault(),
                stopPropagation: () => e.stopPropagation()
            };
            handleHandInsectMouseDown.call(handInsect, delegatedEvent);
        }
    });
    handArea.addEventListener('touchstart', (e) => {
        const handInsect = e.target.closest('.hand-insect');
        if (handInsect && !handInsect.classList.contains('disabled')) {
            // Wrap event with correct currentTarget
            const delegatedEvent = {
                ...e,
                currentTarget: handInsect,
                target: e.target,
                touches: e.touches,
                preventDefault: () => e.preventDefault(),
                stopPropagation: () => e.stopPropagation()
            };
            handleHandInsectTouchStart.call(handInsect, delegatedEvent);
        }
    }, { passive: false });
}

// Start game on load
window.addEventListener('load', () => {
    loadGameConfig();
    // Reset theme to green on page refresh
    saveThemeColor('green');
    applyThemeColor('green');
    initializeEventListeners();
    initGame();

    // Prevent text selection and dragging globally
    document.addEventListener('dragstart', (e) => e.preventDefault());
    document.addEventListener('selectstart', (e) => e.preventDefault());
    document.addEventListener('contextmenu', (e) => e.preventDefault());
});
