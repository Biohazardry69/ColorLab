







// Main app initialization and event wiring

// Track if we've done an initial run (to show re-run button) - declared early for debounce access
let hasCompletedFirstRun = false;

// Debounce utility function
const debounce = (fn, delay) => {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
};

// Update button text based on state
const updateComputeButtonText = (isComputing, isRerun) => {
    if (isComputing) {
        computeBtn.innerHTML = `
            <div class="spinner"></div>
            Cancel
        `;
    } else if (isRerun) {
        computeBtn.innerHTML = `
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 18px; height: 18px;">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            Re-Run Optimization (Extensive)
        `;
    } else {
        computeBtn.innerHTML = `
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 18px; height: 18px;">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
            Compute Optimal Chain
        `;
    }
};

// Render progress indicator (persists outside results container)
const renderProgress = (progress) => {
    if (!progress || progress.phase === 'done') {
        const progressEl = document.getElementById('multistep-progress');
        if (progressEl) progressEl.remove();
        return;
    }
    
    let progressEl = document.getElementById('multistep-progress');
    if (!progressEl) {
        progressEl = document.createElement('div');
        progressEl.id = 'multistep-progress';
        progressEl.className = 'multistep-progress';
        
        // Insert BEFORE the result container so it doesn't get wiped when results update
        const card = document.querySelector('.card-multistep');
        const resultContainer = document.getElementById('multistep-result');
        if (card && resultContainer) {
            card.insertBefore(progressEl, resultContainer);
        } else if (resultContainer && resultContainer.parentNode) {
            // Fallback
            resultContainer.parentNode.insertBefore(progressEl, resultContainer);
        }
    }
    
    const percent = progress.total ? Math.round((progress.current / progress.total) * 100) : 0;
    
    progressEl.innerHTML = `
        <div class="progress-bar-container">
            <div class="progress-bar" style="width: ${percent}%"></div>
        </div>
        <div class="progress-text">${progress.message || 'Computing...'}</div>
        ${progress.currentSequence ? `<div class="progress-sequence">${progress.currentSequence.join(' → ')}</div>` : ''}
    `;
};

// Expose a safe reset hook for UI updates when colors change
window.resetMultiStepState = () => {
    // Reset first-run flag so button shows "Compute Optimal Chain"
    hasCompletedFirstRun = false;
    // Reset computing state
    if (typeof multiStepState !== 'undefined') {
        multiStepState.computing = false;
    }
    // Update button text if available
    try {
        updateComputeButtonText(false, false);
    } catch (e) {
        // In very early init, computeBtn may not be ready yet; ignore.
    }
};

// Debounced version of updateCalculations
window.debouncedUpdateCalculations = debounce(() => {
    updateCalculations();
    // Reset compute button when colors change
    hasCompletedFirstRun = false;
    
    // Reset multi-step state completely
    if (typeof multiStepState !== 'undefined') {
        multiStepState.topSolutions = [];
        multiStepState.activeTab = 0;
        multiStepState.result = null;
    }
    
    if (typeof updateComputeButtonText === 'function') {
        updateComputeButtonText(false, false);
    }
}, 150);

// Initialize DOM references
rebuildEls();

// Parse URL and restore state
parseURLPairs();

// Render initial pairs
renderPairs();

// Render initial history
renderGlobalHistory();

// Initial calculation
updateCalculations();

// EyeDropper instance (if supported)
let eyeDropper = null;
if ('EyeDropper' in window) {
    eyeDropper = new EyeDropper();
}

// Pick color from screen using EyeDropper API
const pickColorFromScreen = async (pairId, colorType, button) => {
    if (!eyeDropper) return;
    
    try {
        button.disabled = true;
        const result = await eyeDropper.open();
        const hex = result.sRGBHex.toLowerCase();
        
        setPairColor(pairId, colorType, hex, true);  // immediate=true for eyedropper
        pushToHistory(hex);
        
        // Update the color input value
        const card = document.querySelector(`.pair-card[data-pair-id="${pairId}"]`);
        if (card) {
            const input = card.querySelector(`.pair-color-input[data-color-type="${colorType}"]`);
            if (input) input.value = hex;
        }
    } catch (e) {
        // User cancelled
        console.log('EyeDropper was cancelled.');
    } finally {
        button.disabled = false;
    }
};

// Track the currently selected pair/type for history click
let selectedTarget = null;

