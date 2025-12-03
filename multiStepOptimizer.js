

// Multi-step blend optimizer - finds optimal sequence of blend modes and colors
// Uses hybrid approach: greedy search + joint refinement with cancellation support
// Enhanced with multiple random restarts and basin hopping to escape local minima

const HSL_MODE_NAME = "Hue/Saturation";

/**
 * Apply a single blend to a normalized RGB color with opacity
 * Result = opacity * Blend(Source, BlendColor) + (1 - opacity) * Source
 */
const applyBlendNorm = (modeName, sourceNorm, blendNorm, opacity = 1) => {
    if (modeName === HSL_MODE_NAME) {
        // For HSL mode, blendNorm contains [hueNorm, satNorm, lightNorm] (0-1)
        // Map to ranges:
        // Hue: -180 to 180
        // Sat: -100 to 100
        // Light: -100 to 100
        const h = (blendNorm[0] * 360) - 180;
        const s = (blendNorm[1] * 200) - 100;
        const l = (blendNorm[2] * 200) - 100;
        
        const sRgb = sourceNorm.map(c => Math.round(c * 255));
        
        // applyHslAdjustment returns RGB [0-255]
        const resRgb = applyHslAdjustment(sRgb, h, s, l);
        const resNorm = resRgb.map(c => c / 255);
        
        return [
            clamp(opacity * resNorm[0] + (1 - opacity) * sourceNorm[0], 0, 1),
            clamp(opacity * resNorm[1] + (1 - opacity) * sourceNorm[1], 0, 1),
            clamp(opacity * resNorm[2] + (1 - opacity) * sourceNorm[2], 0, 1)
        ];
    }

    const r = applyBlendChannel(modeName, sourceNorm[0], blendNorm[0]);
    const g = applyBlendChannel(modeName, sourceNorm[1], blendNorm[1]);
    const b = applyBlendChannel(modeName, sourceNorm[2], blendNorm[2]);
    
    return [
        clamp(opacity * r + (1 - opacity) * sourceNorm[0], 0, 1),
        clamp(opacity * g + (1 - opacity) * sourceNorm[1], 0, 1),
        clamp(opacity * b + (1 - opacity) * sourceNorm[2], 0, 1)
    ];
};

/**
 * Apply a sequence of blend steps to a color
 */
const applyBlendSequence = (sourceNorm, steps) => {
    let current = sourceNorm.slice();
    for (const step of steps) {
        current = applyBlendNorm(step.modeName, current, step.blend, step.opacity);
    }
    return current;
};

/**
 * Compute total weighted error for a multi-step solution across all pairs
 */
const computeMultiStepError = (pairs, steps) => {
    const perPairResults = [];
    let totalWeightedError = 0;
    let totalWeight = 0;
    let maxError = 0;
    
    for (const pair of pairs) {
        const sRgb = hexToRgb(pair.source);
        const tRgb = hexToRgb(pair.target);
        
        if (!sRgb || !tRgb) continue;
        
        const sNorm = sRgb.map(c => c / 255);
        const tNorm = tRgb.map(c => c / 255);
        const weight = pair.weight !== undefined ? pair.weight : 1;
        
        // Track intermediate colors
        const intermediates = [];
        let current = sNorm.slice();
        
        for (const step of steps) {
            current = applyBlendNorm(step.modeName, current, step.blend, step.opacity);
            const hex = rgbToHex(...current.map(c => Math.round(c * 255)));
            
            // Append opacity info if not 100%
            if (step.opacity !== undefined && step.opacity < 1) {
                intermediates.push(`${hex} @ ${Math.round(step.opacity * 100)}%`);
            } else {
                intermediates.push(hex);
            }
        }
        
        const achievedRgb = current.map(c => Math.round(c * 255));
        const achievedHex = rgbToHex(...achievedRgb);
        
        // Compute perceptual difference
        const targetLab = rgbToLab(...tRgb);
        const achievedLab = rgbToLab(...achievedRgb);
        const error = deltaE(targetLab, achievedLab);
        
        perPairResults.push({
            source: pair.source,
            target: pair.target,
            weight: weight,
            achieved: achievedHex,
            intermediates,
            error
        });
        
        totalWeightedError += error * weight;
        totalWeight += weight;
        maxError = Math.max(maxError, error);
    }
    
    const avgError = totalWeight > 0 ? totalWeightedError / totalWeight : 0;
    
    return { totalError: totalWeightedError, avgError, maxError, perPairResults };
};

