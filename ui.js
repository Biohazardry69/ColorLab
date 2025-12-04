









// UI rendering functions (pickers, history, calculations)

// Check if EyeDropper API is available
const hasEyeDropper = 'EyeDropper' in window;

// Render a single pair card
const renderPairCard = (pair, index) => {
    const canRemove = state.pairs.length > 1;
    
    return `
        <div class="pair-card" data-pair-id="${pair.id}">
            <div class="pair-header">
                <span class="pair-label">Pair ${index + 1}</span>
                ${canRemove ? `
                    <button class="btn-remove-pair" data-pair-id="${pair.id}" title="Remove this pair">
                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                ` : ''}
            </div>
            <div class="pair-content">
                ${hasEyeDropper ? `
                    <button class="btn-eyedropper" data-pair-id="${pair.id}" data-color-type="source" title="Pick from screen">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/>
                        </svg>
                    </button>
                ` : ''}
                
                <div class="color-picker-mini">
                    <h3>Source</h3>
                    <div class="mini-preview-container">
                        <input type="color" 
                               class="pair-color-input" 
                               data-pair-id="${pair.id}" 
                               data-color-type="source"
                               value="${pair.source || '#808080'}"
                               title="Click to pick a color">
                        <div class="mini-preview-color" style="background-color: ${pair.source || 'var(--history-swatch-bg)'}"></div>
                    </div>
                    <button class="mini-hex-btn hex-code" data-pair-id="${pair.id}" data-color-type="source">${pair.source || '#------'}</button>
                </div>
                
                <div class="pair-controls-center">
                    <button class="btn-swap-pair" data-pair-id="${pair.id}" title="Swap source and target">
                        <svg viewBox="0 0 24 24">
                            <path d="M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z"/>
                        </svg>
                    </button>
                    
                    <div class="weight-control">
                        <label for="weight-${pair.id}">Weight</label>
                        <input type="number" id="weight-${pair.id}" class="pair-weight-input" data-pair-id="${pair.id}" value="${pair.weight || 1}" min="0" step="0.1">
                    </div>
                </div>
                
                <div class="color-picker-mini">
                    <h3>Target</h3>
                    <div class="mini-preview-container">
                        <input type="color" 
                               class="pair-color-input" 
                               data-pair-id="${pair.id}" 
                               data-color-type="target"
                               value="${pair.target || '#808080'}"
                               title="Click to pick a color">
                        <div class="mini-preview-color" style="background-color: ${pair.target || 'var(--history-swatch-bg)'}"></div>
                    </div>
                    <button class="mini-hex-btn hex-code" data-pair-id="${pair.id}" data-color-type="target">${pair.target || '#------'}</button>
                </div>
                
                ${hasEyeDropper ? `
                    <button class="btn-eyedropper" data-pair-id="${pair.id}" data-color-type="target" title="Pick from screen">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/>
                        </svg>
                    </button>
                ` : ''}
            </div>
        </div>
    `;
};

// Render all pairs
const renderPairs = () => {
    if (!els || !els.pairsContainer) return;
    
    const pairsHtml = state.pairs.map((pair, index) => renderPairCard(pair, index)).join('');
    els.pairsContainer.innerHTML = pairsHtml;
};

// Update URL with all pairs (including weights)
const updateURL = () => {
    const params = new URLSearchParams();
    
    const validPairs = state.pairs.filter(p => p.source || p.target);
    if (validPairs.length > 0) {
        // format: source,target,weight
        const pairsStr = validPairs.map(p => {
            const s = p.source || '';
            const t = p.target || '';
            const w = p.weight !== undefined ? p.weight : 1;
            // Omit weight if it is 1 (cleaner URL for default case)
            if (w === 1) return `${s},${t}`;
            return `${s},${t},${w}`;
        }).join(';');
        params.set('pairs', pairsStr);
    }
    
    try {
        const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
        window.history.replaceState({}, '', newUrl);
    } catch (e) {
        console.warn('Could not update URL history:', e);
    }
};

