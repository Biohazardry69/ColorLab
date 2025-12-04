// Levels Tool - Optimize Input/Output levels and Gamma

/**
 * Compute the weighted error for given Levels parameters across all pairs
 */
const computeLevelsError = (pairs, params) => {
    const perPairResults = [];
    let totalWeightedError = 0;
    let totalWeight = 0;
    let maxError = 0;
    
    for (const pair of pairs) {
        const sRgb = hexToRgb(pair.source);
        const tRgb = hexToRgb(pair.target);
        
        if (!sRgb || !tRgb) continue;
        
        const weight = pair.weight !== undefined ? pair.weight : 1;

        // Apply Levels adjustment to source
        const achievedRgb = applyLevelsAdjustment(sRgb, params);
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
    
    const avgError = totalWeight > 0 ? totalWeightedError / totalWeight : 0;
    
    return { totalError: totalWeightedError, avgError, maxError, perPairResults };
};

/**
 * Nelder-Mead optimization for 5D Levels parameters
 * Params: [inputBlack, inputWhite, inputGamma, outputBlack, outputWhite]
 */
const optimizeLevels = (pairs) => {
    const validPairs = pairs.filter(p => p.source && p.target);
    
    if (validPairs.length === 0) {
        return null;
    }
    
    // Objective function: takes params array and returns total weighted error
    const objective = (p) => {
        const params = {
            inputBlack: p[0],
            inputWhite: p[1],
            inputGamma: p[2],
            outputBlack: p[3],
            outputWhite: p[4]
        };
        const result = computeLevelsError(validPairs, params);
        return result.totalError;
    };
    
    // Nelder-Mead implementation for 5D
    const nelderMead5D = (fn, initial, options = {}) => {
        const maxIterations = options.maxIterations || 800;
        const tolerance = options.tolerance || 1e-6;
        const alpha = 1.0;
        const gamma = 2.0;
        const rho = 0.5;
        const sigma = 0.5;
        
        const n = 5;
        
        // Clamp parameters to valid ranges
        const clampParams = (p) => {
            let ib = Math.max(0, Math.min(253, p[0]));
            let iw = Math.max(ib + 2, Math.min(255, p[1])); // Ensure white > black
            let gam = Math.max(0.1, Math.min(9.99, p[2]));
            let ob = Math.max(0, Math.min(255, p[3]));
            let ow = Math.max(0, Math.min(255, p[4]));
            return [ib, iw, gam, ob, ow];
        };
        
        const simplex = [clampParams(initial.slice())];
        
        // Initial steps for simplex construction
        // Small perturbations relevant to each parameter scale
        const steps = [10, -10, 0.2, 10, -10];
        
        for (let i = 0; i < n; i++) {
            const vertex = initial.slice();
            vertex[i] = vertex[i] + steps[i];
            simplex.push(clampParams(vertex));
        }
        
        let values = simplex.map(v => fn(v));
        
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
            
            // Reflection
            const reflected = clampParams(centroid.map((c, j) => c + alpha * (c - simplex[n][j])));
            const reflectedValue = fn(reflected);
            
            if (reflectedValue >= values[0] && reflectedValue < values[n - 1]) {
                simplex[n] = reflected;
                values[n] = reflectedValue;
                continue;
            }
            
            // Expansion
            if (reflectedValue < values[0]) {
                const expanded = clampParams(centroid.map((c, j) => c + gamma * (reflected[j] - c)));
                const expandedValue = fn(expanded);
                
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
            const contracted = clampParams(centroid.map((c, j) => c + rho * (simplex[n][j] - c)));
            const contractedValue = fn(contracted);
            
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
                values[i] = fn(simplex[i]);
            }
        }
        
        const bestIdx = values.indexOf(Math.min(...values));
        return { solution: simplex[bestIdx], value: values[bestIdx] };
    };
    
    // Restarts logic similar to other tools
    const startingPoints = [
        [0, 255, 1.0, 0, 255],      // Default
        [10, 245, 1.0, 0, 255],     // Slight clip
        [0, 255, 0.8, 0, 255],      // Gamma down
        [0, 255, 1.2, 0, 255],      // Gamma up
        [0, 255, 1.0, 10, 245],     // Output clip
        [20, 235, 1.0, 0, 255],     // More input clip
        [0, 255, 1.0, 0, 200],      // Darken output
        [0, 255, 1.0, 50, 255],     // Lighten output
    ];
    
    let bestResult = null;
    let bestValue = Infinity;
    
    for (const start of startingPoints) {
        const result = nelderMead5D(objective, start, { maxIterations: 500 });
        if (result.value < bestValue) {
            bestValue = result.value;
            bestResult = result.solution;
        }
    }
    
    // Extract Final Params
    const p = bestResult;
    const finalParams = {
        inputBlack: Math.round(p[0]),
        inputWhite: Math.round(p[1]),
        inputGamma: Math.round(p[2] * 100) / 100, // Round gamma to 2 decimals
        outputBlack: Math.round(p[3]),
        outputWhite: Math.round(p[4])
    };
    
    // Compute stats
    const finalStats = computeLevelsError(validPairs, finalParams);
    
    // Quality
    let quality;
    if (finalStats.avgError < 1.0) quality = 'exact';
    else if (finalStats.avgError < 3.0) quality = 'good';
    else if (finalStats.avgError < 6.0) quality = 'approx';
    else quality = 'poor';
    
    return {
        params: finalParams,
        ...finalStats,
        quality
    };
};