/**
 * Multi-dimensional Nelder-Mead for joint optimization with random restarts
 * Handles 4D optimization per step (R, G, B, A) or (H, S, L, A)
 */
const nelderMeadMultiDim = (objective, initial, options = {}) => {
    const maxIterations = options.maxIterations || 500;
    const tolerance = options.tolerance || 1e-8;
    const opacityBounds = options.opacityBounds || { min: 0.1, max: 1.0 };
    
    const alpha = 1.0;
    const gamma = 2.0;
    const rho = 0.5;
    const sigma = 0.5;
    
    const n = initial.length;
    
    // Helper to clamp parameters
    // Indices: 0,1,2 (Params), 3 (Opacity), 4,5,6 (Params), 7 (Opacity)...
    const clampParams = (v) => {
        return v.map((val, idx) => {
            if ((idx + 1) % 4 === 0) { // Opacity channel
                return clamp(val, opacityBounds.min, opacityBounds.max);
            } else { // Param channel (RGB or HSL-Norm)
                return clamp(val, 0, 1);
            }
        });
    };
    
    // Initialize simplex with larger spread
    const simplex = [clampParams(initial.slice())];
    const step = options.initialStep || 0.2;
    
    for (let i = 0; i < n; i++) {
        const vertex = initial.slice();
        vertex[i] += step;
        simplex.push(clampParams(vertex));
    }
    
    let values = simplex.map(v => objective(v));
    
    for (let iter = 0; iter < maxIterations; iter++) {
        // Sort by objective value
        const indices = values.map((v, i) => i).sort((a, b) => values[a] - values[b]);
        const sortedSimplex = indices.map(i => simplex[i].slice());
        const sortedValues = indices.map(i => values[i]);
        
        for (let i = 0; i <= n; i++) {
            simplex[i] = sortedSimplex[i];
            values[i] = sortedValues[i];
        }
        
        // Check convergence
        const range = values[n] - values[0];
        if (range < tolerance) break;
        
        // Compute centroid
        const centroid = Array(n).fill(0);
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                centroid[j] += simplex[i][j];
            }
        }
        for (let j = 0; j < n; j++) {
            centroid[j] /= n;
        }
        
        // Reflection
        const reflected = clampParams(centroid.map((c, j) => 
            c + alpha * (c - simplex[n][j])
        ));
        const reflectedValue = objective(reflected);
        
        if (reflectedValue >= values[0] && reflectedValue < values[n - 1]) {
            simplex[n] = reflected;
            values[n] = reflectedValue;
            continue;
        }
        
        // Expansion
        if (reflectedValue < values[0]) {
            const expanded = clampParams(centroid.map((c, j) => 
                c + gamma * (reflected[j] - c)
            ));
            const expandedValue = objective(expanded);
            
            if (expandedValue < reflectedValue) {
                simplex[n] = expanded;
                values[n] = expandedValue;
            } else {
                simplex[n] = reflected;
                values[n] = reflectedValue;
            }
            continue;
        }
        
        // Contraction
        const contracted = clampParams(centroid.map((c, j) => 
            c + rho * (simplex[n][j] - c)
        ));
        const contractedValue = objective(contracted);
        
        if (contractedValue < values[n]) {
            simplex[n] = contracted;
            values[n] = contractedValue;
            continue;
        }
        
        // Shrink
        for (let i = 1; i <= n; i++) {
            for (let j = 0; j < n; j++) {
                simplex[i][j] = simplex[0][j] + sigma * (simplex[i][j] - simplex[0][j]);
            }
            simplex[i] = clampParams(simplex[i]);
            values[i] = objective(simplex[i]);
        }
    }
    
    const bestIdx = values.indexOf(Math.min(...values));
    return { solution: simplex[bestIdx], value: values[bestIdx] };
};

/**
 * Generate a random perturbation of a solution
 */
