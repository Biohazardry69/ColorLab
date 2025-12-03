



// Marker colors for manual selection (Distinct palette)
const MARKER_COLORS = [
    '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#00FFFF', 
    '#FF00FF', '#FFA500', '#800080', '#008080', '#FFC0CB'
];

// Reusable canvas for pixel extraction
const helperCanvas = document.createElement('canvas');
helperCanvas.width = 1;
helperCanvas.height = 1;
const helperCtx = helperCanvas.getContext('2d');

// Global state
let lastAnalysis = { source: null, target: null };
let lockedPairIndex = null;
let currentMode = 'auto'; // 'auto' | 'manual'

// Manual Mode State
let manualPairs = []; // Array of completed pairs
let manualActivePair = null; // Currently being built { source: {x,y,color}, target: ..., colorIndex }
let dragMarkerState = null; // { index: number|null, side: 'source'|'target', isCompleted: boolean }

// Zoom/Pan State
const zoomStates = {
    dropSource: { scale: 1, x: 0, y: 0, isDragging: false, startX: 0, startY: 0 },
    dropTarget: { scale: 1, x: 0, y: 0, isDragging: false, startX: 0, startY: 0 }
};

// --- Mode Switching ---

window.setMode = (mode) => {
    currentMode = mode;
    
    // UI Toggle
    document.getElementById('btnModeAuto').classList.toggle('active', mode === 'auto');
    document.getElementById('btnModeManual').classList.toggle('active', mode === 'manual');
    
    // Settings Sections
    document.getElementById('settingsAuto').classList.toggle('hidden', mode !== 'auto');
    document.getElementById('settingsManual').classList.toggle('hidden', mode !== 'manual');
    
    // Cursor style
    const zones = document.querySelectorAll('.upload-zone');
    zones.forEach(z => z.classList.toggle('manual-mode', mode === 'manual'));
    
    // Clear visualization if switching
    if (mode === 'manual') {
        renderManualMarkers();
    } else {
        // Restore auto visualization if data exists
        if (lastAnalysis.source && lockedPairIndex !== null) {
            drawRegionSVG('source-overlay', lastAnalysis.source, lockedPairIndex);
            drawRegionSVG('target-overlay', lastAnalysis.target, lockedPairIndex);
        } else {
            clearSVG('source-overlay');
            clearSVG('target-overlay');
        }
    }
};

document.getElementById('btnResetManual').addEventListener('click', () => {
    manualPairs = [];
    manualActivePair = null;
    document.getElementById('manualCount').textContent = '0';
    updateOptimizerConstraints(); // Reset input constraints
    renderManualMarkers();
});

function updateOptimizerConstraints() {
    const input = document.getElementById('manualTotalPairs');
    const currentCount = manualPairs.length;
    // Ensure min is at least 1 or current count
    const newMin = Math.max(1, currentCount);
    
    input.min = newMin;
    
    // Auto-grow current value if it's less than what we have selected
    if (parseInt(input.value) < newMin) {
        input.value = newMin;
    }
}

// --- Pan / Zoom / Click Logic ---

function initPanZoom(zoneId, containerId) {
    const zone = document.getElementById(zoneId);
    const container = document.getElementById(containerId);
    if (!zone || !container) return;
    
    const state = zoomStates[zoneId];
    
    // Track click vs drag
    let mouseDownPos = { x: 0, y: 0 };

    const updateTransform = () => {
        container.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
    };
    
    state.reset = () => {
        state.scale = 1;
        state.x = 0;
        state.y = 0;
        updateTransform();
    };

    zone.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomIntensity = 0.1;
        const delta = e.deltaY > 0 ? -1 : 1;
        state.scale = Math.min(Math.max(0.1, state.scale + delta * zoomIntensity), 10);
        updateTransform();
    });

    zone.addEventListener('mousedown', (e) => {
        if (e.target.closest('button')) return;
        // Don't start pan if we clicked a manual marker
        if (e.target.closest('.manual-marker')) return;
        
        state.isDragging = true;
        state.startX = e.clientX - state.x;
        state.startY = e.clientY - state.y;
        mouseDownPos = { x: e.clientX, y: e.clientY };
        
        if (currentMode === 'auto') zone.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
        if (!state.isDragging) return;
        e.preventDefault();
        state.x = e.clientX - state.startX;
        state.y = e.clientY - state.startY;
        updateTransform();
    });

    window.addEventListener('mouseup', (e) => {
        if (!state.isDragging) return;
        state.isDragging = false;
        if (currentMode === 'auto') zone.style.cursor = 'grab';
        
        // Detect Click (move < 3px)
        const dist = Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y);
        if (dist < 3) {
            handleZoneClick(zoneId, e);
        }
    });
}