// Parse URL and restore pairs
const parseURLPairs = () => {
    const params = new URLSearchParams(window.location.search);
    const pairsStr = params.get('pairs');
    
    if (pairsStr) {
        const pairParts = pairsStr.split(';');
        const parsedPairs = [];
        
        for (const part of pairParts) {
            const [source, target, weight] = part.split(',');
            const pair = { id: nextPairId++, source: null, target: null, weight: 1 };
            
            if (source && /^#[0-9a-fA-F]{6}$/i.test(source)) {
                pair.source = source.toLowerCase();
            }
            if (target && /^#[0-9a-fA-F]{6}$/i.test(target)) {
                pair.target = target.toLowerCase();
            }
            if (weight && !isNaN(parseFloat(weight))) {
                pair.weight = parseFloat(weight);
            }
            
            if (pair.source || pair.target) {
                parsedPairs.push(pair);
            }
        }
        
        if (parsedPairs.length > 0) {
            state.pairs = parsedPairs;
        }
    }
    
    // Legacy support for old URL format
    const sourceParam = params.get('source');
    const targetParam = params.get('target');
    
    if ((sourceParam || targetParam) && state.pairs.length === 1 && !state.pairs[0].source && !state.pairs[0].target) {
        if (sourceParam && /^#[0-9a-fA-F]{6}$/i.test(sourceParam)) {
            state.pairs[0].source = sourceParam.toLowerCase();
        }
        if (targetParam && /^#[0-9a-fA-F]{6}$/i.test(targetParam)) {
            state.pairs[0].target = targetParam.toLowerCase();
        }
    }
};

// Set color for a specific pair (with optional debounced calculation)
const setPairColor = (pairId, colorType, hex, immediate = false) => {
    const pair = getPairById(pairId);
    if (!pair) return;
    
    pair[colorType] = hex;
    
    // Update the UI for this specific pair (always immediate)
    const card = document.querySelector(`.pair-card[data-pair-id="${pairId}"]`);
    if (card) {
        // Find both picker containers (source is 0, target is 1)
        const pickers = card.querySelectorAll('.color-picker-mini');
        const index = colorType === 'source' ? 0 : 1;
        
        if (pickers[index]) {
            const preview = pickers[index].querySelector('.mini-preview-color');
            if (preview) preview.style.backgroundColor = hex;
        }
        
        const hexBtn = card.querySelector(`.mini-hex-btn[data-color-type="${colorType}"]`);
        if (hexBtn) hexBtn.textContent = hex;
    }
    
    // Use debounced calculations during dragging, immediate for final change
    if (immediate || typeof debouncedUpdateCalculations === 'undefined') {
        updateCalculations();
    } else {
        debouncedUpdateCalculations();
    }
    updateURL();
};

// Get quality tag class
const getQualityTagClass = (quality) => {
    switch (quality) {
        case 'exact': return 'tag-exact';
        case 'good': return 'tag-good';
        case 'approx': return 'tag-approx';
        case 'poor': return 'tag-poor';
        default: return 'tag-approx';
    }
};

// Store optimization results for modal access
let lastOptimizationResults = {};

