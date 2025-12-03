




// HSL Tool - Optimize Hue, Saturation, and Lightness adjustments

/**
 * Compute the weighted error for given HSL adjustments across all pairs
 */
const computeHslError = (pairs, hueShift, satAdj, lightAdj) => {
    const perPairResults = [];
    let totalWeightedError = 0;
    let totalWeight = 0;
    let maxError = 0;
    
    for (const pair of pairs) {
        const sRgb = hexToRgb(pair.source);
        const tRgb = hexToRgb(pair.target);
        
        if (!sRgb || !tRgb) continue;
        
        const weight = pair.weight !== undefined ? pair.weight : 1;

        // Apply HSL adjustment to source
        const achievedRgb = applyHslAdjustment(sRgb, hueShift, satAdj, lightAdj);
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
 * Nelder-Mead optimization for HSL parameters
 */
const optimizeHsl = (pairs) => {
    const validPairs = pairs.filter(p => p.source && p.target);
    
    if (validPairs.length === 0) {
        return null;
    }
    
    // Objective function: takes [hue, sat, light] and returns total weighted error
    const objective = (params) => {
        const hue = params[0];
        const sat = params[1];
        const light = params[2];
        const result = computeHslError(validPairs, hue, sat, light);
        return result.totalError;
    };
    
    // Nelder-Mead implementation for 3D
    const nelderMead3D = (fn, initial, options = {}) => {
        const maxIterations = options.maxIterations || 500;
        const tolerance = options.tolerance || 1e-8;
        const alpha = 1.0;  // reflection
        const gamma = 2.0;  // expansion
        const rho = 0.5;    // contraction
        const sigma = 0.5;  // shrink
        
        const n = 3;
        
        // Clamp function for HSL bounds
        const clampParams = (p) => [
            Math.max(-180, Math.min(180, p[0])),   // hue: -180 to 180
            Math.max(-100, Math.min(100, p[1])),   // sat: -100 to 100
            Math.max(-100, Math.min(100, p[2]))    // light: -100 to 100
        ];
        
        // Initialize simplex
        const simplex = [initial.slice()];
        const steps = [30, 20, 20]; // initial step sizes
        
        for (let i = 0; i < n; i++) {
            const vertex = initial.slice();
            vertex[i] = vertex[i] + steps[i];
            simplex.push(clampParams(vertex));
        }
        
        let values = simplex.map(v => fn(v));
        
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
            const reflected = clampParams(centroid.map((c, j) => 
                c + alpha * (c - simplex[n][j])
            ));
            const reflectedValue = fn(reflected);
            
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
            const contracted = clampParams(centroid.map((c, j) => 
                c + rho * (simplex[n][j] - c)
            ));
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
    
    // Try multiple starting points for better coverage
    const startingPoints = [
        [0, 0, 0],           // neutral
        [0, -50, 0],         // desaturate
        [0, 50, 0],          // saturate
        [0, 0, -30],         // darken
        [0, 0, 30],          // lighten
        [60, 0, 0],          // hue shift warm
        [-60, 0, 0],         // hue shift cool
        [120, 0, 0],         // complement-ish
        [-120, 0, 0],        // complement-ish other way
    ];
    
    let bestResult = null;
    let bestValue = Infinity;
    
    for (const start of startingPoints) {
        const result = nelderMead3D(objective, start, {
            maxIterations: 300,
            tolerance: 1e-7
        });
        
        if (result.value < bestValue) {
            bestValue = result.value;
            bestResult = result.solution;
        }
    }
    
    // Round to reasonable precision
    const hue = Math.round(bestResult[0] * 10) / 10;
    const sat = Math.round(bestResult[1] * 10) / 10;
    const light = Math.round(bestResult[2] * 10) / 10;
    
    // Compute final error metrics
    const finalResult = computeHslError(validPairs, hue, sat, light);
    
    // Determine quality
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
        hue,
        saturation: sat,
        lightness: light,
        totalError: finalResult.totalError,
        avgError: finalResult.avgError,
        maxError: finalResult.maxError,
        perPairResults: finalResult.perPairResults,
        quality
    };
};

/**
 * Render the HSL tool result
 */
const renderHslResult = (result) => {
    const container = document.getElementById('hsl-result');
    if (!container) return;
    
    if (!result) {
        container.innerHTML = `
            <div class="multistep-placeholder">
                Select at least one complete Source-Target pair to compute optimal HSL adjustments.
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
    
    container.innerHTML = `
        <div class="hsl-result-content">
            <div class="step-card" style="margin-bottom: 20px;">
                <div class="step-mode">Optimal HSL Adjustments</div>
                <div class="hsl-values">
                    <div class="hsl-value-item">
                        <span class="hsl-label">Hue:</span>
                        <span class="hsl-number">${result.hue > 0 ? '+' : ''}${result.hue}°</span>
                    </div>
                    <div class="hsl-value-item">
                        <span class="hsl-label">Saturation:</span>
                        <span class="hsl-number">${result.saturation > 0 ? '+' : ''}${result.saturation}</span>
                    </div>
                    <div class="hsl-value-item">
                        <span class="hsl-label">Lightness:</span>
                        <span class="hsl-number">${result.lightness > 0 ? '+' : ''}${result.lightness}</span>
                    </div>
                </div>
                <div class="step-error">
                    <span class="${qualityClass}">${qualityLabel}</span>
                    Weighted Avg ΔE: <span class="step-error-value ${getDeltaEClass(result.avgError)}">${result.avgError.toFixed(2)}</span>
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
                        <button class="btn-preview btn-preview-multistep" id="preview-hsl-btn" 
                                data-type="hsl"
                                data-hue="${result.hue}" 
                                data-sat="${result.saturation}" 
                                data-light="${result.lightness}">
                            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            <span>Preview</span>
                            <span class="preview-tooltip">Preview</span>
                        </button>
                        <button class="btn-export btn-export-multistep" id="export-hsl-btn" 
                                data-hue="${result.hue}" 
                                data-sat="${result.saturation}" 
                                data-light="${result.lightness}">
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