const perturbSolution = (solution, strength = 0.3, opacityBounds) => {
    return solution.map((v, idx) => {
        let val = v + (Math.random() - 0.5) * 2 * strength;
        if ((idx + 1) % 4 === 0) {
            return clamp(val, opacityBounds.min, opacityBounds.max);
        }
        return clamp(val, 0, 1);
    });
};

/**
 * Generate a random initial solution (RGBA/HSLA)
 */
const randomSolution = (dims, opacityBounds) => {
    return Array(dims).fill(0).map((_, idx) => {
        if ((idx + 1) % 4 === 0) {
            return opacityBounds.min + Math.random() * (opacityBounds.max - opacityBounds.min);
        }
        return Math.random();
    });
};

/**
 * Joint optimization with multiple restarts and basin hopping
 * Handles RGBA/HSLA optimization (4 params per step)
 */
const jointOptimizeModeSequenceEnhanced = (pairs, modeSequence, initialBlends = null, numRestarts = 5, basinHops = 3, minOpacity = 0.1, maxOpacity = 1.0) => {
    const validPairs = pairs.filter(p => p.source && p.target);
    if (validPairs.length === 0) return null;
    
    const numSteps = modeSequence.length;
    const dims = numSteps * 4; // R/H, G/S, B/L, A per step
    const opacityBounds = { min: minOpacity, max: maxOpacity };
    
    // Objective function
    const objective = (flatParams) => {
        const steps = [];
        for (let i = 0; i < numSteps; i++) {
            const baseIdx = i * 4;
            steps.push({
                modeName: modeSequence[i],
                blend: [
                    flatParams[baseIdx],
                    flatParams[baseIdx + 1],
                    flatParams[baseIdx + 2]
                ],
                opacity: flatParams[baseIdx + 3]
            });
        }
        const result = computeMultiStepError(validPairs, steps);
        return result.totalError;
    };
    
    let globalBest = null;
    let globalBestValue = Infinity;
    
    // Try multiple starting points
    for (let restart = 0; restart < numRestarts; restart++) {
        // Generate initial point
        let initial;
        if (restart === 0 && initialBlends && initialBlends.length === numSteps) {
            // First restart uses provided initial blends + maxOpacity
            initial = [];
            for (const blend of initialBlends) {
                initial.push(...blend);
                initial.push(maxOpacity); 
            }
        } else if (restart === 1) {
            // Second restart uses gray/neutral + maxOpacity
            initial = [];
            for(let i=0; i<numSteps; i++) {
                initial.push(0.5, 0.5, 0.5, maxOpacity);
            }
        } else {
            // Random restarts
            initial = randomSolution(dims, opacityBounds);
        }
        
        // Run Nelder-Mead from this starting point
        let { solution, value } = nelderMeadMultiDim(objective, initial, {
            maxIterations: 400,
            tolerance: 1e-8,
            initialStep: 0.25,
            opacityBounds
        });
        
        // Basin hopping: perturb and re-optimize
        for (let hop = 0; hop < basinHops; hop++) {
            const perturbed = perturbSolution(solution, 0.2 + hop * 0.1, opacityBounds);
            const hopResult = nelderMeadMultiDim(objective, perturbed, {
                maxIterations: 300,
                tolerance: 1e-7,
                initialStep: 0.15,
                opacityBounds
            });
            
            if (hopResult.value < value) {
                solution = hopResult.solution;
                value = hopResult.value;
            }
        }
        
        if (value < globalBestValue) {
            globalBestValue = value;
            globalBest = solution;
        }
    }
    
    // Build final steps from global best
    const steps = [];
    for (let i = 0; i < numSteps; i++) {
        const baseIdx = i * 4;
        const blend = [
            clamp(globalBest[baseIdx], 0, 1),
            clamp(globalBest[baseIdx + 1], 0, 1),
            clamp(globalBest[baseIdx + 2], 0, 1)
        ];
        const opacity = clamp(globalBest[baseIdx + 3], minOpacity, maxOpacity);
        
        const step = {
            modeName: modeSequence[i],
            blend,
            opacity
        };

        // Determine display values based on mode
        if (modeSequence[i] === HSL_MODE_NAME) {
            const h = Math.round((blend[0] * 360) - 180);
            const s = Math.round((blend[1] * 200) - 100);
            const l = Math.round((blend[2] * 200) - 100);
            step.hslValues = { h, s, l };
            step.blendHex = "#HSL"; // Placeholder
        } else {
            const blendRgb = blend.map(c => Math.round(c * 255));
            step.blendHex = rgbToHex(...blendRgb);
        }

        steps.push(step);
    }
    
    const result = computeMultiStepError(validPairs, steps);
    
    // Add stepError to each step (calculated as weighted average now)
    let currentColors = validPairs.map(p => {
        const rgb = hexToRgb(p.source);
        return rgb.map(c => c / 255);
    });
    
    // Calculate total weight for normalization
    let totalWeight = 0;
    validPairs.forEach(p => {
        totalWeight += (p.weight !== undefined ? p.weight : 1);
    });

    for (let i = 0; i < steps.length; i++) {
        currentColors = currentColors.map(c => 
            applyBlendNorm(steps[i].modeName, c, steps[i].blend, steps[i].opacity)
        );
        
        let stepWeightedError = 0;
        const targetColors = validPairs.map(p => hexToRgb(p.target));
        
        for (let j = 0; j < currentColors.length; j++) {
            const achievedRgb = currentColors[j].map(c => Math.round(c * 255));
            const targetRgb = targetColors[j];
            const achievedLab = rgbToLab(...achievedRgb);
            const targetLab = rgbToLab(...targetRgb);
            const weight = validPairs[j].weight !== undefined ? validPairs[j].weight : 1;
            
            stepWeightedError += deltaE(targetLab, achievedLab) * weight;
        }
        
        steps[i].stepError = totalWeight > 0 ? stepWeightedError / totalWeight : 0;
    }
    
    return {
        steps,
        modeSequence,
        ...result
    };
};

