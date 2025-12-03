

// Blend color optimizer - finds optimal blend for multiple source-target pairs

/**
 * Compute the total weighted perceptual error for a given blend color across all pairs
 * @param {string} modeName - Name of the blend mode
 * @param {Array} pairs - Array of {source, target, weight} objects
 * @param {Array} blendNorm - Blend color as [r, g, b] normalized 0-1
 * @returns {Object} - {totalError, avgError, maxError, perPairResults}
 */
const computeBlendError = (modeName, pairs, blendNorm) => {
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
        
        // Apply blend to get achieved color
        const achievedNorm = [
            applyBlendChannel(modeName, sNorm[0], blendNorm[0]),
            applyBlendChannel(modeName, sNorm[1], blendNorm[1]),
            applyBlendChannel(modeName, sNorm[2], blendNorm[2]),
        ].map(c => clamp(c, 0, 1));
        
        const achievedRgb = achievedNorm.map(c => Math.round(c * 255));
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
            achievedRgb,
            error
        });
        
        totalWeightedError += error * weight;
        totalWeight += weight;
        maxError = Math.max(maxError, error);
    }
    
    // Compute weighted average
    const avgError = totalWeight > 0 ? totalWeightedError / totalWeight : 0;
    
    return { totalError: totalWeightedError, avgError, maxError, perPairResults };
};

/**
 * Compute initial guess for blend color using weighted analytical inverses
 * @param {Object} mode - Blend mode object
 * @param {Array} pairs - Array of {source, target, weight} objects
 * @returns {Array} - Initial blend guess as [r, g, b] normalized 0-1
 */
const computeInitialGuess = (mode, pairs) => {
    const validInverses = [];
    let totalWeight = 0;
    
    for (const pair of pairs) {
        const sRgb = hexToRgb(pair.source);
        const tRgb = hexToRgb(pair.target);
        
        if (!sRgb || !tRgb) continue;
        
        const sNorm = sRgb.map(c => c / 255);
        const tNorm = tRgb.map(c => c / 255);
        
        const blendNorm = [0, 0, 0];
        let valid = true;
        
        for (let i = 0; i < 3; i++) {
            const b = mode.inverse(sNorm[i], tNorm[i]);
            if (b === null || !isFinite(b)) {
                valid = false;
                break;
            }
            blendNorm[i] = clamp(b, 0, 1);
        }
        
        if (valid) {
            const weight = pair.weight !== undefined ? pair.weight : 1;
            validInverses.push({ norm: blendNorm, weight: weight });
            totalWeight += weight;
        }
    }
    
    // If we have valid inverses, calculate weighted average
    if (validInverses.length > 0) {
        // Handle case where totalWeight is 0 (e.g. all weights are 0) by falling back to uniform average
        if (totalWeight <= 0) {
            const avg = [0, 0, 0];
            for (const item of validInverses) {
                avg[0] += item.norm[0];
                avg[1] += item.norm[1];
                avg[2] += item.norm[2];
            }
            return [
                avg[0] / validInverses.length,
                avg[1] / validInverses.length,
                avg[2] / validInverses.length
            ];
        }

        const avg = [0, 0, 0];
        for (const item of validInverses) {
            avg[0] += item.norm[0] * item.weight;
            avg[1] += item.norm[1] * item.weight;
            avg[2] += item.norm[2] * item.weight;
        }
        return [
            avg[0] / totalWeight,
            avg[1] / totalWeight,
            avg[2] / totalWeight
        ];
    }
    
    // Fallback to gray
    return [0.5, 0.5, 0.5];
};

/**
 * Nelder-Mead simplex optimization for 3D blend color space
 * @param {Function} objective - Function that takes [r,g,b] and returns error
 * @param {Array} initial - Initial guess [r, g, b]
 * @param {Object} options - Optimization options
 * @returns {Array} - Optimized [r, g, b]
 */
