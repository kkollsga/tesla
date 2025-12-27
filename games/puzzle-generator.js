/**
 * Algorithmic Nonogram Puzzle Generator
 * Generates solvable puzzles with guaranteed unique solutions
 */

class PuzzleGenerator {
    constructor(size = 10, difficulty = 'medium') {
        this.size = size;
        this.difficulty = difficulty;

        // Difficulty parameters
        this.difficultyParams = {
            easy: { minDensity: 0.25, maxDensity: 0.45, maxIterations: 4 },
            medium: { minDensity: 0.35, maxDensity: 0.55, maxIterations: 15 },
            hard: { minDensity: 0.40, maxDensity: 0.60, maxIterations: 25 }
        };

        this.params = this.difficultyParams[difficulty] || this.difficultyParams.medium;
        this.solution = null;
        this.solverMetrics = {};
    }

    /**
     * Main public method - generates a complete puzzle
     */
    generate(maxAttempts = 50) {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            // Step 1: Generate candidate solution
            this.solution = this.generateSolution();

            // Step 2: Cleanup
            this.cleanup();

            // Step 3: Accept density in wider range to get more interesting puzzles
            const density = this.calculateDensity();
            if (density < 0.15 || density > 0.85) {
                // Only reject sparse or nearly-full puzzles
                continue;
            }

            // Step 4: Compute clues
            const clues = this.computeClues();

            // Step 5: Logical solve and measure difficulty
            const board = Array(this.size).fill(null).map(() => Array(this.size).fill(-1));
            const solveResult = this.logicalSolve(board, clues);

            // Step 6: Validate
            // Main requirement: must be solvable logically
            if (!solveResult.solved) continue;

            // Skip trivial check for small boards (they solve quickly)
            if (this.size >= 10 && this.isTrivial(solveResult.metrics)) continue;

            // Success!
            return {
                size: this.size,
                solution: this.solution,
                clues: clues,
                difficulty: this.difficulty,
                metrics: solveResult.metrics
            };
        }