// Convert event coordinates to image-relative coordinates
function getImgCoordinates(e, img) {
    const rect = img.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (img.naturalWidth / rect.width);
    const y = (e.clientY - rect.top) * (img.naturalHeight / rect.height);
    
    // Clamp to valid range (allowing a small buffer so dragging feels sticky to edge)
    const validX = Math.max(0, Math.min(img.naturalWidth - 1, x));
    const validY = Math.max(0, Math.min(img.naturalHeight - 1, y));
    
    // Only 'invalid' if the click is clearly outside visual bounds (for initial click)
    const isInside = x >= 0 && y >= 0 && x <= img.naturalWidth && y <= img.naturalHeight;
    
    return { x: validX, y: validY, isInside };
}

// Handle clicks for manual selection (creating new points)
function handleZoneClick(zoneId, e) {
    if (currentMode !== 'manual') return;
    
    // Check limit
    if (manualPairs.length >= 10 && !manualActivePair) {
        alert("Maximum of 10 pairs reached.");
        return;
    }

    const imgId = zoneId === 'dropSource' ? 'imgSource' : 'imgTarget';
    const img = document.getElementById(imgId);
    if (!img || img.style.display === 'none') return;
    
    const coords = getImgCoordinates(e, img);
    if (!coords.isInside) return;
    
    // Get Pixel Color
    const color = getPixelColor(img, coords.x, coords.y);
    if (!color) return;
    
    // Add color to history immediately on click
    if (typeof pushToHistory === 'function') {
        pushToHistory(color);
    }
    
    const side = zoneId === 'dropSource' ? 'source' : 'target';
    addManualPoint(side, coords.x, coords.y, color);
}

function getPixelColor(img, x, y) {
    // Draw 1x1 pixel from image
    helperCtx.drawImage(img, x, y, 1, 1, 0, 0, 1, 1);
    const data = helperCtx.getImageData(0, 0, 1, 1).data;
    
    // Alpha check (threshold 10)
    if (data[3] < 10) return null;
    return rgbToHex(data[0], data[1], data[2]);
}

function addManualPoint(side, x, y, color) {
    if (!manualActivePair) {
        const colorIndex = manualPairs.length % MARKER_COLORS.length;
        manualActivePair = { 
            colorIndex,
            source: null, 
            target: null 
        };
    }
    
    manualActivePair[side] = { x, y, color };
    
    // Check if complete
    if (manualActivePair.source && manualActivePair.target) {
        manualPairs.push(manualActivePair);
        manualActivePair = null;
        document.getElementById('manualCount').textContent = manualPairs.length;
        updateOptimizerConstraints();
    }
    
    renderManualMarkers();
}

function deleteManualPair(index) {
    if (index >= 0 && index < manualPairs.length) {
        manualPairs.splice(index, 1);
        document.getElementById('manualCount').textContent = manualPairs.length;
        updateOptimizerConstraints();
        renderManualMarkers();
    }
}