// Update calculations using optimizer
const updateCalculations = () => {
    if (!els) return;
    
    // Reset multi-step state when colors change
    multiStepState.topSolutions = [];
    multiStepState.activeTab = 0;
    multiStepState.result = null;
    renderMultiStepResult(null);
    
    const validPairs = getValidPairs();

    // Update HSL tool
    if (validPairs.length > 0 && typeof optimizeHsl === 'function') {
        const hslResult = optimizeHsl(validPairs);
        renderHslResult(hslResult);
    } else if (typeof renderHslResult === 'function') {
        renderHslResult(null);
    }

    // Update Levels tool
    if (validPairs.length > 0 && typeof optimizeLevels === 'function') {
        const levelsResult = optimizeLevels(validPairs);
        renderLevelsResult(levelsResult);
    } else if (typeof renderLevelsResult === 'function') {
        renderLevelsResult(null);
    }

    // Ensure compute button resets back to "Compute Optimal Chain" on any color change
    if (window.resetMultiStepState) {
        try { window.resetMultiStepState(); } catch (e) {}
    }
    
    if (validPairs.length === 0) {
        els.results.placeholder.style.display = 'block';
        els.results.table.style.display = 'none';
        return;
    }
    
    els.results.placeholder.style.display = 'none';
    els.results.table.style.display = 'table';
    els.results.body.innerHTML = '';
    
    lastOptimizationResults = {};
    
    blendModes.forEach((mode) => {
        const result = optimizeBlend(mode, validPairs);
        
        if (!result) return;
        
        // Store for modal access
        lastOptimizationResults[mode.name] = result;
        
        const row = document.createElement('tr');
        
        // Mode name cell
        const modeCell = document.createElement('td');
        modeCell.textContent = mode.name;
        row.appendChild(modeCell);
        
        // Color swatch + quality badge cell
        const colorCell = document.createElement('td');
        const flex = document.createElement('div');
        flex.className = 'flex-cell';
        
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.backgroundColor = result.blendHex;
        flex.appendChild(swatch);
        
        const qualityTag = document.createElement('span');
        qualityTag.className = getQualityTagClass(result.quality);
        qualityTag.textContent = getQualityLabel(result.quality);
        qualityTag.dataset.modeName = mode.name;
        qualityTag.dataset.quality = result.quality;
        flex.appendChild(qualityTag);
        
        colorCell.appendChild(flex);
        row.appendChild(colorCell);
        
        // Hex code cell
        const hexCell = document.createElement('td');
        const hexBtn = document.createElement('button');
        hexBtn.className = 'btn-hex-small hex-code';
        hexBtn.textContent = result.blendHex;
        hexCell.appendChild(hexBtn);
        row.appendChild(hexCell);
        
        // Avg ΔE cell
        const deltaCell = document.createElement('td');
        deltaCell.innerHTML = `<span class=\"delta-e-value delta-e-${result.quality}\">${result.avgError.toFixed(2)}</span>`;
        row.appendChild(deltaCell);
        
        // Preview cell
        const previewCell = document.createElement('td');
        const previewBtn = document.createElement('button');
        previewBtn.className = 'btn-preview';
        previewBtn.dataset.mode = mode.name;
        previewBtn.dataset.blendHex = result.blendHex;
        previewBtn.dataset.type = 'simple';
        // Store blend norm for preview calculation
        previewBtn.dataset.blendR = result.blend[0];
        previewBtn.dataset.blendG = result.blend[1];
        previewBtn.dataset.blendB = result.blend[2];
        
        previewBtn.innerHTML = `
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span class="preview-tooltip">Preview</span>
        `;
        previewCell.appendChild(previewBtn);
        row.appendChild(previewCell);

        // Export cell
        const exportCell = document.createElement('td');
        const exportBtn = document.createElement('button');
        exportBtn.className = 'btn-export';
        exportBtn.dataset.mode = mode.name;
        exportBtn.dataset.blendHex = result.blendHex;
        exportBtn.innerHTML = `
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/>
            </svg>
            <span class="export-tooltip">Export Script</span>
        `;
        exportCell.appendChild(exportBtn);
        row.appendChild(exportCell);
        
        els.results.body.appendChild(row);
    });
};

// Global color history rendering
const renderGlobalHistory = () => {
    const container = document.getElementById('history-grid');
    if (!container) return;
    
    const list = historyState.colors;
    
    if (!list || list.length === 0) {
        container.innerHTML = '<div class="history-empty">No colors yet. Pick some colors to build your history.</div>';
        return;
    }
    
    container.innerHTML = list.map(hex => `
        <div class="history-swatch-large" 
             style="background-color: ${hex}" 
             data-color="${hex}" 
             title="${hex.toUpperCase()}">
        </div>
    `).join('');
};