/**
 * Generate all possible mode sequences of given length
 */
const generateModeSequences = (numSteps, maxSequences = 300, allowHsl = false) => {
    const modeNames = blendModes.map(m => m.name);
    if (allowHsl) modeNames.push(HSL_MODE_NAME);
    const numModes = modeNames.length;
    
    if (numSteps === 1) {
        return modeNames.map(m => [m]);
    }
    
    const sequences = [];
    
    // For small numSteps, enumerate all
    if (Math.pow(numModes, numSteps) <= maxSequences) {
        const generate = (current) => {
            if (current.length === numSteps) {
                sequences.push(current.slice());
                return;
            }
            for (const mode of modeNames) {
                current.push(mode);
                generate(current);
                current.pop();
            }
        };
        generate([]);
    } else {
        // For larger numSteps, use random sampling with diversity
        const used = new Set();
        
        // Add some structured sequences (same mode repeated)
        for (const mode of modeNames) {
            const seq = Array(numSteps).fill(mode);
            const key = seq.join('|');
            if (!used.has(key)) {
                used.add(key);
                sequences.push(seq);
            }
        }
        
        // Add pairwise combinations for first two steps
        for (const mode1 of modeNames) {
            for (const mode2 of modeNames) {
                if (sequences.length >= maxSequences) break;
                const seq = [mode1, mode2];
                while (seq.length < numSteps) {
                    seq.push(modeNames[Math.floor(Math.random() * numModes)]);
                }
                const key = seq.join('|');
                if (!used.has(key)) {
                    used.add(key);
                    sequences.push(seq);
                }
            }
        }
        
        // Add random sequences to fill up
        while (sequences.length < maxSequences) {
            const seq = [];
            for (let i = 0; i < numSteps; i++) {
                seq.push(modeNames[Math.floor(Math.random() * numModes)]);
            }
            const key = seq.join('|');
            if (!used.has(key)) {
                used.add(key);
                sequences.push(seq);
            }
        }
    }
    
    return sequences;
};

/**
 * Greedy search to find promising mode sequences
 */