function renderManualMarkers() {
    clearSVG('source-overlay');
    clearSVG('target-overlay');
    
    // Draw completed pairs
    manualPairs.forEach((pair, i) => {
        const markerColor = MARKER_COLORS[pair.colorIndex];
        if (pair.source) drawMarker('source-overlay', pair.source, markerColor, { index: i, side: 'source', isCompleted: true });
        if (pair.target) drawMarker('target-overlay', pair.target, markerColor, { index: i, side: 'target', isCompleted: true });
    });
    
    // Draw active pair
    if (manualActivePair) {
        const markerColor = MARKER_COLORS[manualActivePair.colorIndex];
        if (manualActivePair.source) drawMarker('source-overlay', manualActivePair.source, markerColor, { side: 'source', isCompleted: false });
        if (manualActivePair.target) drawMarker('target-overlay', manualActivePair.target, markerColor, { side: 'target', isCompleted: false });
    }
}

function drawMarker(svgId, point, color, dragContext) {
    const svg = document.getElementById(svgId);
    if (!svg || !point) return;
    
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", point.x);
    circle.setAttribute("cy", point.y);
    circle.setAttribute("r", "5");
    circle.setAttribute("stroke", color);
    circle.setAttribute("fill", "none");
    circle.setAttribute("class", "manual-marker");
    circle.setAttribute("title", "Drag to move, Double-click to delete");
    
    // Attach Drag Event
    circle.addEventListener('mousedown', (e) => {
        if (currentMode !== 'manual') return;
        e.stopPropagation(); // Prevent pan-zoom start
        e.preventDefault();
        
        const imgId = svgId === 'source-overlay' ? 'imgSource' : 'imgTarget';
        
        dragMarkerState = {
            ...dragContext,
            imgId
        };
    });

    // Attach Delete Event
    circle.addEventListener('dblclick', (e) => {
        if (currentMode !== 'manual') return;
        e.stopPropagation();
        e.preventDefault();

        if (dragContext.isCompleted) {
            deleteManualPair(dragContext.index);
        } else {
            // Cancel active pair creation if double clicked
            manualActivePair = null;
            renderManualMarkers();
        }
    });
    
    svg.appendChild(circle);
}

// Global Drag Handlers
window.addEventListener('mousemove', (e) => {
    if (!dragMarkerState) return;
    e.preventDefault();
    
    const img = document.getElementById(dragMarkerState.imgId);
    if (!img) return;
    
    const coords = getImgCoordinates(e, img);
    const color = getPixelColor(img, coords.x, coords.y);
    if (!color) return; 
    
    const pointData = { x: coords.x, y: coords.y, color };
    
    if (dragMarkerState.isCompleted) {
        manualPairs[dragMarkerState.index][dragMarkerState.side] = pointData;
    } else {
        if (manualActivePair) {
            manualActivePair[dragMarkerState.side] = pointData;
        }
    }
    
    renderManualMarkers();
});

window.addEventListener('mouseup', (e) => {
    if (dragMarkerState) {
        // Add current color to history on release
        let color = null;
        if (dragMarkerState.isCompleted) {
            const pair = manualPairs[dragMarkerState.index];
            if (pair && pair[dragMarkerState.side]) {
                color = pair[dragMarkerState.side].color;
            }
        } else {
            if (manualActivePair && manualActivePair[dragMarkerState.side]) {
                color = manualActivePair[dragMarkerState.side].color;
            }
        }

        if (color && typeof pushToHistory === 'function') {
            pushToHistory(color);
        }

        dragMarkerState = null;
    }
});


// --- Main App Logic ---

function setupUploader(dropId, inputId, imgId, btnId, clearBtnId, containerId, stackId) {
    const dropZone = document.getElementById(dropId);
    const input = document.getElementById(inputId);
    const img = document.getElementById(imgId);
    const btn = document.getElementById(btnId);
    const clearBtn = document.getElementById(clearBtnId);

    initPanZoom(dropId, containerId);

    if (!dropZone || !input || !img || !btn) return;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        input.click();
    });

    clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetUploader(input, img, dropZone, clearBtn, dropId, stackId);
    });

    dropZone.addEventListener('click', () => dropZone.focus());

    input.addEventListener('change', (e) => {
        if (e.target.files[0]) updatePreview(e.target.files[0], img, dropZone, clearBtn, dropId, stackId);
    });

    dropZone.addEventListener('paste', (e) => {
        e.preventDefault();
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (let item of items) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                const dt = new DataTransfer();
                dt.items.add(file);
                input.files = dt.files;
                updatePreview(file, img, dropZone, clearBtn, dropId, stackId);
                return;
            }
        }
    });

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const file = dt.files[0];
        if (file && file.type.startsWith('image/')) {
            const dtNew = new DataTransfer();
            dtNew.items.add(file);
            input.files = dtNew.files;
            updatePreview(file, img, dropZone, clearBtn, dropId, stackId);
        }
    });
}

