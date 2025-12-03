
// Preview Logic - Handles image processing and modal rendering

// Reuse global blend helpers if available or define local copies
const getPreviewBlend = (modeName, sNorm, bNorm, opacity) => {
    // If applyBlendNorm is globally available (from multiStepOptimizer.js), use it.
    // However, multiStepOptimizer might not expose it directly on window.
    // Since we need robustness, we implement a local version that uses the primitives.
    
    if (modeName === "Hue/Saturation") {
        // HSL mode logic
        const h = (bNorm[0] * 360) - 180;
        const s = (bNorm[1] * 200) - 100;
        const l = (bNorm[2] * 200) - 100;
        
        const sRgb = sNorm.map(c => Math.round(c * 255));
        
        // applyHslAdjustment (from colorUtils.js) returns RGB [0-255]
        const resRgb = applyHslAdjustment(sRgb, h, s, l);
        const resNorm = resRgb.map(c => c / 255);
        
        return [
            clamp(opacity * resNorm[0] + (1 - opacity) * sNorm[0], 0, 1),
            clamp(opacity * resNorm[1] + (1 - opacity) * sNorm[1], 0, 1),
            clamp(opacity * resNorm[2] + (1 - opacity) * sNorm[2], 0, 1)
        ];
    } else {
        // Standard blend mode logic
        const r = applyBlendChannel(modeName, sNorm[0], bNorm[0]);
        const g = applyBlendChannel(modeName, sNorm[1], bNorm[1]);
        const b = applyBlendChannel(modeName, sNorm[2], bNorm[2]);
        
        return [
            clamp(opacity * r + (1 - opacity) * sNorm[0], 0, 1),
            clamp(opacity * g + (1 - opacity) * sNorm[1], 0, 1),
            clamp(opacity * b + (1 - opacity) * sNorm[2], 0, 1)
        ];
    }
};

/**
 * Apply a sequence of blend steps to a normalized color
 */
const applyPreviewSequence = (sourceNorm, steps) => {
    let current = sourceNorm.slice();
    for (const step of steps) {
        current = getPreviewBlend(step.modeName, current, step.blend, step.opacity);
    }
    return current;
};

/**
 * Main entry point to open preview modal
 * @param {string} type - 'simple' | 'multistep' | 'hsl'
 * @param {Object} data - Context data for the preview
 */
const openPreview = (type, data) => {
    const modal = document.getElementById('preview-modal');
    const sourceImg = document.getElementById('imgSource');
    const targetImg = document.getElementById('imgTarget');
    
    // Elements in modal
    const prevSource = document.getElementById('preview-img-source');
    const prevTarget = document.getElementById('preview-img-target');
    const prevCanvas = document.getElementById('preview-canvas-result');
    const prevNoSource = document.getElementById('preview-no-source');
    const prevNoTarget = document.getElementById('preview-no-target');
    const prevNoResult = document.getElementById('preview-no-result');
    
    // 1. Setup Source Image
    let hasSource = false;
    if (sourceImg && sourceImg.src && sourceImg.src.length > 100) { // Simple check for valid data URI
        prevSource.src = sourceImg.src;
        prevSource.style.display = 'block';
        prevNoSource.style.display = 'none';
        hasSource = true;
    } else {
        prevSource.style.display = 'none';
        prevNoSource.style.display = 'flex';
    }
    
    // 2. Setup Target Image
    if (targetImg && targetImg.src && targetImg.src.length > 100) {
        prevTarget.src = targetImg.src;
        prevTarget.style.display = 'block';
        prevNoTarget.style.display = 'none';
    } else {
        prevTarget.style.display = 'none';
        prevNoTarget.style.display = 'flex';
    }
    
    // 3. Render Preview
    if (hasSource) {
        prevCanvas.style.display = 'block';
        prevNoResult.style.display = 'none';
        generatePreviewImage(sourceImg, prevCanvas, type, data);
    } else {
        prevCanvas.style.display = 'none';
        prevNoResult.style.display = 'flex';
    }
    
    // 4. Render Swatches
    renderPreviewSwatches(type, data);
    
    // Show Modal
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
};

/**
 * Generate preview on canvas pixel-by-pixel
 */
