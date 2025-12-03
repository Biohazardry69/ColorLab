

function getLuminance(rgb) {
    return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
}

function colorDist(c1, c2) {
    return Math.sqrt(
        Math.pow(c1[0] - c2[0], 2) +
        Math.pow(c1[1] - c2[1], 2) +
        Math.pow(c1[2] - c2[2], 2)
    );
}

// Helper: Normalize weights so that the average weight is 1.0
function normalizeWeights(items) {
    const k = items.length;
    if (k === 0) return items;
    
    let totalRawWeight = 0;
    for (const item of items) {
        totalRawWeight += item.rawWeight;
    }
    
    if (totalRawWeight === 0) {
        return items.map(item => ({ ...item, weight: 1 }));
    }
    
    const factor = k / totalRawWeight;
    
    return items.map(item => ({
        ...item,
        weight: item.rawWeight * factor
    }));
}

// 1. K-Means (Standard Average)
function algoKMeans(pixels, k, totalPixels, seeds = []) {
    let centroids = [];
    
    // 1. Initialize with Seeds
    if (seeds && seeds.length > 0) {
        const numSeeds = Math.min(seeds.length, k);
        for (let i = 0; i < numSeeds; i++) {
            // copy to avoid reference issues
            centroids.push([...seeds[i]]);
        }
    }

    // 2. Fill remaining with random pixels
    while (centroids.length < k) {
        const p = pixels[Math.floor(Math.random() * pixels.length)];
        // Check if random pixel is distinct enough? For simplicity, just push.
        centroids.push([p.r, p.g, p.b]);
    }
    
    let counts = Array(k).fill(0);
    let iterations = 10;
    let assignments = new Int32Array(totalPixels).fill(-1);
    
    for (let iter = 0; iter < iterations; iter++) {
        const sums = Array(k).fill(0).map(() => [0, 0, 0]);
        counts = Array(k).fill(0);
        const isLastIter = iter === iterations - 1;
        
        for (let i = 0; i < pixels.length; i++) {
            let minDist = Infinity;
            let clusterIndex = 0;
            const px = pixels[i];
            
            for (let c = 0; c < k; c++) {
                const d = (px.r - centroids[c][0])**2 + (px.g - centroids[c][1])**2 + (px.b - centroids[c][2])**2;
                if (d < minDist) { minDist = d; clusterIndex = c; }
            }
            
            sums[clusterIndex][0] += px.r;
            sums[clusterIndex][1] += px.g;
            sums[clusterIndex][2] += px.b;
            counts[clusterIndex]++;
            
            if (isLastIter) {
                assignments[px.id] = clusterIndex;
            }
        }
        
        for (let c = 0; c < k; c++) {
            if (counts[c] > 0) {
                centroids[c] = [Math.round(sums[c][0] / counts[c]), Math.round(sums[c][1] / counts[c]), Math.round(sums[c][2] / counts[c])];
            }
        }
    }
    
    const results = centroids.map((c, i) => ({
        color: c,
        rawWeight: counts[i],
        id: i // Cluster ID
    }));
    
    return {
        results: normalizeWeights(results),
        assignments
    };
}

// 2. Distinct Colors (Frequency Based + Distance Threshold)
function algoDistinct(pixels, k, totalPixels) {
    const countsMap = {};
    for(let p of pixels) {
        const key = `${p.r},${p.g},${p.b}`;
        countsMap[key] = (countsMap[key] || 0) + 1;
    }
    
    const sortedColors = Object.entries(countsMap)
        .sort((a, b) => b[1] - a[1])
        .map(entry => entry[0].split(',').map(Number));
    
    const selected = [];
    const threshold = 30; 

    for (let color of sortedColors) {
        if (selected.length >= k) break;
        let isDistinct = true;
        for (let sel of selected) {
            if (colorDist(color, sel) < threshold) {
                isDistinct = false;
                break;
            }
        }
        if (isDistinct) selected.push(color);
    }

    if (selected.length < k) {
        for (let color of sortedColors) {
            if (selected.length >= k) break;
            const exists = selected.some(s => s[0]===color[0] && s[1]===color[1] && s[2]===color[2]);
            if (!exists) selected.push(color);
        }
    }
    
    const assignments = new Int32Array(totalPixels).fill(-1);
    const assignmentCounts = new Array(selected.length).fill(0);
    
    for (const p of pixels) {
        let minDist = Infinity;
        let bestIdx = 0;
        const pColor = [p.r, p.g, p.b];
        
        for (let i = 0; i < selected.length; i++) {
            const d = colorDist(pColor, selected[i]);
            if (d < minDist) {
                minDist = d;
                bestIdx = i;
            }
        }
        assignments[p.id] = bestIdx;
        assignmentCounts[bestIdx]++;
    }
    
    const results = selected.map((c, i) => ({
        color: c,
        rawWeight: assignmentCounts[i],
        id: i
    }));
    
    return {
        results: normalizeWeights(results),
        assignments
    };
}