// Event delegation for pair interactions
document.body.addEventListener('click', async (event) => {
    // Main Tabs switching
    const mainTab = event.target.closest('.main-tab');
    if (mainTab) {
        const targetId = mainTab.dataset.tab;
        
        // Update tab buttons
        document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
        mainTab.classList.add('active');
        
        // Update tab content
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`tab-${targetId}`).classList.add('active');
        return;
    }
    
    // Pairs Tabs switching (Manual / Extract)
    const pairsTab = event.target.closest('.pairs-tab');
    if (pairsTab) {
        const targetId = pairsTab.dataset.pairsTab;
        
        // Update tab buttons
        document.querySelectorAll('.pairs-tab').forEach(t => t.classList.remove('active'));
        pairsTab.classList.add('active');
        
        // Update tab content
        document.querySelectorAll('.pairs-tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`pairs-tab-${targetId}`).classList.add('active');
        return;
    }

    // Remove pair button
    const removeBtn = event.target.closest('.btn-remove-pair');
    if (removeBtn) {
        const pairId = parseInt(removeBtn.dataset.pairId);
        if (removePair(pairId)) {
            renderPairs();
            updateCalculations();
            updateURL();
        }
        return;
    }
    
    // Add pair button
    if (event.target.closest('#add-pair-btn')) {
        addPair();
        renderPairs();
        updateURL();
        return;
    }
    
    // Swap pair button
    const swapBtn = event.target.closest('.btn-swap-pair');
    if (swapBtn) {
        const pairId = parseInt(swapBtn.dataset.pairId);
        swapPairColors(pairId);
        return;
    }
    
    // Eyedropper button
    const eyedropperBtn = event.target.closest('.btn-eyedropper');
    if (eyedropperBtn) {
        const pairId = parseInt(eyedropperBtn.dataset.pairId);
        const colorType = eyedropperBtn.dataset.colorType;
        await pickColorFromScreen(pairId, colorType, eyedropperBtn);
        return;
    }
    
    // History swatch click - apply to last focused input
    const historySwatch = event.target.closest('.history-swatch-large');
    if (historySwatch) {
        const hex = historySwatch.dataset.color;
        if (hex && selectedTarget) {
            setPairColor(selectedTarget.pairId, selectedTarget.colorType, hex, true);  // immediate=true for history
            
            // Update the color input value
            const card = document.querySelector(`.pair-card[data-pair-id="${selectedTarget.pairId}"]`);
            if (card) {
                const input = card.querySelector(`.pair-color-input[data-color-type="${selectedTarget.colorType}"]`);
                if (input) input.value = hex;
            }
        }
        return;
    }
    
    // Hex code copy
    const hexBtn = event.target.closest('.hex-code');
    if (hexBtn) {
        const text = hexBtn.textContent.trim();
        if (text.startsWith('#')) {
            try {
                await navigator.clipboard.writeText(text);
                const originalText = hexBtn.textContent;
                hexBtn.textContent = 'Copied!';
                hexBtn.classList.add('copied');
                setTimeout(() => {
                    hexBtn.textContent = originalText;
                    hexBtn.classList.remove('copied');
                }, 1500);
            } catch (err) {
                console.error('Failed to copy:', err);
            }
        }
        return;
    }
    
    // Quality tag click - open modal
    const qualityTag = event.target.closest('.tag-exact, .tag-good, .tag-approx, .tag-poor');
    if (qualityTag && qualityTag.dataset.modeName) {
        openModeDetail(qualityTag.dataset.modeName);
        return;
    }
});

// Color input changes
document.body.addEventListener('input', (event) => {
    const colorInput = event.target.closest('.pair-color-input');
    if (colorInput) {
        const pairId = parseInt(colorInput.dataset.pairId);
        const colorType = colorInput.dataset.colorType;
        setPairColor(pairId, colorType, colorInput.value);
    }
    
    // Weight input changes
    const weightInput = event.target.closest('.pair-weight-input');
    if (weightInput) {
        const pairId = parseInt(weightInput.dataset.pairId);
        const pair = getPairById(pairId);
        if (pair) {
            pair.weight = parseFloat(weightInput.value) || 0;
            updateCalculations();
            updateURL();
        }
    }
});