function updatePreview(file, img, zone, clearBtn, zoneId, stackId) {
    const reader = new FileReader();
    reader.onload = (e) => {
        img.src = e.target.result;
        img.style.display = 'block';
        img.onload = () => {
             setupOverlaySVG(img, zoneId === 'dropSource' ? 'source-overlay' : 'target-overlay', stackId);
        };
        
        const placeholder = zone.querySelector('.upload-placeholder');
        if (placeholder) placeholder.style.display = 'none';
        if (clearBtn) clearBtn.style.display = 'flex';
        
        zone.classList.add('active-cursor');
        
        if (zoomStates[zoneId] && zoomStates[zoneId].reset) {
            zoomStates[zoneId].reset();
        }
        
        lockedPairIndex = null;
        manualPairs = [];
        manualActivePair = null;
        document.getElementById('manualCount').textContent = '0';
        updateOptimizerConstraints(); // Reset input
    };
    reader.readAsDataURL(file);
}

function resetUploader(input, img, zone, clearBtn, zoneId) {
    input.value = '';
    img.src = '';
    img.style.display = 'none';
    const placeholder = zone.querySelector('.upload-placeholder');
    if (placeholder) placeholder.style.display = 'flex';
    if (clearBtn) clearBtn.style.display = 'none';
    
    zone.classList.remove('active-cursor');
    if (zoomStates[zoneId] && zoomStates[zoneId].reset) {
        zoomStates[zoneId].reset();
    }
    
    const svgId = zoneId === 'dropSource' ? 'source-overlay' : 'target-overlay';
    const svg = document.getElementById(svgId);
    // Remove the SVG element entirely so it doesn't block the placeholder buttons
    if(svg) svg.remove();
    
    manualPairs = [];
    manualActivePair = null;
}

// --- Processing & Rendering ---

// Add listener for "Select Colors"
document.getElementById('btnSelectManual').addEventListener('click', () => {
    if (manualPairs.length === 0) {
        alert("Please select at least one pair.");
        return;
    }
    
    // Convert manual pairs to results format
    const sourceResults = manualPairs.map((p, i) => ({
        color: hexToRgb(p.source.color),
        weight: 1,
        id: i
    }));
    const targetResults = manualPairs.map((p, i) => ({
        color: hexToRgb(p.target.color),
        weight: 1,
        id: i
    }));
    
    // Clear analysis data as we have no regions for manual selection
    lastAnalysis.source = null;
    lastAnalysis.target = null;
    
    renderResults(sourceResults, targetResults);
    document.getElementById('results-container').classList.remove('hidden');
    
    // Scroll to results
    document.getElementById('results-container').scrollIntoView({ behavior: 'smooth' });
});

document.getElementById('btnOptimizeManual').addEventListener('click', async () => {
    // 1. Validation
    const totalPairs = parseInt(document.getElementById('manualTotalPairs').value) || 5;
    if (manualPairs.length === 0) {
        alert("Please select at least one pair.");
        return;
    }
    if (manualPairs.length > totalPairs) {
        alert(`You have selected ${manualPairs.length} pairs but set Total Pairs to ${totalPairs}. Please increase Total Pairs.`);
        return;
    }

    const btn = document.getElementById('btnOptimizeManual');
    const spinner = btn.querySelector('.spinner-small');
    btn.disabled = true;
    spinner.style.display = 'block';

    try {
        // 2. Prep Seeds
        const sourceSeeds = manualPairs.map(p => hexToRgb(p.source.color));
        const targetSeeds = manualPairs.map(p => hexToRgb(p.target.color));

        // 3. Process with seeds
        await runOptimizationWithSeeds(totalPairs, sourceSeeds, targetSeeds);
    } catch (e) {
        console.error(e);
        alert(e);
    } finally {
        btn.disabled = false;
        spinner.style.display = 'none';
    }
});

