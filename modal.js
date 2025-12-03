



// Modal dialogs for optimization results

const openModeDetail = (modeName) => {
    const result = lastOptimizationResults[modeName];
    console.log('openModeDetail:', modeName, 'result:', result);
    if (!result) return;
    
    const mode = blendModes.find(m => m.name === modeName);
    if (!mode) return;
    
    let bodyHtml = '';
    
    // Summary section
    bodyHtml += `
        <div class="modal-section">
            <h4>Optimal Blend Color</h4>
            <div class="modal-achievable-row">
                <div class="modal-color-swatch" style="background:${result.blendHex}"></div>
                <div class="modal-achievable-hex">${result.blendHex.toUpperCase()}</div>
                <span class="${getQualityTagClass(result.quality)}">${getQualityLabel(result.quality)}</span>
            </div>
        </div>
        
        <div class="modal-section">
            <h4>Error Statistics</h4>
            <div class="summary-stats">
                <div class="stat-item">
                    <span class="stat-label">Weighted Avg ΔE</span>
                    <span class="stat-value ${getDeltaEClass(result.avgError)}">${result.avgError.toFixed(3)}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Max ΔE</span>
                    <span class="stat-value ${getDeltaEClass(result.maxError)}">${result.maxError.toFixed(3)}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Total Weighted ΔE</span>
                    <span class="stat-value">${result.totalError.toFixed(3)}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Pairs</span>
                    <span class="stat-value">${result.perPairResults.length}</span>
                </div>
            </div>
        </div>
        
        <hr class="modal-separator" />
    `;
    
    // Per-pair results table with expandable rows
    bodyHtml += `
        <div class="modal-section">
            <h4>Per-Pair Results</h4>
            <table class="modal-table">
                <thead>
                    <tr>
                        <th style="width: 30px;"></th>
                        <th>#</th>
                        <th>Source</th>
                        <th>Desired Target</th>
                        <th>Achieved Target</th>
                        <th>Weight</th>
                        <th>ΔE</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    result.perPairResults.forEach((pr, index) => {
        const rowId = `pair-row-${index}`;
        const canvasId = `pair-canvas-${index}`;
        const weight = pr.weight !== undefined ? pr.weight : 1;
        
        // Construct 3D explorer URL for this specific pair
        const explorerUrl = `interactiveBlend.html?source=${encodeURIComponent(pr.source)}&target=${encodeURIComponent(pr.target)}&mode=${encodeURIComponent(mode.name)}`;
        
        bodyHtml += `
            <tr class="pair-data-row" data-row-id="${rowId}">
                <td>
                    <button class="expand-toggle" data-target="${rowId}" title="Show RGB visualization">
                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
                        </svg>
                    </button>
                </td>
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
            <tr class="expandable-row" id="${rowId}">
                <td colspan="7">
                    <div class="pair-plot-container">
                        <canvas id="${canvasId}" class="pair-plot-canvas" width="600" height="250"></canvas>
                        <div class="pair-plot-label">RGB slice: Source (S) → Blend (B) → Achieved Target (T)</div>
                        <div style="text-align: center; margin-top: 16px;">
                            <a href="${explorerUrl}" target="_blank" class="btn-info" style="display: inline-block; text-decoration: none; padding: 6px 12px; font-size: 0.85rem;">
                                Open 3D Explorer for this Pair
                            </a>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    });
    
    bodyHtml += `
                </tbody>
            </table>
        </div>
        
        <hr class="modal-separator" />
        
        <div class="modal-section">
            <h4>Blend Equation</h4>
            <div class="modal-equation">${mode.equation}</div>
        </div>
        
        <hr class="modal-separator" />
    `;
    
    // Quality explanation
    bodyHtml += `
        <div class="modal-section">
            <h4>Delta E Reference</h4>
            <div class="modal-pre">ΔE < 1.0  : Imperceptible difference (Exact)
ΔE < 3.0  : Barely noticeable (Good)
ΔE < 6.0  : Noticeable but acceptable (Approx)
ΔE ≥ 6.0  : Significant mismatch (Poor)</div>
        </div>
    `;
    
    // Set modal content
    let titleSuffix = getQualityLabel(result.quality);
    if (result.quality === 'exact') titleSuffix = 'Exact Match';
    else if (result.quality === 'good') titleSuffix = 'Good Match';
    else if (result.quality === 'approx') titleSuffix = 'Approximate Match';
    else titleSuffix = 'Poor Match';
    
    els.modal.title.textContent = `${mode.name} — ${titleSuffix}`;
    els.modal.body.innerHTML = bodyHtml;
    
    // Set badge
    const badgeClasses = {
        'exact': 'modal-badge modal-badge-exact',
        'good': 'modal-badge modal-badge-good',
        'approx': 'modal-badge modal-badge-clipped',
        'poor': 'modal-badge modal-badge-impossible'
    };
    els.modal.badge.className = badgeClasses[result.quality] || 'modal-badge';
    els.modal.badge.textContent = getQualityLabel(result.quality);
    
    // Add event listeners for expand toggles
    const toggles = els.modal.body.querySelectorAll('.expand-toggle');
    toggles.forEach((toggle, index) => {
        toggle.addEventListener('click', () => {
            const targetId = toggle.dataset.target;
            const expandableRow = document.getElementById(targetId);
            const isExpanded = expandableRow.classList.contains('visible');
            
            if (isExpanded) {
                expandableRow.classList.remove('visible');
                toggle.classList.remove('expanded');
            } else {
                expandableRow.classList.add('visible');
                toggle.classList.add('expanded');
                
                // Draw the RGB plot for this pair (use setTimeout to ensure DOM is fully rendered)
                const pr = result.perPairResults[index];
                const canvasId = `pair-canvas-${index}`;
                
                // Use setTimeout to ensure the row is fully visible before drawing
                setTimeout(() => {
                    const canvas = document.getElementById(canvasId);
                    
                    if (canvas && pr) {
                        const sourceRgb = hexToRgb(pr.source);
                        const achievedRgb = hexToRgb(pr.achieved);
                        
                        if (!sourceRgb || !achievedRgb) return;
                        
                        const sourceNorm = sourceRgb.map(c => c / 255);
                        const achievedNorm = achievedRgb.map(c => c / 255);
                        
                        // Get original target for comparison if different from achieved
                        const targetRgb = hexToRgb(pr.target);
                        const targetNorm = targetRgb ? targetRgb.map(c => c / 255) : achievedNorm;
                        
                        // Check if target differs significantly from achieved
                        const targetDiffers = pr.error > 0.5;
                        
                        // Ensure canvas has proper dimensions before drawing
                        canvas.width = 600;
                        canvas.height = 250;
                        
                        // Make sure blendNorm is an array
                        const blendNorm = Array.isArray(result.blend) ? result.blend : [0.5, 0.5, 0.5];
                        
                        console.log('Drawing RGB plot:', {
                            canvas: canvas,
                            sourceNorm,
                            achievedNorm,
                            blendNorm,
                            sourceHex: pr.source,
                            targetHex: pr.achieved,
                            blendHex: result.blendHex
                        });
                        
                        drawRgbSlicePlot({
                            canvas: canvas,
                            sourceNorm: sourceNorm,
                            targetNorm: achievedNorm,
                            blendNorm: blendNorm,
                            sourceHex: pr.source,
                            targetHex: pr.achieved,
                            blendHex: result.blendHex,
                            originalTargetNorm: targetDiffers ? targetNorm : null,
                            originalTargetHex: targetDiffers ? pr.target : null,
                        });
                    } else {
                        console.log('Canvas or pr not found:', { canvas, pr, canvasId });
                    }
                }, 50);
            }
        });
    });
    
    els.modal.root.classList.remove('hidden');
    els.modal.root.setAttribute('aria-hidden', 'false');
};

const closeModal = () => {
    els.modal.root.classList.add('hidden');
    els.modal.root.setAttribute('aria-hidden', 'true');
};