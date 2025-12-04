// Multi-step blend optimizer - finds optimal sequence of blend modes and colors
// Uses hybrid approach: greedy search + joint refinement with cancellation support
// Enhanced with multiple random restarts and basin hopping to escape local minima

const HSL_MODE_NAME = "Hue/Saturation";
const LEVELS_MODE_NAME = "Levels";

/**
 * Helper to get parameter count for a mode (excluding opacity)
 */
const getModeParamCount = (modeName) => {
    if (modeName === LEVELS_MODE_NAME) return 5;
    return 3;
};

/**
 * Apply a single blend to a normalized RGB color with opacity
 * Result = opacity * Blend(Source, BlendColor) + (1 - opacity) * Source
 */
const applyBlendNorm = (modeName, sourceNorm, blendNorm, opacity = 1) => {
    if (modeName === HSL_MODE_NAME) {
        // For HSL mode, blendNorm contains [hueNorm, satNorm, lightNorm] (0-1)
        const h = (blendNorm[0] * 360) - 180;
        const s = (blendNorm[1] * 200) - 100;
        const l = (blendNorm[2] * 200) - 100;
        
        const sRgb = sourceNorm.map(c => Math.round(c * 255));
        const resRgb = applyHslAdjustment(sRgb, h, s, l);
        const resNorm = resRgb.map(c => c / 255);
        
        return [
            clamp(opacity * resNorm[0] + (1 - opacity) * sourceNorm[0], 0, 1),
            clamp(opacity * resNorm[1] + (1 - opacity) * sourceNorm[1], 0, 1),
            clamp(opacity * resNorm[2] + (1 - opacity) * sourceNorm[2], 0, 1)
        ];
    }
    
    if (modeName === LEVELS_MODE_NAME) {
        // Levels params: InputBlack, InputWhite, Gamma, OutputBlack, OutputWhite
        // Mapped from normalized 0-1
        
        // 1. Enforce Input Black < Input White Constraint
        let inBlack = blendNorm[0] * 255;
        let inWhite = blendNorm[1] * 255;
        
        // Clamp Black to [0, 253] to leave room for White
        inBlack = Math.min(253, Math.max(0, inBlack));
        
        // Ensure White is at least Black + 2
        inWhite = Math.max(inBlack + 2, Math.min(255, inWhite));
        
        // 2. Map Gamma (0.1 to 9.99)
        const gamma = Math.max(0.1, Math.min(9.99, blendNorm[2] * 9.89 + 0.1));

        const params = {
            inputBlack: inBlack,
            inputWhite: inWhite,
            inputGamma: gamma,
            outputBlack: blendNorm[3] * 255,
            outputWhite: blendNorm[4] * 255
        };
        
        const sRgb = sourceNorm.map(c => Math.round(c * 255));
        const resRgb = applyLevelsAdjustment(sRgb, params);
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
 * Multi-dimensional Nelder-Mead for joint optimization
 * Accepts paramConfigs to handle variable bounds per dimension
 */
const nelderMeadMultiDim = (objective, initial, options = {}) => {
    const maxIterations = options.maxIterations || 500;
    const tolerance = options.tolerance || 1e-8;
    const paramConfigs = options.paramConfigs || []; // Array of {min, max}
    
    const alpha = 1.0;
    const gamma = 2.0;
    const rho = 0.5;
    const sigma = 0.5;
    
    const n = initial.length;
    
    // Helper to clamp parameters
    const clampParams = (v) => {
        return v.map((val, idx) => {
            const config = paramConfigs[idx] || { min: 0, max: 1 };
            return clamp(val, config.min, config.max);
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
        const indices = values.map((v, i) => i).sort((a, b) => values[a] - values[b]);
        const sortedSimplex = indices.map(i => simplex[i].slice());
        const sortedValues = indices.map(i => values[i]);
        
        for (let i = 0; i <= n; i++) {
            simplex[i] = sortedSimplex[i];
            values[i] = sortedValues[i];
        }
        
        const range = values[n] - values[0];
        if (range < tolerance) break;
        
        const centroid = Array(n).fill(0);
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                centroid[j] += simplex[i][j];
            }
        }
        for (let j = 0; j < n; j++) {
            centroid[j] /= n;
        }
        
        const reflected = clampParams(centroid.map((c, j) => c + alpha * (c - simplex[n][j])));
        const reflectedValue = objective(reflected);
        
        if (reflectedValue >= values[0] && reflectedValue < values[n - 1]) {
            simplex[n] = reflected;
            values[n] = reflectedValue;
            continue;
        }
        
        if (reflectedValue < values[0]) {
            const expanded = clampParams(centroid.map((c, j) => c + gamma * (reflected[j] - c)));
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
        
        const contracted = clampParams(centroid.map((c, j) => c + rho * (simplex[n][j] - c)));
        const contractedValue = objective(contracted);
        
        if (contractedValue < values[n]) {
            simplex[n] = contracted;
            values[n] = contractedValue;
            continue;
        }
        
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

const perturbSolution = (solution, strength = 0.3, paramConfigs) => {
    return solution.map((v, idx) => {
        const config = paramConfigs[idx] || { min: 0, max: 1 };
        const val = v + (Math.random() - 0.5) * 2 * strength;
        return clamp(val, config.min, config.max);
    });
};

const randomSolution = (dims, paramConfigs) => {
    return Array(dims).fill(0).map((_, idx) => {
        const config = paramConfigs[idx] || { min: 0, max: 1 };
        return config.min + Math.random() * (config.max - config.min);
    });
};

/**
 * Joint optimization with variable dimensions per step
 */
const jointOptimizeModeSequenceEnhanced = (pairs, modeSequence, initialBlends = null, numRestarts = 5, basinHops = 3, minOpacity = 0.1, maxOpacity = 1.0) => {
    const validPairs = pairs.filter(p => p.source && p.target);
    if (validPairs.length === 0) return null;
    
    // 1. Determine dimensions and bounds
    const stepConfigs = []; // { paramCount, startIndex }
    const paramConfigs = []; // flattened bounds
    
    let currentIdx = 0;
    for (const mode of modeSequence) {
        const paramCount = getModeParamCount(mode);
        stepConfigs.push({ paramCount, startIndex: currentIdx });
        
        // Add parameter bounds
        for (let i = 0; i < paramCount; i++) {
            paramConfigs.push({ min: 0, max: 1 });
        }
        // Add opacity bound
        paramConfigs.push({ min: minOpacity, max: maxOpacity });
        
        currentIdx += paramCount + 1; // +1 for opacity
    }
    
    const totalDims = currentIdx;
    
    // 2. Objective function
    const objective = (flatParams) => {
        const steps = [];
        for (let i = 0; i < modeSequence.length; i++) {
            const config = stepConfigs[i];
            const mode = modeSequence[i];
            const base = config.startIndex;
            
            const blend = [];
            for (let j = 0; j < config.paramCount; j++) {
                blend.push(flatParams[base + j]);
            }
            const opacity = flatParams[base + config.paramCount];
            
            steps.push({
                modeName: mode,
                blend,
                opacity
            });
        }
        const result = computeMultiStepError(validPairs, steps);
        return result.totalError;
    };
    
    let globalBest = null;
    let globalBestValue = Infinity;
    
    // 3. Optimization Loop
    for (let restart = 0; restart < numRestarts; restart++) {
        let initial = [];
        
        if (restart === 0 && initialBlends && initialBlends.length === modeSequence.length) {
            // Use provided initial guess
            for (let i = 0; i < modeSequence.length; i++) {
                const blend = initialBlends[i];
                initial.push(...blend);
                initial.push(maxOpacity);
            }
        } else if (restart === 1) {
            // Neutral guess
            for (let i = 0; i < modeSequence.length; i++) {
                const count = stepConfigs[i].paramCount;
                for (let k = 0; k < count; k++) initial.push(0.5);
                initial.push(maxOpacity);
            }
        } else {
            // Random guess
            initial = randomSolution(totalDims, paramConfigs);
        }
        
        // Nelder-Mead
        let { solution, value } = nelderMeadMultiDim(objective, initial, {
            maxIterations: 400,
            tolerance: 1e-8,
            initialStep: 0.25,
            paramConfigs
        });
        
        // Basin Hopping
        for (let hop = 0; hop < basinHops; hop++) {
            const perturbed = perturbSolution(solution, 0.2 + hop * 0.1, paramConfigs);
            const hopResult = nelderMeadMultiDim(objective, perturbed, {
                maxIterations: 300,
                tolerance: 1e-7,
                initialStep: 0.15,
                paramConfigs
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
    
    // 4. Construct Result
    const steps = [];
    for (let i = 0; i < modeSequence.length; i++) {
        const config = stepConfigs[i];
        const mode = modeSequence[i];
        const base = config.startIndex;
        
        const blend = [];
        for (let j = 0; j < config.paramCount; j++) {
            blend.push(clamp(globalBest[base + j], 0, 1));
        }
        const opacity = clamp(globalBest[base + config.paramCount], minOpacity, maxOpacity);
        
        const step = { modeName: mode, blend, opacity };

        if (mode === HSL_MODE_NAME) {
            const h = Math.round((blend[0] * 360) - 180);
            const s = Math.round((blend[1] * 200) - 100);
            const l = Math.round((blend[2] * 200) - 100);
            step.hslValues = { h, s, l };
            step.blendHex = "#HSL";
        } else if (mode === LEVELS_MODE_NAME) {
            // Re-apply constraints for final display object
            let ib = Math.round(blend[0] * 255);
            let iw = Math.round(blend[1] * 255);
            ib = Math.min(253, Math.max(0, ib));
            iw = Math.max(ib + 2, Math.min(255, iw));
            
            const levels = {
                inputBlack: ib,
                inputWhite: iw,
                inputGamma: parseFloat(Math.max(0.1, Math.min(9.99, blend[2] * 9.89 + 0.1)).toFixed(2)),
                outputBlack: Math.round(blend[3] * 255),
                outputWhite: Math.round(blend[4] * 255)
            };
            step.levelsValues = levels;
            step.blendHex = "#LVL";
        } else {
            const blendRgb = blend.map(c => Math.round(c * 255));
            step.blendHex = rgbToHex(...blendRgb);
        }

        steps.push(step);
    }
    
    const result = computeMultiStepError(validPairs, steps);
    
    // Calculate per-step error contribution (weighted)
    let currentColors = validPairs.map(p => hexToRgb(p.source).map(c => c / 255));
    let totalWeight = validPairs.reduce((sum, p) => sum + (p.weight !== undefined ? p.weight : 1), 0);

    for (let i = 0; i < steps.length; i++) {
        currentColors = currentColors.map(c => applyBlendNorm(steps[i].modeName, c, steps[i].blend, steps[i].opacity));
        
        let stepWeightedError = 0;
        validPairs.forEach((p, idx) => {
            const achievedRgb = currentColors[idx].map(c => Math.round(c * 255));
            const targetRgb = hexToRgb(p.target);
            const weight = p.weight !== undefined ? p.weight : 1;
            stepWeightedError += deltaE(rgbToLab(...targetRgb), rgbToLab(...achievedRgb)) * weight;
        });
        
        steps[i].stepError = totalWeight > 0 ? stepWeightedError / totalWeight : 0;
    }
    
    return { steps, modeSequence, ...result };
};

const generateModeSequences = (numSteps, maxSequences = 300, allowHsl = false, allowLevels = false) => {
    const modeNames = blendModes.map(m => m.name);
    if (allowHsl) modeNames.push(HSL_MODE_NAME);
    if (allowLevels) modeNames.push(LEVELS_MODE_NAME);
    
    const numModes = modeNames.length;
    if (numSteps === 1) return modeNames.map(m => [m]);
    
    const sequences = [];
    
    // Small step count: exhaustive
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
        // Random sampling with heuristic priority
        const used = new Set();
        
        // 1. Uniform sequences
        for (const mode of modeNames) {
            const seq = Array(numSteps).fill(mode);
            const key = seq.join('|');
            if (!used.has(key)) { used.add(key); sequences.push(seq); }
        }
        
        // 2. Random sequences
        while (sequences.length < maxSequences) {
            const seq = [];
            for (let i = 0; i < numSteps; i++) {
                seq.push(modeNames[Math.floor(Math.random() * numModes)]);
            }
            const key = seq.join('|');
            if (!used.has(key)) { used.add(key); sequences.push(seq); }
        }
    }
    
    return sequences;
};

const greedySearchSequences = (pairs, numSteps, numTrials = 30, minOpacity = 0.1, maxOpacity = 1.0, allowHsl = false, allowLevels = false) => {
    const validPairs = pairs.filter(p => p.source && p.target);
    if (validPairs.length === 0) return [];
    
    const candidates = [];
    const modeNames = blendModes.map(m => m.name);
    if (allowHsl) modeNames.push(HSL_MODE_NAME);
    if (allowLevels) modeNames.push(LEVELS_MODE_NAME);
    
    for (let trial = 0; trial < numTrials; trial++) {
        const steps = [];
        let currentColors = validPairs.map(p => hexToRgb(p.source).map(c => c / 255));
        let finalError = Infinity;

        for (let stepIdx = 0; stepIdx < numSteps; stepIdx++) {
            let bestMode = null;
            let bestBlend = null;
            let bestStepError = Infinity;
            
            // Randomize mode order for diversity
            const modesToTry = trial === 0 ? modeNames : [...modeNames].sort(() => Math.random() - 0.5);
            
            // In later trials, limit to subset to speed up
            const limit = trial > numTrials / 2 ? Math.max(5, Math.floor(modeNames.length / 2)) : modeNames.length;
            
            for (let i = 0; i < limit; i++) {
                const modeName = modesToTry[i];
                
                // Virtual pairs for this step
                const virtualPairs = validPairs.map((p, idx) => ({
                    source: rgbToHex(...currentColors[idx].map(c => Math.round(c * 255))),
                    target: p.target,
                    weight: p.weight !== undefined ? p.weight : 1
                }));
                
                let result;
                
                if (modeName === HSL_MODE_NAME) {
                    const objective = (blendNorm) => {
                        // Reuse applyBlendNorm for error calc
                        const tempStep = { modeName, blend: blendNorm, opacity: 1 }; // Assume max opacity for greedy
                        const res = computeMultiStepError(virtualPairs, [tempStep]);
                        return res.totalError;
                    };
                    const optimized = nelderMead(objective, [0.5, 0.5, 0.5], { maxIterations: 80 }); // Reuse 3D NM for HSL
                    const totalW = virtualPairs.reduce((acc,p)=>acc+(p.weight||1), 0) || 1;
                    result = { blend: optimized, avgError: objective(optimized) / totalW };
                } 
                else if (modeName === LEVELS_MODE_NAME) {
                    const objective = (blendNorm) => {
                        const tempStep = { modeName, blend: blendNorm, opacity: 1 };
                        const res = computeMultiStepError(virtualPairs, [tempStep]);
                        return res.totalError;
                    };
                    // Use 5D optimization for Levels
                    const initial = [0, 1, 0.1, 0, 1]; // Default mapping: Black=0, White=255, G=1.0, etc
                    // Mapping logic in applyBlendNorm uses: g = p*9.89+0.1. So 1.0 gamma is approx p=0.09. Let's start neutral.
                    // Start: InB=0(0), InW=1(255), Gam=~0.09(1.0), OutB=0(0), OutW=1(255)
                    const optimized = nelderMeadMultiDim(objective, [0, 1, 0.09, 0, 1], { maxIterations: 100 }).solution;
                    const totalW = virtualPairs.reduce((acc,p)=>acc+(p.weight||1), 0) || 1;
                    result = { blend: optimized, avgError: objective(optimized) / totalW };
                } 
                else {
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
                steps.push({ modeName: bestMode, blend: bestBlend });
                currentColors = currentColors.map(c => applyBlendNorm(bestMode, c, bestBlend, maxOpacity));
                finalError = bestStepError;
            }
        }
        
        if (steps.length === numSteps) {
            const modeSequence = steps.map(s => s.modeName);
            const initialBlends = steps.map(s => s.blend);
            candidates.push({ modeSequence, initialBlends, greedyError: finalError });
        }
    }
    
    candidates.sort((a, b) => a.greedyError - b.greedyError);
    const unique = [];
    const seen = new Set();
    for (const c of candidates) {
        const key = c.modeSequence.join('|');
        if (!seen.has(key)) { seen.add(key); unique.push(c); }
    }
    return unique;
};

/**
 * Async multi-step optimizer with cancellation and progress reporting
 */
class MultiStepOptimizerAsync {
    constructor() {
        this.cancelled = false;
        this.bestResult = null;
        this.topSolutions = [];
    }
    
    cancel() { this.cancelled = true; }
    async sleep(ms = 0) { return new Promise(resolve => setTimeout(resolve, ms)); }
    
    async optimize(pairs, numSteps, options = {}) {
        this.cancelled = false;
        this.bestResult = options.existingBest || null;
        this.topSolutions = options.existingBest ? [options.existingBest] : [];
        this.onProgress = options.onProgress;
        this.onBestFound = options.onBestFound;
        
        const minOpacity = (options.minOpacity || 10) / 100;
        const maxOpacity = (options.maxOpacity || 100) / 100;
        const allowHsl = options.allowHsl || false;
        const allowLevels = options.allowLevels || false;
        const extensive = options.extensive || false;
        
        const greedyTrials = extensive ? 100 : 30;
        const maxSequences = extensive ? 600 : 200;
        const numRestartsBase = extensive ? 5 : 2;
        const basinHopsCount = extensive ? 4 : 1;
        
        const validPairs = pairs.filter(p => p.source && p.target);
        if (validPairs.length === 0) return null;
        
        // Phase 0: Single Best
        if (this.onProgress) this.onProgress({ phase: 'single', message: 'Finding best single-mode solution...' });
        
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
        await this.sleep();
        
        // Phase 1: Greedy Search
        if (this.onProgress) this.onProgress({ phase: 'greedy', message: 'Running greedy search...' });
        const greedyCandidates = greedySearchSequences(validPairs, numSteps, greedyTrials, minOpacity, maxOpacity, allowHsl, allowLevels);
        await this.sleep();
        
        // Phase 2: Enumeration
        if (this.onProgress) this.onProgress({ phase: 'generating', message: 'Generating sequences...' });
        const enumerated = generateModeSequences(numSteps, maxSequences, allowHsl, allowLevels);
        
        const allCandidates = [];
        const seen = new Set();
        
        [...greedyCandidates, ...enumerated.map(seq => ({ modeSequence: seq, initialBlends: null }))].forEach(c => {
            const key = c.modeSequence.join('|');
            if (!seen.has(key)) { seen.add(key); allCandidates.push(c); }
        });
        
        await this.sleep();
        
        // Phase 3: Optimization
        const total = allCandidates.length;
        let evaluated = 0;
        
        for (const candidate of allCandidates) {
            if (this.cancelled) return this.bestResult;
            evaluated++;
            
            if (this.onProgress) {
                this.onProgress({
                    phase: 'optimizing',
                    current: evaluated,
                    total,
                    message: `Optimizing ${evaluated}/${total}: ${candidate.modeSequence.join(' → ')}`,
                    currentSequence: candidate.modeSequence
                });
            }
            
            try {
                const result = jointOptimizeModeSequenceEnhanced(
                    validPairs, 
                    candidate.modeSequence, 
                    candidate.initialBlends, 
                    candidate.initialBlends ? numRestartsBase : numRestartsBase + 2, 
                    basinHopsCount, 
                    minOpacity, 
                    maxOpacity
                );
                
                if (result) {
                    const improvement = singleBestError > 0 ? ((singleBestError - result.avgError) / singleBestError) * 100 : 0;
                    const metaResult = { ...result, singleBestMode, singleBestError, improvement: Math.max(0, improvement) };
                    
                    this.updateTopSolutions(metaResult);
                    if (!this.bestResult || metaResult.avgError < this.bestResult.avgError) {
                        this.bestResult = metaResult;
                    }
                    if (this.onBestFound) this.onBestFound(this.topSolutions);
                }
            } catch (e) {
                console.error(e);
            }
            
            if (evaluated % 3 === 0) await this.sleep();
        }
        
        if (this.onProgress) this.onProgress({ phase: 'done', message: 'Optimization complete!' });
        return this.topSolutions;
    }
    
    updateTopSolutions(newResult) {
        const MAX = 6;
        const all = [...this.topSolutions];
        const getKey = (res) => res.steps.map(s => {
            if (s.hslValues) return `HSL:${s.hslValues.h},${s.hslValues.s},${s.hslValues.l}`;
            if (s.levelsValues) return `LVL:${s.levelsValues.inputGamma}`;
            return `${s.modeName}:${s.blendHex}`;
        }).join('|');
        
        const seqKey = getKey(newResult);
        const idx = all.findIndex(s => getKey(s) === seqKey);
        
        if (idx >= 0) {
            if (newResult.avgError < all[idx].avgError) all[idx] = newResult;
        } else {
            all.push(newResult);
        }
        
        all.sort((a, b) => a.avgError - b.avgError);
        this.topSolutions = all.slice(0, MAX);
    }
}

let currentOptimizer = null;

const startMultiStepOptimization = async (pairs, numSteps, callbacks = {}, options = {}) => {
    if (currentOptimizer) currentOptimizer.cancel();
    currentOptimizer = new MultiStepOptimizerAsync();
    const result = await currentOptimizer.optimize(pairs, numSteps, {
        onProgress: callbacks.onProgress,
        onBestFound: callbacks.onBestFound,
        existingBest: options.existingBest,
        extensive: options.extensive,
        minOpacity: options.minOpacity,
        maxOpacity: options.maxOpacity,
        allowHsl: options.allowHsl,
        allowLevels: options.allowLevels
    });
    currentOptimizer = null;
    return result;
};

const cancelMultiStepOptimization = () => {
    if (currentOptimizer) {
        currentOptimizer.cancel();
        currentOptimizer = null;
        return true;
    }
    return false;
};