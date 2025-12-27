/**
 * Puzzle Curator - Quality Ranking and Curation System
 * Pre-generates puzzles and ranks them by visual/difficulty interest
 */

class PuzzleCurator {
    constructor(difficulty = 'medium') {
        this.difficulty = difficulty;
        this.puzzlePool = [];
        this.seenPatterns = [];  // Track hashes of recently shown puzzles
        this.maxSeenPatterns = 50; // Allow repeats after seeing 50 different patterns
    }

    /**
     * Get puzzle hash for pattern tracking
     */
    getPuzzleHash(puzzle) {
        return JSON.stringify(puzzle.solution);
    }

    /**
     * Check if pattern has been recently seen
     */
    hasSeenPattern(puzzle) {
        const hash = this.getPuzzleHash(puzzle);
        return this.seenPatterns.includes(hash);
    }

    /**
     * Mark pattern as seen
     */
    markPatternSeen(puzzle) {
        const hash = this.getPuzzleHash(puzzle);
        if (!this.seenPatterns.includes(hash)) {
            this.seenPatterns.push(hash);
            // Keep list size limited - remove oldest when exceeding max
            if (this.seenPatterns.length > this.maxSeenPatterns) {
                this.seenPatterns.shift();
            }
        }
    }

    /**
     * Get history stats
     */
    getHistoryStats() {
        return {
            seenCount: this.seenPatterns.length,
            maxSize: this.maxSeenPatterns
        };
    }

    /**
     * Clear pattern history
     */
    clearHistory() {
        this.seenPatterns = [];
    }

    /**
     * Generate and curate a pool of puzzles (synchronous)
     */
    generatePool(targetCount = 50, batchSize = 200) {
        console.log(`Generating puzzle pool for ${this.difficulty}... (${batchSize} candidates, keeping ${targetCount})`);

        const gridSizes = { easy: 5, medium: 10, hard: 15 };
        const size = gridSizes[this.difficulty];
        const candidates = [];

        // Generate batch of puzzles
        for (let i = 0; i < batchSize; i++) {
            try {
                const generator = new PuzzleGenerator(size, this.difficulty);
                const puzzle = generator.generate();

                if (puzzle && puzzle.solution) {
                    // Score the puzzle
                    const score = this.scorePuzzle(puzzle);
                    candidates.push({
                        puzzle,
                        score
                    });
                }
            } catch (e) {
                // Skip failed generations
            }
        }

        // Sort by score (highest first)
        candidates.sort((a, b) => b.score - a.score);

        // Keep top puzzles
        this.puzzlePool = candidates.slice(0, targetCount).map(c => c.puzzle);
        console.log(`Pool created: ${this.puzzlePool.length} quality puzzles`);

        return this.puzzlePool;
    }

    /**
     * Score a puzzle based on multiple quality metrics
     */
    scorePuzzle(puzzle) {
        let score = 0;

        // Factor 1: Solver iterations (3-6 is ideal for difficulty)
        const iterations = puzzle.metrics.iterations || 1;
        const iterationScore = this.scoreIterations(iterations);
        score += iterationScore * 0.25;

        // Factor 2: Pattern complexity (clue diversity)
        const complexityScore = this.scoreComplexity(puzzle.clues);
        score += complexityScore * 0.25;

        // Factor 3: Visual entropy (how "non-uniform" the pattern is)
        const entropyScore = this.scoreEntropy(puzzle.solution);
        score += entropyScore * 0.25;

        // Factor 4: Fill density preference (0.35-0.55 is ideal)
        const density = this.calculateDensity(puzzle.solution);
        const densityScore = this.scoreDensity(density);
        score += densityScore * 0.25;

        return score;
    }

    /**
     * Score iteration count (3-5 iterations is ideal)
     */
    scoreIterations(iterations) {
        if (iterations < 2) return 0.3;      // Too trivial
        if (iterations <= 3) return 1.0;     // Optimal
        if (iterations <= 5) return 0.9;     // Still good
        if (iterations <= 10) return 0.6;    // Getting harder
        return 0.3;                           // Very hard
    }