/**
 * Render the Levels tool result
 */
const renderLevelsResult = (result) => {
    const container = document.getElementById('levels-result');
    if (!container) return;
    
    if (!result) {
        container.innerHTML = `
            <div class="multistep-placeholder">
                Select at least one complete Source-Target pair to compute optimal Levels adjustments.
            </div>
        `;
        return;
    }
    
    // Build per-pair table rows
    let tableRowsHtml = '';
    result.perPairResults.forEach((pr, index) => {
        const weight = pr.weight !== undefined ? pr.weight : 1;
        tableRowsHtml += `
            <tr>
                <td>${index + 1}</td>
                <td>
                    <span class="modal-swatch-small" style="background:${pr.source}"></span>
                    <span class="modal-hex-small">${pr.source.toUpperCase()}</span>
                </td>
                <td>
                    <span class="modal-swatch-small" style="background:${pr.target}"></span>
                    <span class="modal-hex-small">${pr.target.toUpperCase()}</span>
                </td>
                <td>
                    <span class="modal-swatch-small" style="background:${pr.achieved}"></span>
                    <span class="modal-hex-small">${pr.achieved.toUpperCase()}</span>
                </td>
                <td>
                    <span class="stat-value" style="font-size:0.75rem">${weight}</span>
                </td>
                <td>
                    <span class="delta-e-value ${getDeltaEClass(pr.error)}">${pr.error.toFixed(2)}</span>
                </td>
            </tr>
        `;
    });
    
    const qualityClass = getQualityTagClass(result.quality);
    const qualityLabel = getQualityLabel(result.quality);
    const p = result.params;
    
    // JSON for data attributes
    const paramsJson = JSON.stringify(p);
    
    container.innerHTML = `
        <div class="levels-result-content">
            <div class="step-card" style="margin-bottom: 20px; display: block;">
                <div class="step-mode" style="margin-bottom: 12px;">Optimal Levels</div>
                
                <div class="levels-display-container">
                    <div class="levels-row">
                        <span class="levels-label">Input Levels:</span>
                        <div class="levels-inputs">
                            <span class="hsl-number" title="Input Black">${p.inputBlack}</span>
                            <span class="hsl-number" title="Gamma">${p.inputGamma.toFixed(2)}</span>
                            <span class="hsl-number" title="Input White">${p.inputWhite}</span>
                        </div>
                    </div>
                    <div class="levels-row">
                        <span class="levels-label">Output Levels:</span>
                        <div class="levels-inputs" style="justify-content: space-between; width: 140px;">
                            <span class="hsl-number" title="Output Black">${p.outputBlack}</span>
                            <span class="hsl-number" title="Output White">${p.outputWhite}</span>
                        </div>
                    </div>
                </div>

                <div class="step-error" style="margin-top: 12px; display: flex; align-items: center; justify-content: flex-end;">
                    <span class="${qualityClass}" style="margin-right: 12px;">${qualityLabel}</span>
                    <span>Weighted Avg ΔE: <span class="step-error-value ${getDeltaEClass(result.avgError)}">${result.avgError.toFixed(2)}</span></span>
                </div>
            </div>
            
            <div class="multistep-summary">
                <div class="multistep-summary-title">Error Statistics</div>
                <div class="multistep-stats">
                    <div class="multistep-stat">
                        <div class="multistep-stat-label">Weighted Avg ΔE</div>
                        <div class="multistep-stat-value ${getDeltaEClass(result.avgError)}">${result.avgError.toFixed(3)}</div>
                    </div>
                    <div class="multistep-stat">
                        <div class="multistep-stat-label">Max ΔE</div>
                        <div class="multistep-stat-value ${getDeltaEClass(result.maxError)}">${result.maxError.toFixed(3)}</div>
                    </div>
                    <div class="multistep-stat">
                        <div class="multistep-stat-label">Pairs</div>
                        <div class="multistep-stat-value">${result.perPairResults.length}</div>
                    </div>
                     <div class="multistep-stat" style="display:flex; flex-direction:row; gap:8px; align-items:center;">
                        <button class="btn-preview btn-preview-multistep" id="preview-levels-btn" 
                                data-type="levels"
                                data-params='${paramsJson}'>
                            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            <span>Preview</span>
                            <span class="preview-tooltip">Preview</span>
                        </button>
                        <button class="btn-export btn-export-multistep" id="export-levels-btn" 
                                data-params='${paramsJson}'>
                            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/>
                            </svg>
                            <span>Export</span>
                            <span class="export-tooltip">Export Script</span>
                        </button>
                    </div>
                </div>
            </div>
            
            <div class="multistep-breakdown-inline" style="margin-top: 24px;">
                <h4 style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin: 0 0 12px 0;">Per-Pair Breakdown</h4>
                <div class="results-table-wrapper">
                    <table class="modal-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Source</th>
                                <th>Target (Desired)</th>
                                <th>Achieved</th>
                                <th>Weight</th>
                                <th>ΔE</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRowsHtml}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
};