// Track focus on color inputs for history application
document.body.addEventListener('focus', (event) => {
    const colorInput = event.target.closest('.pair-color-input');
    if (colorInput) {
        selectedTarget = {
            pairId: parseInt(colorInput.dataset.pairId),
            colorType: colorInput.dataset.colorType
        };
    }
}, true);

// Commit to history on change (when color picker closes)
document.body.addEventListener('change', (event) => {
    const colorInput = event.target.closest('.pair-color-input');
    if (colorInput) {
        pushToHistory(colorInput.value);
    }
});

// Modal event listeners
els.modal.close.addEventListener('click', closeModal);
els.modal.root.addEventListener('click', (e) => {
    if (e.target === els.modal.root) closeModal();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});

// Theme Toggle Logic
const themeBtn = document.getElementById('theme-toggle');
const iconSun = document.getElementById('icon-sun');
const iconMoon = document.getElementById('icon-moon');
const htmlEl = document.documentElement;

// Check system preference
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
let isDark = prefersDark;

const applyTheme = (dark) => {
    if (dark) {
        htmlEl.setAttribute('data-theme', 'dark');
        iconSun.classList.remove('hidden');
        iconMoon.classList.add('hidden');
    } else {
        htmlEl.removeAttribute('data-theme');
        iconSun.classList.add('hidden');
        iconMoon.classList.remove('hidden');
    }
    isDark = dark;
};

// Initialize theme
applyTheme(isDark);

themeBtn.addEventListener('click', () => {
    applyTheme(!isDark);
});

// Multi-step optimization
const numStepsInput = document.getElementById('num-steps');
const computeBtn = document.getElementById('compute-multistep');
const multistepResultContainer = document.getElementById('multistep-result');
const allowHslInput = document.getElementById('allow-hsl');

// Reset state when number of steps changes
numStepsInput.addEventListener('change', () => {
    if (window.resetMultiStepState) {
        window.resetMultiStepState();
    }
});

// Reset state when opacity settings change
const minOpacityInput = document.getElementById('min-opacity');
const maxOpacityInput = document.getElementById('max-opacity');

minOpacityInput.addEventListener('change', () => {
    // Ensure min doesn't exceed max
    if (parseInt(minOpacityInput.value) > parseInt(maxOpacityInput.value)) {
        minOpacityInput.value = maxOpacityInput.value;
    }
    if (window.resetMultiStepState) {
        window.resetMultiStepState();
    }
});

maxOpacityInput.addEventListener('change', () => {
    // Ensure max doesn't go below min
    if (parseInt(maxOpacityInput.value) < parseInt(minOpacityInput.value)) {
        maxOpacityInput.value = minOpacityInput.value;
    }
    if (window.resetMultiStepState) {
        window.resetMultiStepState();
    }
});

allowHslInput.addEventListener('change', () => {
    if (window.resetMultiStepState) {
        window.resetMultiStepState();
    }
});

// Render initial multi-step placeholder
renderMultiStepResult(null);

// Helper to merge and update top solutions (keeps best 6 unique sequences)
const updateTopSolutions = (newSolutions, existingSolutions = []) => {
    const MAX_SOLUTIONS = 6;
    const all = [...existingSolutions];
    
    for (const sol of newSolutions) {
        // Check if this sequence already exists
        const seqKey = sol.steps.map(s => {
             if (s.hslValues) return `${s.modeName}:${s.hslValues.h},${s.hslValues.s},${s.hslValues.l}`;
             return s.modeName + ':' + s.blendHex;
        }).join('|');

        const existingIdx = all.findIndex(s => 
             s.steps.map(st => {
                 if (st.hslValues) return `${st.modeName}:${st.hslValues.h},${st.hslValues.s},${st.hslValues.l}`;
                 return st.modeName + ':' + st.blendHex;
             }).join('|') === seqKey
        );
        
        if (existingIdx >= 0) {
            // Replace if better
            if (sol.avgError < all[existingIdx].avgError) {
                all[existingIdx] = sol;
            }
        } else {
            all.push(sol);
        }
    }
    
    // Sort by avgError and keep top N
    all.sort((a, b) => a.avgError - b.avgError);
    return all.slice(0, MAX_SOLUTIONS);
};