const nelderMead = (objective, initial, options = {}) => {
    const maxIterations = options.maxIterations || 200;
    const tolerance = options.tolerance || 1e-6;
    const alpha = 1.0;  // reflection
    const gamma = 2.0;  // expansion
    const rho = 0.5;    // contraction
    const sigma = 0.5;  // shrink
    
    const n = 3; // dimensions (RGB)
    
    // Initialize simplex with n+1 vertices
    const simplex = [initial.slice()];
    const step = 0.1;
    
    for (let i = 0; i < n; i++) {
        const vertex = initial.slice();
        vertex[i] = clamp(vertex[i] + step, 0, 1);
        simplex.push(vertex);
    }
    
    // Evaluate all vertices
    let values = simplex.map(v => objective(v));
    
    for (let iter = 0; iter < maxIterations; iter++) {
        // Sort by objective value
        const indices = values.map((v, i) => i).sort((a, b) => values[a] - values[b]);
        simplex.sort((a, b) => values[indices.indexOf(simplex.indexOf(a))] - values[indices.indexOf(simplex.indexOf(b))]);
        
        // Re-sort properly
        const sortedSimplex = indices.map(i => simplex[i]);
        const sortedValues = indices.map(i => values[i]);
        for (let i = 0; i <= n; i++) {
            simplex[i] = sortedSimplex[i];
            values[i] = sortedValues[i];
        }
        
        // Check convergence
        const range = values[n] - values[0];
        if (range < tolerance) break;
        
        // Compute centroid of all points except worst
        const centroid = [0, 0, 0];
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                centroid[j] += simplex[i][j];
            }
        }
        for (let j = 0; j < n; j++) {
            centroid[j] /= n;
        }
        
        // Reflection
        const reflected = centroid.map((c, j) => 
            clamp(c + alpha * (c - simplex[n][j]), 0, 1)
        );
        const reflectedValue = objective(reflected);
        
        if (reflectedValue >= values[0] && reflectedValue < values[n - 1]) {
            simplex[n] = reflected;
            values[n] = reflectedValue;
            continue;
        }
        
        // Expansion
        if (reflectedValue < values[0]) {
            const expanded = centroid.map((c, j) => 
                clamp(c + gamma * (reflected[j] - c), 0, 1)
            );
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
        const contracted = centroid.map((c, j) => 
            clamp(c + rho * (simplex[n][j] - c), 0, 1)
        );
        const contractedValue = objective(contracted);
        
        if (contractedValue < values[n]) {
            simplex[n] = contracted;
            values[n] = contractedValue;
            continue;
        }
        
        // Shrink
        for (let i = 1; i <= n; i++) {
            for (let j = 0; j < n; j++) {
                simplex[i][j] = clamp(simplex[0][j] + sigma * (simplex[i][j] - simplex[0][j]), 0, 1);
            }
            values[i] = objective(simplex[i]);
        }
    }
    
    // Return best vertex
    const bestIdx = values.indexOf(Math.min(...values));
    return simplex[bestIdx];
};

/**
 * Find optimal blend color for a set of source-target pairs
 * @param {Object} mode - Blend mode object from blendModes array
 * @param {Array} pairs - Array of {source, target} hex color pairs
 * @returns {Object} - Optimization result
 */
const optimizeBlend = (mode, pairs) => {
    // Filter out incomplete pairs
    const validPairs = pairs.filter(p => p.source && p.target);
    
    if (validPairs.length === 0) {
        return null;
    }
    
    // Compute initial guess from analytical inverses
    const initialGuess = computeInitialGuess(mode, validPairs);
    
    // Define objective function
    const objective = (blendNorm) => {
        // Optimization minimizes the total error (weighted sum), which is equivalent to minimizing weighted average
        const result = computeBlendError(mode.name, validPairs, blendNorm);
        return result.totalError;
    };
    
    // Run optimization
    const optimizedBlend = nelderMead(objective, initialGuess, {
        maxIterations: 300,
        tolerance: 1e-7
    });
    
    // Compute final error metrics
    const finalResult = computeBlendError(mode.name, validPairs, optimizedBlend);
    
    // Convert blend to hex
    const blendRgb = optimizedBlend.map(c => Math.round(c * 255));
    const blendHex = rgbToHex(...blendRgb);
    
    // Determine quality badge based on average Delta E
    let quality;
    if (finalResult.avgError < 1.0) {
        quality = 'exact';
    } else if (finalResult.avgError < 3.0) {
        quality = 'good';
    } else if (finalResult.avgError < 6.0) {
        quality = 'approx';
    } else {
        quality = 'poor';
    }
    
    return {
        blend: optimizedBlend,
        blendHex,
        blendRgb,
        totalError: finalResult.totalError,
        avgError: finalResult.avgError,
        maxError: finalResult.maxError,
        perPairResults: finalResult.perPairResults,
        quality
    };
};

/**
 * Get quality badge label
 * @param {string} quality - Quality level
 * @returns {string} - Human readable label
 */
const getQualityLabel = (quality) => {
    switch (quality) {
        case 'exact': return 'Exact';
        case 'good': return 'Good';
        case 'approx': return 'Approx';
        case 'poor': return 'Poor';
        default: return 'Unknown';
    }
};