async function runOptimizationWithSeeds(k, sSeeds, tSeeds) {
    const sourceInput = document.getElementById('fileSource');
    const targetInput = document.getElementById('fileTarget');
    
    // Extract with seeds
    const sourceData = await extractColors(sourceInput.files[0], k, 'kmeans', { seeds: sSeeds });
    const targetData = await extractColors(targetInput.files[0], k, 'kmeans', { seeds: tSeeds });
    
    // Store data for visualization
    lastAnalysis.source = sourceData;
    lastAnalysis.target = targetData;

    // Smart Sort:
    // 1. Keep the first N results (seeded) in order.
    // 2. Sort the remaining (K-N) results by luminance.
    
    const numSeeded = sSeeds.length;
    
    const sortHybrid = (colors) => {
        const seededPart = colors.slice(0, numSeeded);
        const autoPart = colors.slice(numSeeded);
        // Sort auto parts by luminance
        autoPart.sort((a, b) => getLuminance(a.color) - getLuminance(b.color));
        return [...seededPart, ...autoPart];
    };
    
    const sourceResults = sortHybrid(sourceData.colors);
    const targetResults = sortHybrid(targetData.colors);

    renderResults(sourceResults, targetResults);
    document.getElementById('results-container').classList.remove('hidden');
    
    // Reset lock so hover works immediately
    lockedPairIndex = null;
    updateLockVisuals();
    
    // NOTE: We do NOT switch mode to auto or clear markers. 
    // This allows the user to continue tweaking markers if desired.
}

async function processImages() {
    const btn = document.getElementById('btnGenerate');
    const spinner = btn.querySelector('.spinner');
    const btnText = btn.querySelector('span');
    const resultsContainer = document.getElementById('results-container');
    
    const sourceInput = document.getElementById('fileSource');
    const targetInput = document.getElementById('fileTarget');
    
    if (currentMode === 'auto') {
        if (!sourceInput.files[0] || !targetInput.files[0]) {
            alert("Please upload both images.");
            return;
        }
    } else {
        // "Generate Pairs" in Manual mode -> just show manual pairs without optimization
        const imgS = document.getElementById('imgSource');
        const imgT = document.getElementById('imgTarget');
        if (!imgS.src || !imgT.src || manualPairs.length === 0) {
            alert("Please select at least one pair of points manually.");
            return;
        }
    }

    btn.disabled = true;
    spinner.style.display = 'block';
    btnText.textContent = 'Processing...';
    lockedPairIndex = null;

    try {
        let sourceResults, targetResults;

        if (currentMode === 'manual') {
            // Just output manual pairs as-is
            sourceResults = manualPairs.map((p, i) => ({
                color: hexToRgb(p.source.color),
                weight: 1,
                id: i
            }));
            targetResults = manualPairs.map((p, i) => ({
                color: hexToRgb(p.target.color),
                weight: 1,
                id: i
            }));
            
            // No region analysis available for pure manual
            lastAnalysis.source = null;
            lastAnalysis.target = null;
            
        } else {
            // Auto Extract
            const k = parseInt(document.getElementById('colorCount').value) || 5;
            const algo = document.getElementById('algorithmSelect').value || 'kmeans';
            
            const sourceData = await extractColors(sourceInput.files[0], k, algo);
            const targetData = await extractColors(targetInput.files[0], k, algo);

            lastAnalysis.source = sourceData;
            lastAnalysis.target = targetData;

            // Sort by luminance for consistent ordering (Standard Auto behavior)
            sourceData.colors.sort((a, b) => getLuminance(a.color) - getLuminance(b.color));
            targetData.colors.sort((a, b) => getLuminance(a.color) - getLuminance(b.color));
            
            sourceResults = sourceData.colors;
            targetResults = targetData.colors;
        }

        renderResults(sourceResults, targetResults);
        resultsContainer.classList.remove('hidden');

    } catch (e) {
        console.error(e);
        alert("Error: " + e);
    } finally {
        btn.disabled = false;
        spinner.style.display = 'none';
        btnText.textContent = 'Generate Pairs';
    }
}