computeBtn.addEventListener('click', async () => {
    // If already computing, cancel
    if (multiStepState.computing) {
        cancelMultiStepOptimization();
        multiStepState.computing = false;
        computeBtn.classList.remove('computing');
        updateComputeButtonText(false, hasCompletedFirstRun);
        // Don't remove progress on cancel, user might want to see what happened
        return;
    }
    
    const validPairs = getValidPairs();
    
    if (validPairs.length === 0) {
        alert('Please select at least one complete Source-Target color pair.');
        return;
    }
    
    const numSteps = parseInt(numStepsInput.value) || 2;
    const minOpacity = parseInt(minOpacityInput.value) || 10;
    const maxOpacity = parseInt(maxOpacityInput.value) || 100;
    const allowHsl = allowHslInput.checked;
    
    // Store in state for reference
    multiStepState.numSteps = numSteps;
    multiStepState.minOpacity = minOpacity;
    multiStepState.maxOpacity = maxOpacity;
    
    // Determine if this is a re-run (extensive mode)
    const isExtensive = hasCompletedFirstRun;
    
    // Show computing state
    multiStepState.computing = true;
    computeBtn.classList.add('computing');
    updateComputeButtonText(true, false);
    
    // For first run, clear previous results. For re-run, keep them and try to improve
    // (Logic removed: we now KEEP history always, merging new results in)
    
    renderProgress({ phase: 'starting', message: isExtensive ? 'Starting EXTENSIVE optimization...' : 'Starting optimization...' });
    
    try {
        const result = await startMultiStepOptimization(validPairs, numSteps, {
            onProgress: (progress) => {
                renderProgress(progress);
            },
            onBestFound: (currentTopSolutions) => {
                // Update state with the latest list from optimizer
                // Ensure we're working with an array
                const solutions = Array.isArray(currentTopSolutions) ? currentTopSolutions : [currentTopSolutions];
                
                // Merge with existing (though optimizer handles this, we do it for safety or across runs)
                multiStepState.topSolutions = updateTopSolutions(solutions, multiStepState.topSolutions);
                multiStepState.result = multiStepState.topSolutions[0];
                renderMultiStepResult(multiStepState.topSolutions, multiStepState.activeTab);
            }
        }, {
            extensive: isExtensive,
            existingBest: isExtensive && multiStepState.topSolutions.length > 0 ? multiStepState.topSolutions[0] : null,
            minOpacity: minOpacity,
            maxOpacity: maxOpacity,
            allowHsl: allowHsl
        });
        
        if (result) {
            const solutions = Array.isArray(result) ? result : [result];
            multiStepState.topSolutions = updateTopSolutions(solutions, multiStepState.topSolutions);
            multiStepState.result = multiStepState.topSolutions[0];
            renderMultiStepResult(multiStepState.topSolutions, multiStepState.activeTab);
        }
        
        // Mark that we've completed at least one run, ONLY if we found something
        if (multiStepState.topSolutions.length > 0) {
             hasCompletedFirstRun = true;
        }
    } catch (error) {
        console.error('Multi-step optimization failed:', error);
        alert('Optimization failed. See console for details.');
    } finally {
        multiStepState.computing = false;
        computeBtn.classList.remove('computing');
        updateComputeButtonText(false, hasCompletedFirstRun);
        // Don't clear progress on completion/error so user can see status
        // renderProgress(null);
    }
});

