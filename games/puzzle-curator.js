/**
 * Puzzle Curator - Quality Ranking and Curation System
 * Pre-generates puzzles and ranks them by visual/difficulty interest
 */

class PuzzleCurator {
    constructor(difficulty = 'medium') {
        this.difficulty = difficulty;
        this.benchPuzzles = [];         // Top 50 puzzles (minus current shown) ready for next evaluation
        this.seenPatterns = [];         // Track hashes of recently shown puzzles
        this.maxSeenPatterns = 50;      // Allow repeats after seeing 50 different patterns
        this.totalGenerations = 0;      // Track total puzzles generated across all rounds
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
     * Get the next best puzzle, intelligently reusing previous bench
     * Round 1: Generate 200 → Pick top 1 → Save next 49 in bench
     * Round 2+: Take 49 from bench + Generate 151 new = 200 → Pick top 1 → Save next 49
     */
    getNextPuzzle() {
        const gridSizes = { easy: 5, medium: 10, hard: 15 };
        const size = gridSizes[this.difficulty];
        const candidates = [];

        // Determine how many new puzzles to generate
        let newCount;
        if (this.benchPuzzles.length === 0) {
            // First round: generate 200
            newCount = 200;
            console.log(`[${this.difficulty}] Round 1: Generating 200 new puzzles...`);
        } else {
            // Subsequent rounds: take 49 from bench + generate 151 new = 200
            for (const puzzle of this.benchPuzzles) {
                const score = this.scorePuzzle(puzzle);
                candidates.push({ puzzle, score });
            }
            newCount = 151;
            console.log(`[${this.difficulty}] Round ${Math.ceil(this.totalGenerations / 200) + 1}: Reconsidering 49 bench puzzles + generating 151 new...`);
        }

        // Generate new puzzles
        for (let i = 0; i < newCount; i++) {
            try {
                const generator = new PuzzleGenerator(size, this.difficulty);
                const puzzle = generator.generate();

                if (puzzle && puzzle.solution) {
                    const score = this.scorePuzzle(puzzle);
                    candidates.push({ puzzle, score });
                }
            } catch (e) {
                // Skip failed generations
            }
        }

        // Sort by score (highest first)
        candidates.sort((a, b) => b.score - a.score);

        if (candidates.length === 0) {
            throw new Error(`Failed to generate any valid puzzles for ${this.difficulty}`);
        }

        // Get the best puzzle to show to user
        const topPuzzle = candidates[0].puzzle;
        this.markPatternSeen(topPuzzle);

        // Save the next 49 best puzzles for next round's evaluation
        this.benchPuzzles = candidates.slice(1, 50).map(c => c.puzzle);

        // Track total generations
        this.totalGenerations += newCount;

        console.log(`  Selected best puzzle (score: ${candidates[0].score.toFixed(2)}), bench refilled with 49 puzzles`);

        return topPuzzle;
    }

    /**
     * Pre-generate initial puzzle pool (call once at startup)
     */
    initializePool() {
        try {
            this.getNextPuzzle(); // This populates benchPuzzles with 49 puzzles
            console.log(`[${this.difficulty}] Pool initialized, bench ready for next round`);
        } catch (e) {
            console.error(`Failed to initialize pool: ${e.message}`);
        }
    }

    /**
     * Score a puzzle based on multiple quality metrics (5 factors)
     */
    scorePuzzle(puzzle) {
        let score = 0;

        // Factor 1: Solver iterations (3-6 is ideal for difficulty)
        const iterations = puzzle.metrics.iterations || 1;
        const iterationScore = this.scoreIterations(iterations);
        score += iterationScore * 0.25;

        // Factor 2: Pattern complexity (clue diversity - unique run lengths)
        const complexityScore = this.scoreComplexity(puzzle.clues);
        score += complexityScore * 0.20;

        // Factor 3: Visual entropy (how "non-uniform" the pattern is)
        const entropyScore = this.scoreEntropy(puzzle.solution);
        score += entropyScore * 0.20;

        // Factor 4: Fill density preference (0.35-0.55 is ideal)
        const density = this.calculateDensity(puzzle.solution);
        const densityScore = this.scoreDensity(density);
        score += densityScore * 0.20;

        // Factor 5: Split clue density (lines with multiple runs are harder)
        const splitScore = this.scoreSplitClues(puzzle.clues);
        score += splitScore * 0.15;

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
     * Score split clue density (lines with 2+ runs are harder)
     * This captures constraint complexity that uniqueness of run lengths misses
     */
    scoreSplitClues(clues) {
        const allClues = [...clues.rows, ...clues.cols];
        const multiClueLines = allClues.filter(c => c.length > 1).length;
        const ratio = multiClueLines / allClues.length;

        // More split clues = more constraint interdependency
        if (ratio < 0.05) return 0.2;   // Almost no splits (too simple)
        if (ratio < 0.15) return 0.5;   // Very few splits
        if (ratio < 0.30) return 0.7;   // Some splits
        if (ratio < 0.50) return 1.0;   // Good split density (ideal)
        return 0.9;                      // Very high (complex but not overdone)
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
     * Get curator statistics
     */
    getStats() {
        return {
            difficulty: this.difficulty,
            benchSize: this.benchPuzzles.length,
            totalGenerated: this.totalGenerations,
            seenPatterns: this.seenPatterns.length,
            maxSeenPatterns: this.maxSeenPatterns
        };
    }
}