const pushToHistory = (hex) => {
    if (!/^#[0-9a-fA-F]{6}$/i.test(hex)) return;
    hex = hex.toLowerCase();
    
    const list = historyState.colors;
    
    // Don't add if it's already the most recent
    if (list[0] === hex) return;
    
    // Remove if it exists elsewhere
    const existingIndex = list.indexOf(hex);
    if (existingIndex !== -1) list.splice(existingIndex, 1);
    
    // Add to front
    list.unshift(hex);
    
    // Trim to max
    if (list.length > historyState.max) list.length = historyState.max;
    
    renderGlobalHistory();
};

// Swap colors for a pair
const swapPairColors = (pairId) => {
    const pair = getPairById(pairId);
    if (!pair) return;
    
    const temp = pair.source;
    pair.source = pair.target;
    pair.target = temp;
    
    // Re-render just this pair card
    renderPairs();
    updateCalculations();
    updateURL();
};

// Render a single step in the multi-step result
const renderStepCard = (step, index, isLast) => {
    const errorClass = step.stepError < 1 ? 'delta-e-exact' : 
                       step.stepError < 3 ? 'delta-e-good' : 
                       step.stepError < 6 ? 'delta-e-approx' : 'delta-e-poor';
    
    // Opacity display logic
    let opacityDisplay = '';
    if (step.opacity !== undefined && step.opacity < 1) {
        const opacityPercent = Math.round(step.opacity * 100);
        opacityDisplay = `<span class="step-opacity"> @ ${opacityPercent}% Opacity</span>`;
    }

    let blendContent = '';
    if (step.modeName === "Hue/Saturation" && step.hslValues) {
        // Special rendering for HSL
        blendContent = `
            <div style="display:flex; gap:12px; font-size:0.8rem; background:var(--btn-bg); padding:4px 8px; border-radius:6px; border:1px solid var(--border-color);">
                <span>H: <b>${step.hslValues.h > 0 ? '+' : ''}${step.hslValues.h}°</b></span>
                <span>S: <b>${step.hslValues.s > 0 ? '+' : ''}${step.hslValues.s}</b></span>
                <span>L: <b>${step.hslValues.l > 0 ? '+' : ''}${step.hslValues.l}</b></span>
            </div>
        `;
    } else if (step.modeName === "Levels" && step.levelsValues) {
        // Special rendering for Levels
        const lv = step.levelsValues;
        blendContent = `
            <div style="display:flex; flex-direction:column; gap:4px; font-size:0.8rem; background:var(--btn-bg); padding:4px 8px; border-radius:6px; border:1px solid var(--border-color);">
                <div style="display:flex; gap:8px;">
                    <span>In: <b>${lv.inputBlack}</b>/<b>${lv.inputGamma}</b>/<b>${lv.inputWhite}</b></span>
                </div>
                <div style="display:flex; gap:8px;">
                    <span>Out: <b>${lv.outputBlack}</b>/<b>${lv.outputWhite}</b></span>
                </div>
            </div>
        `;
    } else {
        // Standard blend mode rendering
        blendContent = `
            <div class="step-blend-swatch" style="background-color: ${step.blendHex}"></div>
            <span class="step-blend-hex btn-hex-small hex-code" style="font-size: 0.9rem;">${step.blendHex}</span>
        `;
    }
    
    let html = `
        <div class="step-card">
            <div class="step-number">Step ${index + 1}</div>
            <div class="step-mode">${step.modeName}</div>
            <div class="step-blend">
                ${blendContent}
                ${opacityDisplay}
            </div>
            <div class="step-error">
                Weighted Avg ΔE: <span class="step-error-value ${errorClass}">${step.stepError.toFixed(2)}</span>
            </div>
        </div>
    `;
    
    if (!isLast) {
        html += `
            <div class="step-arrow">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"/>
                </svg>
            </div>
        `;
    }
    
    return html;
};

// Get error color class for tabs
const getErrorColorClass = (avgError) => {
    if (avgError < 1) return 'error-exact';
    if (avgError < 3) return 'error-good';
    if (avgError < 6) return 'error-approx';
    return 'error-poor';
};

// Render solution tabs
const renderSolutionTabs = (solutions, activeIndex) => {
    if (!solutions || solutions.length === 0) return '';
    
    return `
        <div class="solution-tabs">
            ${solutions.map((sol, i) => `
                <button class="solution-tab ${i === activeIndex ? 'active' : ''}" data-solution-index="${i}">
                    <span class="tab-rank">#${i + 1}</span>
                    <span class="tab-error ${getErrorColorClass(sol.avgError)}">${sol.avgError.toFixed(2)}</span>
                </button>
            `).join('')}
        </div>
    `;
};

// Render multi-step optimization result with tabs for multiple solutions
const renderMultiStepResult = (topSolutions, activeIndex = 0) => {
    const container = document.getElementById('multistep-result');
    if (!container) return;
    
    // Handle null/empty or legacy single result
    if (!topSolutions || (Array.isArray(topSolutions) && topSolutions.length === 0)) {
        container.innerHTML = `
            <div class="multistep-placeholder">
                Select at least one complete Source-Target pair, then click "Compute Optimal Chain" to find the best multi-step solution.
            </div>
        `;
        return;
    }
    
    // Convert single result to array for backwards compatibility
    const solutions = Array.isArray(topSolutions) ? topSolutions : [topSolutions];
    const result = solutions[activeIndex] || solutions[0];
    
    if (!result) {
        container.innerHTML = `
            <div class="multistep-placeholder">
                Select at least one complete Source-Target pair, then click "Compute Optimal Chain" to find the best multi-step solution.
            </div>
        `;
        return;
    }
    
    const improvementClass = result.improvement > 0 ? 'improvement' : 'no-improvement';
    const improvementText = result.improvement > 0 
        ? `+${result.improvement.toFixed(1)}% better` 
        : 'No improvement';
    
    // Render tabs if we have multiple solutions
    const tabsHtml = solutions.length > 1 ? renderSolutionTabs(solutions, activeIndex) : '';
    
    let stepsHtml = '<div class="steps-container">';
    result.steps.forEach((step, i) => {
        stepsHtml += renderStepCard(step, i, i === result.steps.length - 1);
    });
    stepsHtml += '</div>';

    // Generate breakdown rows
    let tableRowsHtml = '';
    if (result.perPairResults) {
        tableRowsHtml = result.perPairResults.map((pr, index) => {
            const intermediatesHtml = pr.intermediates.map((hex, i) => {
                const isLast = i === pr.intermediates.length - 1;
                // Clean hex for color (remove @ portion if exists)
                const cleanHex = hex.split(' @')[0];
                return `
                    <div class="intermediate-colors">
                        <div class="intermediate-swatch" style="background-color: ${cleanHex}" title="${hex}"></div>
                        <span class="modal-hex-small">${cleanHex.toUpperCase()}</span>
                        ${!isLast ? '<span class="intermediate-arrow">→</span>' : ''}
                    </div>
                `;
            }).join('');
            
            const weight = pr.weight !== undefined ? pr.weight : 1;

            return `
                <tr>
                    <td>${index + 1}</td>
                    <td>
                        <span class="modal-swatch-small" style="background:${pr.source}"></span>
                        <span class="modal-hex-small">${pr.source.toUpperCase()}</span>
                    </td>
                    <td>
                        <div class="intermediate-colors">
                            ${intermediatesHtml}
                        </div>
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
        }).join('');
    }
    
    container.innerHTML = `
        <div class="multistep-result">
            ${tabsHtml}
            ${stepsHtml}
            
            <div class="multistep-summary">
                <div class="multistep-summary-title">Final Results</div>
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
                        <div class="multistep-stat-label">Improvement</div>
                        <div class="multistep-stat-value ${improvementClass}">${improvementText}</div>
                    </div>
                    <div class="multistep-stat" style="display:flex; flex-direction:row; gap:8px; align-items:center;">
                        <button class="btn-preview btn-preview-multistep" id="preview-multistep-btn" data-type="multistep">
                            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            <span>Preview</span>
                            <span class="preview-tooltip">Preview</span>
                        </button>
                        <button class="btn-export btn-export-multistep" id="export-multistep-btn">
                            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/>
                            </svg>
                            <span>Export</span>
                            <span class="export-tooltip">Export Script</span>
                        </button>
                    </div>
                </div>
                <div class="multistep-comparison">
                    Best single mode: <strong>${result.singleBestMode}</strong> (Avg ΔE: ${result.singleBestError.toFixed(3)})
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
                                <th>Intermediates</th>
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

// Helper to get Delta E CSS class
const getDeltaEClass = (error) => {
    if (error < 1.0) return 'delta-e-exact';
    if (error < 3.0) return 'delta-e-good';
    if (error < 6.0) return 'delta-e-approx';
    return 'delta-e-poor';
};