// Handle solution tab clicks and breakdown button (delegated)
document.body.addEventListener('click', async (e) => {
    // Tab click
    const tabBtn = e.target.closest('.solution-tab');
    if (tabBtn) {
        const index = parseInt(tabBtn.dataset.solutionIndex);
        if (!isNaN(index) && multiStepState.topSolutions[index]) {
            multiStepState.activeTab = index;
            renderMultiStepResult(multiStepState.topSolutions, index);
        }
        return;
    }
    
    // Export button click (Simple Blend)
    const exportBtn = e.target.closest('.btn-export[data-mode]');
    if (exportBtn) {
        const modeName = exportBtn.dataset.mode;
        const blendHex = exportBtn.dataset.blendHex;
        
        if (modeName && blendHex) {
            const layers = [{
                hex: blendHex,
                modeName: modeName,
                name: `${modeName} ${blendHex.toUpperCase()}`
            }];
            
            const script = generatePhotopeaScript(layers);
            
            try {
                await navigator.clipboard.writeText(script);
                
                // Show feedback
                const tooltip = exportBtn.querySelector('.export-tooltip');
                if (tooltip) {
                    const originalText = tooltip.textContent;
                    tooltip.textContent = 'Copied!';
                    exportBtn.classList.add('copied');
                    setTimeout(() => {
                        tooltip.textContent = originalText;
                        exportBtn.classList.remove('copied');
                    }, 1500);
                }
            } catch (err) {
                console.error('Failed to copy script:', err);
                alert('Failed to copy script to clipboard.');
            }
        }
        return;
    }
    
    // Export button click (Multi-Step)
    const exportMultistepBtn = e.target.closest('#export-multistep-btn');
    if (exportMultistepBtn) {
        const activeResult = multiStepState.topSolutions[multiStepState.activeTab];
        
        if (activeResult && activeResult.steps) {
            const layers = activeResult.steps.map((step, index) => {
                if (step.modeName === "Hue/Saturation" && step.hslValues) {
                    return {
                        modeName: "Hue/Saturation",
                        hslValues: step.hslValues,
                        name: `Step ${index + 1}: HSL (${step.hslValues.h > 0 ? '+' : ''}${step.hslValues.h}, ${step.hslValues.s > 0 ? '+' : ''}${step.hslValues.s}, ${step.hslValues.l > 0 ? '+' : ''}${step.hslValues.l})`,
                        opacity: step.opacity
                    };
                } else {
                    return {
                        hex: step.blendHex,
                        modeName: step.modeName,
                        name: `Step ${index + 1}: ${step.modeName} ${step.blendHex.toUpperCase()}`,
                        opacity: step.opacity
                    };
                }
            });
            
            const script = generatePhotopeaScript(layers);
            
            try {
                await navigator.clipboard.writeText(script);
                
                // Show feedback
                const tooltip = exportMultistepBtn.querySelector('.export-tooltip');
                if (tooltip) {
                    const originalText = tooltip.textContent;
                    tooltip.textContent = 'Copied!';
                    exportMultistepBtn.classList.add('copied');
                    setTimeout(() => {
                        tooltip.textContent = originalText;
                        exportMultistepBtn.classList.remove('copied');
                    }, 1500);
                }
            } catch (err) {
                console.error('Failed to copy script:', err);
                alert('Failed to copy script to clipboard.');
            }
        }
        return;
    }
    
    // Export button click (HSL Tool)
    const exportHslBtn = e.target.closest('#export-hsl-btn');
    if (exportHslBtn) {
        const hue = parseFloat(exportHslBtn.dataset.hue);
        const sat = parseFloat(exportHslBtn.dataset.sat);
        const light = parseFloat(exportHslBtn.dataset.light);
        
        if (!isNaN(hue) && !isNaN(sat) && !isNaN(light)) {
            const script = generateHslScript(hue, sat, light);
            
            try {
                await navigator.clipboard.writeText(script);
                
                // Show feedback
                const tooltip = exportHslBtn.querySelector('.export-tooltip');
                if (tooltip) {
                    const originalText = tooltip.textContent;
                    tooltip.textContent = 'Copied!';
                    exportHslBtn.classList.add('copied');
                    setTimeout(() => {
                        tooltip.textContent = originalText;
                        exportHslBtn.classList.remove('copied');
                    }, 1500);
                }
            } catch (err) {
                console.error('Failed to copy script:', err);
                alert('Failed to copy script to clipboard.');
            }
        }
        return;
    }

    // Preview Button Click (Delegated)
    const previewBtn = e.target.closest('.btn-preview');
    if (previewBtn) {
        const type = previewBtn.dataset.type;
        
        let data = {};
        
        if (type === 'simple') {
            const mode = previewBtn.dataset.mode;
            const r = parseFloat(previewBtn.dataset.blendR);
            const g = parseFloat(previewBtn.dataset.blendG);
            const b = parseFloat(previewBtn.dataset.blendB);
            data = { mode: mode, blend: [r, g, b] };
        } 
        else if (type === 'multistep') {
            const activeResult = multiStepState.topSolutions[multiStepState.activeTab];
            if (activeResult) {
                data = { steps: activeResult.steps };
            }
        } 
        else if (type === 'hsl') {
            data = {
                hue: parseFloat(previewBtn.dataset.hue),
                sat: parseFloat(previewBtn.dataset.sat),
                light: parseFloat(previewBtn.dataset.light)
            };
        }
        
        if (typeof openPreview === 'function') {
            openPreview(type, data);
        }
        return;
    }
});