// Replaces setupOverlayCanvas
function setupOverlaySVG(img, svgId, stackId) {
    const container = document.getElementById(stackId);
    let svg = document.getElementById(svgId);
    if (svg) svg.remove();
    
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.id = svgId;
    svg.setAttribute("class", "overlay-svg");
    svg.setAttribute("viewBox", `0 0 ${img.naturalWidth} ${img.naturalHeight}`);
    svg.setAttribute("preserveAspectRatio", "none");
    
    container.appendChild(svg);
}

function clearSVG(svgId) {
    const svg = document.getElementById(svgId);
    if (svg) svg.innerHTML = '';
}

function renderResults(sourceColors, targetColors) {
    const grid = document.getElementById('results-grid');
    grid.innerHTML = '';

    const count = Math.min(sourceColors.length, targetColors.length);
    
    // Arrays to hold data for main state update
    const newPairs = [];

    for (let i = 0; i < count; i++) {
        const s = sourceColors[i];
        const t = targetColors[i];
        
        const sHex = typeof s.color === 'string' ? s.color : rgbToHex(...s.color);
        const tHex = typeof t.color === 'string' ? t.color : rgbToHex(...t.color);
        const weight = Math.round((s.weight || 1) * 100) / 100;

        newPairs.push({
            id: i + 1,
            source: sHex,
            target: tHex,
            weight: weight
        });

        const row = document.createElement('div');
        row.className = 'result-row';
        row.dataset.sourceId = s.id;
        row.dataset.targetId = t.id;
        row.dataset.index = i;
        
        row.innerHTML = `
            <div class="swatch-group">
                <div class="swatch" style="background-color: ${sHex}"></div>
                <div class="hex-text">${sHex}</div>
            </div>
            <div class="arrow">→</div>
            <div class="swatch-group">
                <div class="swatch" style="background-color: ${tHex}"></div>
                <div class="hex-text">${tHex}</div>
            </div>
            <div class="weight-badge">w: ${weight}</div>
        `;
        
        row.addEventListener('mouseenter', handleRowHover);
        row.addEventListener('mouseleave', handleRowLeave);
        row.addEventListener('click', handleRowClick);
        
        grid.appendChild(row);
    }
    
    // Automatically update global app state when results are generated
    if (typeof state !== 'undefined' && state.pairs) {
        state.pairs.length = 0; // Clear existing manual pairs
        
        newPairs.forEach(p => state.pairs.push(p));
        
        // Update global ID counter to prevent collisions if user adds more manually
        if (typeof nextPairId !== 'undefined') {
            nextPairId = count + 1;
        }
        
        // Trigger UI updates in main app
        if (typeof renderPairs === 'function') renderPairs();
        if (typeof updateCalculations === 'function') updateCalculations();
        if (typeof updateURL === 'function') updateURL();
    }
}

function handleRowClick(e) {
    if (!lastAnalysis.source) return;
    
    const row = e.currentTarget;
    const index = parseInt(row.dataset.index);

    if (lockedPairIndex === index) {
        lockedPairIndex = null;
        // Restore view based on mode
        if (currentMode === 'manual') {
            renderManualMarkers();
        } else {
            clearSVG('source-overlay');
            clearSVG('target-overlay');
        }
    } else {
        lockedPairIndex = index;
        const sId = parseInt(row.dataset.sourceId);
        const tId = parseInt(row.dataset.targetId);
        if (lastAnalysis.source) drawRegionSVG('source-overlay', lastAnalysis.source, sId);
        if (lastAnalysis.target) drawRegionSVG('target-overlay', lastAnalysis.target, tId);
    }
    
    updateLockVisuals();
}