const generatePreviewImage = (sourceImg, canvas, type, data) => {
    const ctx = canvas.getContext('2d');
    
    // Determine dimensions (Downscale large images for performance)
    const MAX_WIDTH = 600;
    let width = sourceImg.naturalWidth;
    let height = sourceImg.naturalHeight;
    
    if (width > MAX_WIDTH) {
        const ratio = MAX_WIDTH / width;
        width = MAX_WIDTH;
        height = Math.round(height * ratio);
    }
    
    canvas.width = width;
    canvas.height = height;
    
    // Draw source to canvas to get pixel data
    ctx.drawImage(sourceImg, 0, 0, width, height);
    
    const imgData = ctx.getImageData(0, 0, width, height);
    const px = imgData.data;
    
    // Prepare steps based on type
    let steps = [];
    if (type === 'simple') {
        // Simple blend: single step, full opacity
        // data = { mode: string, blend: [r,g,b]norm, opacity: 1 }
        steps = [{ modeName: data.mode, blend: data.blend, opacity: 1 }];
    } else if (type === 'hsl') {
        // HSL tool: single step HSL mode
        // data = { hue: number, sat: number, light: number }
        // Convert to normalized params expected by applyBlendNorm/HSL logic
        // Hue: -180..180 -> 0..1 => (h + 180)/360
        // Sat: -100..100 -> 0..1 => (s + 100)/200
        const normH = (data.hue + 180) / 360;
        const normS = (data.sat + 100) / 200;
        const normL = (data.light + 100) / 200;
        
        steps = [{ 
            modeName: "Hue/Saturation", 
            blend: [normH, normS, normL], 
            opacity: 1 
        }];
    } else if (type === 'multistep') {
        // Multi-step: array of steps
        steps = data.steps;
    }
    
    // Process pixels
    const totalPixels = width * height;
    
    for (let i = 0; i < totalPixels; i++) {
        const idx = i * 4;
        
        // Skip fully transparent pixels
        if (px[idx+3] === 0) continue;
        
        const sNorm = [
            px[idx] / 255,
            px[idx+1] / 255,
            px[idx+2] / 255
        ];
        
        const resNorm = applyPreviewSequence(sNorm, steps);
        
        px[idx] = resNorm[0] * 255;
        px[idx+1] = resNorm[1] * 255;
        px[idx+2] = resNorm[2] * 255;
        // Alpha remains unchanged
    }
    
    ctx.putImageData(imgData, 0, 0);
};

/**
 * Render swatches below images
 */
const renderPreviewSwatches = (type, data) => {
    const sContainer = document.getElementById('preview-swatches-source');
    const tContainer = document.getElementById('preview-swatches-target');
    const rContainer = document.getElementById('preview-swatches-result');
    
    sContainer.innerHTML = '';
    tContainer.innerHTML = '';
    rContainer.innerHTML = '';
    
    const pairs = getValidPairs(); // From state.js
    
    // Prepare steps for calculation
    let steps = [];
    if (type === 'simple') {
        steps = [{ modeName: data.mode, blend: data.blend, opacity: 1 }];
    } else if (type === 'hsl') {
        const normH = (data.hue + 180) / 360;
        const normS = (data.sat + 100) / 200;
        const normL = (data.light + 100) / 200;
        steps = [{ modeName: "Hue/Saturation", blend: [normH, normS, normL], opacity: 1 }];
    } else if (type === 'multistep') {
        steps = data.steps;
    }
    
    pairs.forEach(pair => {
        const sRgb = hexToRgb(pair.source);
        const sNorm = sRgb.map(c => c / 255);
        
        // Calculate result
        const resNorm = applyPreviewSequence(sNorm, steps);
        const resHex = rgbToHex(...resNorm.map(c => Math.round(c * 255)));
        
        // Render Source Swatch
        sContainer.appendChild(createSwatch(pair.source));
        
        // Render Target Swatch
        tContainer.appendChild(createSwatch(pair.target));
        
        // Render Result Swatch
        rContainer.appendChild(createSwatch(resHex));
    });
};

const createSwatch = (hex) => {
    const div = document.createElement('div');
    div.className = 'preview-swatch-item';
    div.style.backgroundColor = hex;
    div.dataset.hex = hex.toUpperCase();
    return div;
};

// Event Listeners for Modal
document.getElementById('preview-close').addEventListener('click', () => {
    document.getElementById('preview-modal').classList.add('hidden');
    document.getElementById('preview-modal').setAttribute('aria-hidden', 'true');
});

document.getElementById('preview-modal').addEventListener('click', (e) => {
    if (e.target.id === 'preview-modal') {
        document.getElementById('preview-modal').classList.add('hidden');
        document.getElementById('preview-modal').setAttribute('aria-hidden', 'true');
    }
});