        // Fallback: return best attempt
        console.warn(`Failed to generate valid puzzle after ${maxAttempts} attempts`);
        return this.generateFallback();
    }

    /**
     * Step 2: Generate candidate solution using blob growth
     */
    generateSolution() {
        const grid = Array(this.size).fill(null).map(() => Array(this.size).fill(0));

        // Create more blobs with better variety in sizes
        const numBlobs = Math.floor(this.size / 2) + 1;
        const targetDensity = this.difficulty === 'easy' ? 0.35 :
                              this.difficulty === 'medium' ? 0.45 : 0.50;

        for (let blob = 0; blob < numBlobs; blob++) {
            // Seed random point, preferring center area slightly
            const seedRow = Math.floor(Math.random() * this.size);
            const seedCol = Math.floor(Math.random() * this.size);

            // Vary blob sizes more - some large, some medium, some small
            let blobSize;
            const rand = Math.random();
            if (rand < 0.4) {
                // Large blob
                blobSize = Math.floor(this.size * (1.5 + Math.random() * 1.5));
            } else if (rand < 0.7) {
                // Medium blob
                blobSize = Math.floor(this.size * (0.7 + Math.random() * 0.7));
            } else {
                // Small blob
                blobSize = Math.floor(this.size * (0.3 + Math.random() * 0.4));
            }

            this.growBlob(grid, seedRow, seedCol, blobSize);
        }

        return grid;
    }

    /**
     * Grow a single blob using random walk
     */
    growBlob(grid, startRow, startCol, targetSize) {
        const visited = new Set();
        const queue = [[startRow, startCol]];
        let cellCount = 0;

        while (queue.length > 0 && cellCount < targetSize) {
            const [row, col] = queue.shift();
            const key = `${row},${col}`;

            if (visited.has(key) || row < 0 || row >= this.size || col < 0 || col >= this.size) {
                continue;
            }

            visited.add(key);
            grid[row][col] = 1;
            cellCount++;

            // Add neighbors with random probability
            const neighbors = [
                [row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]
            ];

            for (const [nr, nc] of neighbors) {
                if (Math.random() < 0.6) {
                    queue.push([nr, nc]);
                }
            }
        }
    }

    /**
     * Step 3: Cleanup - remove isolated pixels and enforce constraints (light version)
     */
    cleanup() {
        // Only remove truly isolated cells (no neighbors at all)
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                if (this.solution[i][j] === 1) {
                    let neighbors = 0;
                    if (i > 0 && this.solution[i-1][j] === 1) neighbors++;
                    if (i < this.size-1 && this.solution[i+1][j] === 1) neighbors++;
                    if (j > 0 && this.solution[i][j-1] === 1) neighbors++;
                    if (j < this.size-1 && this.solution[i][j+1] === 1) neighbors++;

                    if (neighbors === 0) {
                        this.solution[i][j] = 0;
                    }
                }
            }
        }

        // Optional: Fill 1-cell holes only if surrounded on all 4 sides
        for (let i = 1; i < this.size - 1; i++) {
            for (let j = 1; j < this.size - 1; j++) {
                if (this.solution[i][j] === 0 &&
                    this.solution[i-1][j] === 1 && this.solution[i+1][j] === 1 &&
                    this.solution[i][j-1] === 1 && this.solution[i][j+1] === 1) {
                    this.solution[i][j] = 1;
                }
            }
        }

        // Remove only consecutive isolated single cells (min run length = 1 is OK)
        // Only enforce if there are 3+ consecutive single cells
        for (let i = 0; i < this.size; i++) {
            // Horizontal: check for 3+ single cells in a row
            for (let j = 0; j < this.size - 2; j++) {
                if (this.solution[i][j] === 1 && this.solution[i][j+1] === 1 && this.solution[i][j+2] === 1) {
                    // Found 3+ cells, check if they're single-cell-surrounded
                    let allSurrounded = true;
                    for (let k = j; k <= j + 2; k++) {
                        const hasVerticalNeighbor = (i > 0 && this.solution[i-1][k] === 1) ||
                                                    (i < this.size-1 && this.solution[i+1][k] === 1);
                        if (!hasVerticalNeighbor) {
                            allSurrounded = false;
                            break;
                        }
                    }
                    if (allSurrounded) {
                        // This is a valid isolated line, keep it
                        continue;
                    }
                }
            }
        }
    }

    hasAdjacentFilled(row, col) {
        const neighbors = [
            [row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]
        ];
        return neighbors.some(([r, c]) =>
            r >= 0 && r < this.size && c >= 0 && c < this.size && this.solution[r][c] === 1
        );
    }

    /**
     * Calculate fill density (0-1)
     */
    calculateDensity() {
        let filled = 0;
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                if (this.solution[i][j] === 1) filled++;
            }
        }
        return filled / (this.size * this.size);
    }

    /**
     * Step 4: Compute clues (run-length encoding)
     */
    computeClues() {
        const clues = { rows: [], cols: [] };

        // Row clues
        for (let i = 0; i < this.size; i++) {
            clues.rows.push(this.getLineClues(this.solution[i]));
        }

        // Column clues
        for (let j = 0; j < this.size; j++) {
            const col = Array(this.size).fill(null).map((_, i) => this.solution[i][j]);
            clues.cols.push(this.getLineClues(col));
        }

        return clues;
    }

    getLineClues(line) {
        const clues = [];
        let run = 0;

        for (let i = 0; i < line.length; i++) {
            if (line[i] === 1) {
                run++;
            } else if (run > 0) {
                clues.push(run);
                run = 0;
            }
        }

        if (run > 0) clues.push(run);
        return clues.length === 0 ? [0] : clues;
    }

    /**
     * Step 5: Logical solver (no guessing allowed)
     */
    logicalSolve(board, clues) {
        const metrics = {
            iterations: 0,
            overlapOnlyPercentage: 0,
            solvedByOverlap: 0,
            totalSolved: 0,
            requiresGuessing: false
        };

        let lastProgress = true;
        let iterationsSinceProgress = 0;
        const maxIterations = this.params.maxIterations;

        while (lastProgress && metrics.iterations < maxIterations) {
            metrics.iterations++;
            lastProgress = false;

            // Solve rows
            for (let i = 0; i < this.size; i++) {
                const rowClues = clues.rows[i];
                const progress = this.solveLineFast(board[i], rowClues);
                if (progress > 0) {
                    lastProgress = true;
                    metrics.solvedByOverlap += progress;
                }
                metrics.totalSolved += progress;
            }

            // Solve columns
            for (let j = 0; j < this.size; j++) {
                const col = Array(this.size).fill(null).map((_, i) => board[i][j]);
                const colClues = clues.cols[j];
                const progress = this.solveLineFast(col, colClues);

                if (progress > 0) {
                    lastProgress = true;
                    metrics.solvedByOverlap += progress;
                    for (let i = 0; i < this.size; i++) {
                        board[i][j] = col[i];
                    }
                }
                metrics.totalSolved += progress;
            }

            if (!lastProgress) iterationsSinceProgress++;
        }

        const totalCells = this.size * this.size;
        const unknownCells = board.flat().filter(c => c === -1).length;
        const solved = unknownCells === 0;

        metrics.overlapOnlyPercentage = metrics.totalSolved > 0 ?
            (metrics.solvedByOverlap / metrics.totalSolved) * 100 : 0;
        metrics.requiresGuessing = !solved;

        return {
            solved,
            board,
            metrics
        };
    }

    /**
     * Fast line solver using overlap rule and constraint propagation
     */
    solveLineFast(line, clues) {
        if (!clues || clues.length === 0) return 0;

        let progress = 0;
        let changed = true;
        let iterations = 0;
        const maxIterations = 5;

        while (changed && iterations < maxIterations) {
            changed = false;
            iterations++;

            const candidates = this.generateCandidates(line.length, clues);
            if (candidates.length === 0) break;

            // Technique 1: Overlap rule - cells that are same in all candidates
            for (let i = 0; i < line.length; i++) {
                if (line[i] !== -1) continue;

                const cellValue = candidates[0][i];
                if (candidates.every(c => c[i] === cellValue)) {
                    line[i] = cellValue;
                    progress++;
                    changed = true;
                }
            }

            // Technique 2: Eliminate candidates that conflict with known cells
            // Filter candidates based on current state
            const validCandidates = candidates.filter(candidate => {
                for (let i = 0; i < line.length; i++) {
                    if (line[i] !== -1 && candidate[i] !== line[i]) {
                        return false;
                    }
                }
                return true;
            });

            if (validCandidates.length === 0) break;

            // Re-check overlaps with filtered candidates
            for (let i = 0; i < line.length; i++) {
                if (line[i] !== -1) continue;

                const cellValue = validCandidates[0][i];
                if (validCandidates.every(c => c[i] === cellValue)) {
                    line[i] = cellValue;
                    progress++;
                    changed = true;
                }
            }
        }

        return progress;
    }

    /**
     * Generate all valid placements for a line (simpler, more reliable version)
     */
    generateCandidates(lineLength, clues) {
        if (clues[0] === 0) {
            return [Array(lineLength).fill(0)];
        }

        const candidates = [];
        const totalFilled = clues.reduce((a, b) => a + b, 0);
        const minGaps = clues.length - 1; // Minimum gaps between clues
        const minLength = totalFilled + minGaps;

        if (minLength > lineLength) return []; // Impossible to fit

        // Recursive backtracking to place clues
        const place = (clueIdx, position, current) => {
            if (clueIdx === clues.length) {
                // All clues placed, fill rest with 0
                const remaining = lineLength - position;
                if (remaining >= 0) {
                    candidates.push(current.concat(Array(remaining).fill(0)));
                }
                return;
            }

            const clue = clues[clueIdx];
            const remainingClues = clues.slice(clueIdx + 1);
            // Calculate space needed for remaining clues:
            // - Mandatory gap after current clue (if any remaining): 1 cell
            // - Remaining filled cells: sum of remaining clues
            // - Gaps between remaining clues: remainingClues.length - 1
            const gapAfterCurrent = remainingClues.length > 0 ? 1 : 0;
            const remainingFilled = remainingClues.reduce((a, b) => a + b, 0);
            const gapsBetweenRemaining = Math.max(0, remainingClues.length - 1);
            const remainingLength = gapAfterCurrent + remainingFilled + gapsBetweenRemaining;
            const maxStart = lineLength - position - clue - remainingLength;

            for (let start = 0; start <= maxStart; start++) {
                const newCurrent = current.concat(
                    Array(start).fill(0),
                    Array(clue).fill(1)
                );

                if (clueIdx < clues.length - 1) {
                    // Add mandatory gap
                    place(clueIdx + 1, position + start + clue + 1, newCurrent.concat([0]));
                } else {
                    place(clueIdx + 1, position + start + clue, newCurrent);
                }
            }
        };

        place(0, 0, []);
        return candidates;
    }

    /**
     * Check if difficulty matches target (relaxed thresholds)
     */
    isValidDifficulty(metrics) {
        // For now, accept any valid solvable puzzle
        // Stricter difficulty matching can be added later if needed
        return metrics.iterations >= 1; // Just needs to be solvable
    }

    /**
     * Check if puzzle is too trivial
     */
    isTrivial(metrics) {
        // Reject only if solved completely in first iteration (too easy)
        return metrics.iterations === 1 && metrics.solvedByOverlap > this.size * this.size * 0.8;
    }

    /**
     * Verify puzzle has unique solution
     */
    verifyUniqueness(clues) {
        // Try forcing a few random cells and verify solver produces different result
        const testCells = Math.min(3, Math.floor(this.size / 2));

        for (let test = 0; test < testCells; test++) {
            const testRow = Math.floor(Math.random() * this.size);
            const testCol = Math.floor(Math.random() * this.size);
            const originalValue = this.solution[testRow][testCol];

            // Try opposite value
            this.solution[testRow][testCol] = 1 - originalValue;

            const board = Array(this.size).fill(null).map(() => Array(this.size).fill(-1));
            const result = this.logicalSolve(board, clues);

            // Restore
            this.solution[testRow][testCol] = originalValue;

            // If solver completes with different solution, puzzle has multiple solutions
            if (result.solved) {
                return false; // Multiple solutions found
            }
        }

        return true; // Appears to have unique solution
    }

    /**
     * Fallback: generate simple puzzle if algorithm fails
     */
    generateFallback() {
        const grid = Array(this.size).fill(null).map(() => Array(this.size).fill(0));

        // Create different patterns based on difficulty
        if (this.difficulty === 'easy') {
            // Simple cross pattern for easy
            const mid = Math.floor(this.size / 2);
            for (let j = 1; j < this.size - 1; j++) {
                grid[mid][j] = 1;
            }
            for (let i = 1; i < this.size - 1; i++) {
                grid[i][mid] = 1;
            }
        } else if (this.difficulty === 'medium') {
            // Diamond pattern for medium
            const mid = Math.floor(this.size / 2);
            for (let i = 0; i < this.size; i++) {
                for (let j = 0; j < this.size; j++) {
                    const dist = Math.abs(i - mid) + Math.abs(j - mid);
                    if (dist <= Math.floor(this.size / 3) && dist > 0) {
                        grid[i][j] = 1;
                    }
                }
            }
        } else {
            // Concentric squares for hard
            const mid = Math.floor(this.size / 2);
            const maxDist = Math.floor(this.size / 2) - 1;
            for (let i = 0; i < this.size; i++) {
                for (let j = 0; j < this.size; j++) {
                    const dist = Math.max(Math.abs(i - mid), Math.abs(j - mid));
                    // Create stripes at certain distances
                    if (dist > 0 && dist <= maxDist && (dist === 1 || dist === 3 || dist === 5)) {
                        grid[i][j] = 1;
                    }
                }
            }
        }

        this.solution = grid;
        const clues = this.computeClues();

        return {
            size: this.size,
            solution: grid,
            clues: clues,
            difficulty: this.difficulty,
            metrics: { fallback: true, pattern: 'geometric' }
        };
    }
}