const greedySearchSequences = (pairs, numSteps, numTrials = 30, minOpacity = 0.1, maxOpacity = 1.0, allowHsl = false) => {
    const validPairs = pairs.filter(p => p.source && p.target);
    if (validPairs.length === 0) return [];
    
    const candidates = [];
    const modeNames = blendModes.map(m => m.name);
    if (allowHsl) modeNames.push(HSL_MODE_NAME);
    
    // Run multiple greedy trials with different starting points and randomization
    for (let trial = 0; trial < numTrials; trial++) {
        const steps = [];
        let currentColors = validPairs.map(p => {
            const rgb = hexToRgb(p.source);
            return rgb.map(c => c / 255);
        });
        
        // Track error properly
        let finalError = Infinity;

        for (let stepIdx = 0; stepIdx < numSteps; stepIdx++) {
            let bestMode = null;
            let bestBlend = null;
            let bestStepError = Infinity;
            
            // Shuffle modes for diversity in later trials
            const shuffledModes = trial === 0 
                ? modeNames 
                : [...modeNames].sort(() => Math.random() - 0.5);
            
            // For some trials, only consider top-k modes to encourage diversity
            const modesToTry = trial > numTrials / 2 
                ? shuffledModes.slice(0, Math.max(5, Math.floor(modeNames.length / 2)))
                : shuffledModes;
            
            for (const modeName of modesToTry) {
                // Create virtual pairs from current state to original targets
                const virtualPairs = validPairs.map((p, i) => ({
                    source: rgbToHex(...currentColors[i].map(c => Math.round(c * 255))),
                    target: p.target,
                    weight: p.weight !== undefined ? p.weight : 1
                }));
                
                let result;
                
                if (modeName === HSL_MODE_NAME) {
                     // Optimize HSL Step (3 params)
                     // Reusing Nelder-Mead for HSL params 0-1
                     const objective = (blendNorm) => {
                         // computeBlendError doesn't support HSL directly, use applyBlendNorm logic manual check
                         // Actually, let's create a mini helper since we don't have optimizeHslStep exposed globally easily
                         let totalWError = 0;
                         let tW = 0;
                         
                         const h = (blendNorm[0] * 360) - 180;
                         const s = (blendNorm[1] * 200) - 100;
                         const l = (blendNorm[2] * 200) - 100;

                         for (const vp of virtualPairs) {
                             const sRgb = hexToRgb(vp.source);
                             const tRgb = hexToRgb(vp.target);
                             if (!sRgb || !tRgb) continue;
                             
                             const weight = vp.weight;
                             const resRgb = applyHslAdjustment(sRgb, h, s, l);
                             const err = deltaE(rgbToLab(...tRgb), rgbToLab(...resRgb));
                             totalWError += err * weight;
                             tW += weight;
                         }
                         return tW > 0 ? totalWError : Infinity;
                     };

                     const initial = [0.5, 0.5, 0.5]; // Neutral
                     const optimized = nelderMead(objective, initial, { maxIterations: 100 });
                     
                     // Compute final error
                     const finalErr = objective(optimized) / (virtualPairs.reduce((acc,p)=>acc+(p.weight||1), 0) || 1);
                     
                     result = { blend: optimized, avgError: finalErr };

                } else {
                    const mode = blendModes.find(m => m.name === modeName);
                    result = optimizeBlend(mode, virtualPairs);
                }
                
                if (result && result.avgError < bestStepError) {
                    bestStepError = result.avgError;
                    bestMode = modeName;
                    bestBlend = result.blend;
                }
            }
            
            if (bestMode && bestBlend) {
                // Greedy search assumes max opacity for now
                steps.push({ modeName: bestMode, blend: bestBlend });
                currentColors = currentColors.map(c => 
                    applyBlendNorm(bestMode, c, bestBlend, maxOpacity)
                );
                finalError = bestStepError;
            }
        }
        
        if (steps.length === numSteps) {
            const modeSequence = steps.map(s => s.modeName);
            // Initialize 4D blends: [p1, p2, p3, maxOpacity]
            const initialBlends = steps.map(s => s.blend);
            
            candidates.push({ modeSequence, initialBlends, greedyError: finalError });
        }
    }
    
    // Sort by error and return unique sequences
    candidates.sort((a, b) => a.greedyError - b.greedyError);
    
    const uniqueCandidates = [];
    const seen = new Set();
    for (const c of candidates) {
        const key = c.modeSequence.join('|');
        if (!seen.has(key)) {
            seen.add(key);
            uniqueCandidates.push(c);
        }
    }
    
    return uniqueCandidates;
};