function updateLockVisuals() {
    const rows = document.querySelectorAll('.result-row');
    rows.forEach(row => {
        const idx = parseInt(row.dataset.index);
        row.classList.toggle('active-lock', idx === lockedPairIndex);
    });
}

function handleRowHover(e) {
    if (lockedPairIndex !== null || !lastAnalysis.source) return;

    const row = e.currentTarget;
    const sId = parseInt(row.dataset.sourceId);
    const tId = parseInt(row.dataset.targetId);
    
    drawRegionSVG('source-overlay', lastAnalysis.source, sId);
    drawRegionSVG('target-overlay', lastAnalysis.target, tId);
}

function handleRowLeave() {
    if (lockedPairIndex !== null) return;
    
    if (currentMode === 'manual') {
        renderManualMarkers();
    } else {
        clearSVG('source-overlay');
        clearSVG('target-overlay');
    }
}

// Updated Drawing Logic: Masking
function drawRegionSVG(svgId, data, clusterId) {
    const svg = document.getElementById(svgId);
    if (!svg) return;
    svg.innerHTML = ''; 
    
    const { width, height, assignments } = data; 
    
    // Get image source for the mask
    const imgId = svgId === 'source-overlay' ? 'imgSource' : 'imgTarget';
    const img = document.getElementById(imgId);
    
    // Calculate scaling
    const scaleX = img.naturalWidth / width;
    const scaleY = img.naturalHeight / height;
    
    const contourPath = generateContourPath(width, height, assignments, clusterId, scaleX, scaleY);
    
    // 1. Defs + Mask
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const mask = document.createElementNS("http://www.w3.org/2000/svg", "mask");
    const maskId = `highlight-mask-${svgId}`;
    mask.setAttribute("id", maskId);
    
    // Inside Mask: White fills = Visible image. Black (default) = Hidden image.
    const pathMask = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pathMask.setAttribute("d", contourPath);
    pathMask.setAttribute("fill", "white");
    pathMask.setAttribute("fill-rule", "evenodd");
    mask.appendChild(pathMask);
    defs.appendChild(mask);
    svg.appendChild(defs);
    
    // 2. Dimming Rect (Background)
    const dimRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    dimRect.setAttribute("width", "100%");
    dimRect.setAttribute("height", "100%");
    dimRect.setAttribute("fill", "rgba(0,0,0,0.65)");
    svg.appendChild(dimRect);
    
    // 3. Image Copy with Mask (Foreground)
    const imageCopy = document.createElementNS("http://www.w3.org/2000/svg", "image");
    imageCopy.setAttributeNS("http://www.w3.org/1999/xlink", "href", img.src);
    imageCopy.setAttribute("width", "100%");
    imageCopy.setAttribute("height", "100%");
    imageCopy.setAttribute("mask", `url(#${maskId})`);
    svg.appendChild(imageCopy);
}