    /**
     * Score pattern complexity based on clue diversity
     */
    scoreComplexity(clues) {
        let complexity = 0;
        const allClues = [...clues.rows, ...clues.cols];

        // Count unique run lengths
        const runLengths = new Set();
        for (const lineClues of allClues) {
            for (const clue of lineClues) {
                runLengths.add(clue);
            }
        }

        // More variety = more interesting (but not too many different sizes)
        const uniqueCount = runLengths.size;
        if (uniqueCount < 2) return 0.2;      // All same size
        if (uniqueCount <= 5) return 0.9;     // Good variety
        if (uniqueCount <= 10) return 0.8;    // Lots of variety
        return 0.6;                            // Too many different sizes

        // Count lines with multiple runs (more complex)
        const multiRunLines = allClues.filter(c => c.length > 1).length;
        const multiRunRatio = multiRunLines / allClues.length;

        if (multiRunRatio > 0.6) complexity += 0.7;  // Many complex lines
        if (multiRunRatio > 0.4) complexity += 0.5;  // Some complex lines
        if (multiRunRatio > 0.2) complexity += 0.3;  // Few complex lines

        return Math.min(complexity, 1.0);
    }

    /**
     * Score entropy - measure of pattern uniformity
     */
    scoreEntropy(solution) {
        const size = solution.length;
        let entropy = 0;

        // Check for local clustering (more interesting if not uniform)
        for (let i = 0; i < size - 1; i++) {
            for (let j = 0; j < size - 1; j++) {
                // Count 2x2 patterns
                const sum = (solution[i][j] || 0) +
                           (solution[i][j+1] || 0) +
                           (solution[i+1][j] || 0) +
                           (solution[i+1][j+1] || 0);

                // Patterns: 0=empty, 4=full, 1-3=mixed (more interesting)
                if (sum > 0 && sum < 4) {
                    entropy += 1;
                }
            }
        }

        // Normalize
        const maxEntropy = (size - 1) * (size - 1);
        const entropyRatio = entropy / maxEntropy;

        // Ideal is ~0.5 (mix of patterns)
        if (entropyRatio < 0.2) return 0.3;  // Too uniform
        if (entropyRatio < 0.4) return 0.7;  // Okay
        if (entropyRatio < 0.6) return 1.0;  // Ideal
        if (entropyRatio < 0.8) return 0.8;  // Still good
        return 0.5;                           // Very scattered
    }

    /**
     * Score fill density (0.35-0.55 preferred)
     */
    scoreDensity(density) {
        if (density < 0.2) return 0.2;  // Too sparse
        if (density < 0.3) return 0.6;  // Sparse
        if (density < 0.35) return 0.8; // Getting good
        if (density < 0.55) return 1.0; // Ideal range
        if (density < 0.65) return 0.8; // A bit dense
        if (density < 0.8) return 0.5;  // Dense
        return 0.2;                      // Too dense
    }

    /**
     * Calculate fill density
     */
    calculateDensity(solution) {
        let filled = 0;
        const total = solution.length * solution.length;
        for (const row of solution) {
            for (const cell of row) {
                if (cell === 1) filled++;
            }
        }
        return filled / total;
    }

    /**
     * Get random puzzle from pool
     */
    getRandomPuzzle() {
        if (this.puzzlePool.length === 0) {
            throw new Error('Puzzle pool is empty. Run generatePool() first.');
        }

        // Try to find an unseen puzzle (up to 10 attempts)
        for (let attempts = 0; attempts < 10; attempts++) {
            const index = Math.floor(Math.random() * this.puzzlePool.length);
            const puzzle = this.puzzlePool[index];

            if (!this.hasSeenPattern(puzzle)) {
                this.markPatternSeen(puzzle);
                return puzzle;
            }
        }

        // If all attempts found seen patterns, just return a random one anyway
        // (but only after we've cycled through our history limit)
        const index = Math.floor(Math.random() * this.puzzlePool.length);
        const puzzle = this.puzzlePool[index];
        this.markPatternSeen(puzzle);
        return puzzle;
    }

    /**
     * Get puzzle statistics
     */
    getPoolStats() {
        if (this.puzzlePool.length === 0) {
            return { count: 0 };
        }

        const iterations = [];
        const densities = [];

        for (const puzzle of this.puzzlePool) {
            if (puzzle.metrics) {
                iterations.push(puzzle.metrics.iterations);
            }
            densities.push(this.calculateDensity(puzzle.solution));
        }

        return {
            count: this.puzzlePool.length,
            avgIterations: (iterations.reduce((a, b) => a + b, 0) / iterations.length).toFixed(1),
            avgDensity: (densities.reduce((a, b) => a + b, 0) / densities.length).toFixed(2),
            minDensity: Math.min(...densities).toFixed(2),
            maxDensity: Math.max(...densities).toFixed(2)
        };
    }
}