/**
 * Async multi-step optimizer with cancellation and progress reporting
 * Uses enhanced optimization with multiple restarts and basin hopping
 */
class MultiStepOptimizerAsync {
    constructor() {
        this.cancelled = false;
        this.bestResult = null;
        this.topSolutions = [];
        this.onProgress = null;
        this.onBestFound = null;
    }
    
    cancel() {
        this.cancelled = true;
    }
    
    async sleep(ms = 0) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    async optimize(pairs, numSteps, options = {}) {
        this.cancelled = false;
        // Keep existing best result if provided (for re-runs)
        this.bestResult = options.existingBest || null;
        this.topSolutions = options.existingBest ? [options.existingBest] : [];
        this.onProgress = options.onProgress || null;
        this.onBestFound = options.onBestFound || null;
        
        const minOpacity = (options.minOpacity || 10) / 100;
        const maxOpacity = (options.maxOpacity || 100) / 100;
        const allowHsl = options.allowHsl || false;
        
        // Extensive mode uses 5x more resources
        const extensive = options.extensive || false;
        const greedyTrials = extensive ? 200 : 40;
        const maxSequences = extensive ? 1000 : 250;
        const numRestartsBase = extensive ? 8 : 3;
        const numRestartsNoInit = extensive ? 15 : 5;
        const basinHopsCount = extensive ? 5 : 2;
        
        const validPairs = pairs.filter(p => p.source && p.target);
        if (validPairs.length === 0) return null;
        
        // Phase 0: Find best single-mode result for comparison
        if (this.onProgress) {
            this.onProgress({ phase: 'single', message: 'Finding best single-mode solution...' });
        }
        
        let singleBestMode = null;
        let singleBestError = Infinity;
        
        for (const mode of blendModes) {
            if (this.cancelled) return this.bestResult;
            
            const result = optimizeBlend(mode, validPairs);
            if (result && result.avgError < singleBestError) {
                singleBestError = result.avgError;
                singleBestMode = mode.name;
            }
        }
        
        await this.sleep(0);
        
        if (this.cancelled) return this.bestResult;
        
        // Phase 1: Generate candidate sequences via greedy search
        if (this.onProgress) {
            const modeLabel = extensive ? 'Running EXTENSIVE greedy search...' : 'Running greedy search for promising sequences...';
            this.onProgress({ phase: 'greedy', message: modeLabel });
        }
        
        // Get greedy candidates (more trials for better coverage)
        const greedyCandidates = greedySearchSequences(validPairs, numSteps, greedyTrials, minOpacity, maxOpacity, allowHsl);
        
        await this.sleep(0);
        
        if (this.cancelled) return this.bestResult;
        
        // Phase 2: Generate additional random/enumerated candidates
        if (this.onProgress) {
            this.onProgress({ phase: 'generating', message: 'Generating additional candidate sequences...' });
        }
        
        const enumeratedSequences = generateModeSequences(numSteps, maxSequences, allowHsl);
        
        // Combine greedy (prioritized) and enumerated candidates
        const allCandidates = [];
        const seenSequences = new Set();
        
        // Add greedy candidates first (they have good initial guesses)
        for (const gc of greedyCandidates) {
            const key = gc.modeSequence.join('|');
            if (!seenSequences.has(key)) {
                seenSequences.add(key);
                allCandidates.push(gc);
            }
        }
        
        // Add enumerated sequences
        for (const seq of enumeratedSequences) {
            const key = seq.join('|');
            if (!seenSequences.has(key)) {
                seenSequences.add(key);
                allCandidates.push({ modeSequence: seq, initialBlends: null, greedyError: null });
            }
        }
        
        await this.sleep(0);
        
        if (this.cancelled) return this.bestResult;
        
        // Phase 3: Optimize each candidate with enhanced algorithm
        const totalCandidates = allCandidates.length;
        let evaluated = 0;
        
        for (const candidate of allCandidates) {
            if (this.cancelled) return this.bestResult;
            
            evaluated++;
            
            if (this.onProgress) {
                const modeLabel = extensive ? '[EXTENSIVE] ' : '';
                this.onProgress({
                    phase: 'optimizing',
                    current: evaluated,
                    total: totalCandidates,
                    message: `${modeLabel}Optimizing ${evaluated}/${totalCandidates}: ${candidate.modeSequence.join(' → ')}`,
                    currentSequence: candidate.modeSequence
                });
            }
            
            try {
                // Use enhanced optimization with restarts and basin hopping
                // More restarts for candidates without initial guesses
                const numRestarts = candidate.initialBlends ? numRestartsBase : numRestartsNoInit;
                
                const result = jointOptimizeModeSequenceEnhanced(
                    validPairs,
                    candidate.modeSequence,
                    candidate.initialBlends,
                    numRestarts,
                    basinHopsCount,
                    minOpacity,
                    maxOpacity
                );
                
                if (result) {
                    // Calculate improvement
                    const improvement = singleBestError > 0 
                        ? ((singleBestError - result.avgError) / singleBestError) * 100 
                        : 0;
                    
                    const resultWithMeta = {
                        ...result,
                        singleBestMode,
                        singleBestError,
                        improvement: Math.max(0, improvement)
                    };

                    // Update top solutions list
                    this.updateTopSolutions(resultWithMeta);

                    // Update best result reference
                    if (!this.bestResult || resultWithMeta.avgError < this.bestResult.avgError) {
                        this.bestResult = resultWithMeta;
                    }
                    
                    // Notify UI with updated list
                    if (this.onBestFound) {
                        this.onBestFound(this.topSolutions);
                    }
                }
            } catch (e) {
                console.error('Error optimizing sequence:', candidate.modeSequence, e);
            }
            
            // Yield to UI every few iterations
            if (evaluated % 2 === 0) {
                await this.sleep(0);
            }
        }
        
        if (this.onProgress) {
            this.onProgress({ phase: 'done', message: 'Optimization complete!' });
        }
        
        return this.topSolutions;
    }