// 3. Luminance Zones (Quantiles)
function algoQuantiles(pixels, k, totalPixels) {
    // Clone pixels to sort without affecting other refs (though pixels is created in extractColors)
    // Sort by luminance
    pixels.sort((a, b) => getLuminance([a.r, a.g, a.b]) - getLuminance([b.r, b.g, b.b]));
    
    const selected = [];
    const chunkSize = Math.floor(pixels.length / k);
    const assignments = new Int32Array(totalPixels).fill(-1);
    
    for (let i = 0; i < k; i++) {
        let start = i * chunkSize;
        let end = (i === k - 1) ? pixels.length : (i + 1) * chunkSize;
        
        const chunk = pixels.slice(start, end);
        if (chunk.length === 0) {
             selected.push({ color: [0,0,0], weight: 0, id: i });
             continue;
        }

        // Assign all pixels in this chunk to cluster i
        for(const p of chunk) {
            assignments[p.id] = i;
        }

        const medianIndex = Math.floor(chunk.length / 2);
        const medianPixel = chunk[medianIndex];
        
        selected.push({
            color: [medianPixel.r, medianPixel.g, medianPixel.b],
            weight: 1,
            id: i
        });
    }
    
    return {
        results: selected,
        assignments
    };
}

function extractColors(file, k, algorithm = 'kmeans', options = {}) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Higher resolution for better contours (200px)
            const scale = Math.min(200 / img.width, 200 / img.height);
            canvas.width = Math.ceil(img.width * scale);
            canvas.height = Math.ceil(img.height * scale);
            
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            
            const w = canvas.width;
            const h = canvas.height;
            const checkIdx = (idx) => idx >= 0 && idx < imageData.length;
            const isWhite = (idx) => checkIdx(idx) && imageData[idx] > 240 && imageData[idx+1] > 240 && imageData[idx+2] > 240;
            
            const corners = [0, (w - 1) * 4, (w * (h - 1)) * 4, (w * h - 1) * 4];
            const removeWhiteBg = corners.filter(isWhite).length >= 3;

            const pixels = [];
            for (let i = 0; i < imageData.length; i += 4) {
                const r = imageData[i];
                const g = imageData[i+1];
                const b = imageData[i+2];
                const a = imageData[i+3];
                
                if (a < 10) continue;
                if (removeWhiteBg && r > 240 && g > 240 && b > 240) continue;
                
                // Store r, g, b AND the original spatial index (i/4)
                pixels.push({ r, g, b, id: i / 4 });
            }
            
            if (pixels.length === 0) {
                reject("No visible pixels found");
                return;
            }

            const totalPixels = w * h;
            let resultData;
            
            switch(algorithm) {
                case 'distinct':
                    resultData = algoDistinct(pixels, k, totalPixels);
                    break;
                case 'quantiles':
                    resultData = algoQuantiles(pixels, k, totalPixels);
                    break;
                case 'kmeans':
                default:
                    // Pass seeds if available
                    resultData = algoKMeans(pixels, k, totalPixels, options.seeds);
                    break;
            }

            resolve({
                colors: resultData.results,
                assignments: resultData.assignments,
                width: w,
                height: h
            });
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}