// Marching Squares Algorithm with Stitching
function generateContourPath(w, h, assignments, id, scaleX, scaleY) {
    const segments = [];
    
    // Helper to check value at grid coordinate
    const getVal = (x, y) => {
        if (x < 0 || y < 0 || x >= w || y >= h) return 0;
        return assignments[y * w + x] === id ? 1 : 0;
    };
    
    // Helper to add segment (raw coordinates)
    const addSeg = (x1, y1, x2, y2) => {
        segments.push({ x1, y1, x2, y2 });
    };

    // March cells
    for (let y = -1; y < h; y++) {
        for (let x = -1; x < w; x++) {
            const tl = getVal(x, y);
            const tr = getVal(x+1, y);
            const br = getVal(x+1, y+1);
            const bl = getVal(x, y+1);
            
            const index = (tl * 8) + (tr * 4) + (br * 2) + (bl * 1);
            if (index === 0 || index === 15) continue;
            
            // Midpoints
            const top = { x: x + 0.5, y: y };
            const right = { x: x + 1, y: y + 0.5 };
            const bottom = { x: x + 0.5, y: y + 1 };
            const left = { x: x, y: y + 0.5 };
            
            // Generate directed segments to maintain clockwise winding for "inside" shapes
            switch(index) {
                case 1:  addSeg(left.x, left.y, bottom.x, bottom.y); break; // BL: Left -> Bottom
                case 2:  addSeg(bottom.x, bottom.y, right.x, right.y); break; // BR: Bottom -> Right
                case 3:  addSeg(left.x, left.y, right.x, right.y); break; // BL+BR: Left -> Right
                case 4:  addSeg(right.x, right.y, top.x, top.y); break; // TR: Right -> Top
                // Fix saddle case 5 (TR+BL): Separate the 1s into distinct loops
                case 5:  addSeg(left.x, left.y, bottom.x, bottom.y); addSeg(right.x, right.y, top.x, top.y); break; 
                case 6:  addSeg(bottom.x, bottom.y, top.x, top.y); break; // Vertical
                case 7:  addSeg(left.x, left.y, top.x, top.y); break; // !TL
                case 8:  addSeg(top.x, top.y, left.x, left.y); break; // TL: Top -> Left
                case 9:  addSeg(top.x, top.y, bottom.x, bottom.y); break; // Vertical
                // Fix saddle case 10 (TL+BR): Separate the 1s into distinct loops
                case 10: addSeg(top.x, top.y, left.x, left.y); addSeg(bottom.x, bottom.y, right.x, right.y); break; 
                case 11: addSeg(top.x, top.y, right.x, right.y); break; // !BR
                case 12: addSeg(right.x, right.y, left.x, left.y); break; // Horizontal
                case 13: addSeg(right.x, right.y, bottom.x, bottom.y); break; // !BL
                case 14: addSeg(bottom.x, bottom.y, left.x, left.y); break; // !TR
            }
        }
    }
    
    // Stitch segments into closed loops
    const segmentMap = new Map();
    segments.forEach(seg => {
        // Use fixed precision to avoid floating point key mismatch
        const key = `${seg.x1.toFixed(1)},${seg.y1.toFixed(1)}`;
        segmentMap.set(key, seg);
    });
    
    let pathStr = "";
    
    // Process until map is empty
    while (segmentMap.size > 0) {
        // Pick an arbitrary start
        const firstKey = segmentMap.keys().next().value;
        const firstSeg = segmentMap.get(firstKey);
        segmentMap.delete(firstKey);
        
        pathStr += `M ${firstSeg.x1 * scaleX} ${firstSeg.y1 * scaleY} `;
        
        let curr = firstSeg;
        
        // Follow the chain
        while (true) {
            const nextKey = `${curr.x2.toFixed(1)},${curr.y2.toFixed(1)}`;
            
            pathStr += `L ${curr.x2 * scaleX} ${curr.y2 * scaleY} `;
            
            if (segmentMap.has(nextKey)) {
                curr = segmentMap.get(nextKey);
                segmentMap.delete(nextKey);
            } else {
                // Only close with 'z' if we truly looped back to start
                // (Avoids diagonal artifacts if the loop is broken)
                if (Math.abs(curr.x2 - firstSeg.x1) < 0.1 && Math.abs(curr.y2 - firstSeg.y1) < 0.1) {
                    pathStr += "z ";
                }
                break;
            }
        }
    }
    
    return pathStr;
}

// Init
setupUploader('dropSource', 'fileSource', 'imgSource', 'btnSource', 'clearSource', 'containerSource', 'stackSource');
setupUploader('dropTarget', 'fileTarget', 'imgTarget', 'btnTarget', 'clearTarget', 'containerTarget', 'stackTarget');

document.getElementById('btnGenerate').addEventListener('click', processImages);