    // Helper to maintain top solutions list
    updateTopSolutions(newResult) {
        const MAX_SOLUTIONS = 6;
        const all = [...this.topSolutions];
        
        // Check if this sequence already exists
        const seqKey = newResult.steps.map(s => {
            if (s.hslValues) return `${s.modeName}:${s.hslValues.h},${s.hslValues.s},${s.hslValues.l}`;
            return s.modeName + ':' + s.blendHex;
        }).join('|');

        const existingIdx = all.findIndex(s => {
             const key = s.steps.map(st => {
                 if (st.hslValues) return `${st.modeName}:${st.hslValues.h},${st.hslValues.s},${st.hslValues.l}`;
                 return st.modeName + ':' + st.blendHex;
             }).join('|');
             return key === seqKey;
        });
        
        if (existingIdx >= 0) {
            // Replace if better
            if (newResult.avgError < all[existingIdx].avgError) {
                all[existingIdx] = newResult;
            }
        } else {
            all.push(newResult);
        }
        
        // Sort by avgError and keep top N
        all.sort((a, b) => a.avgError - b.avgError);
        this.topSolutions = all.slice(0, MAX_SOLUTIONS);
    }
}

// Global optimizer instance
let currentOptimizer = null;

/**
 * Start async multi-step optimization
 */
const startMultiStepOptimization = async (pairs, numSteps, callbacks = {}, options = {}) => {
    // Cancel any existing optimization
    if (currentOptimizer) {
        currentOptimizer.cancel();
    }
    
    currentOptimizer = new MultiStepOptimizerAsync();
    
    const result = await currentOptimizer.optimize(pairs, numSteps, {
        onProgress: callbacks.onProgress,
        onBestFound: callbacks.onBestFound,
        existingBest: options.existingBest || null,
        extensive: options.extensive || false,
        minOpacity: options.minOpacity,
        maxOpacity: options.maxOpacity,
        allowHsl: options.allowHsl
    });
    
    currentOptimizer = null;
    return result;
};

/**
 * Cancel ongoing optimization
 */
const cancelMultiStepOptimization = () => {
    if (currentOptimizer) {
        currentOptimizer.cancel();
        currentOptimizer = null;
        return true;
    }
    return false;
};

/**
 * Check if optimization is running
 */
const isOptimizationRunning = () => {
    return currentOptimizer !== null;
};
