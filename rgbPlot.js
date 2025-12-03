// RGB slice canvas drawing

const drawRgbSlicePlot = ({
    canvas,  // Now accepts canvas element directly (optional, falls back to #rgb-slice-canvas)
    sourceNorm,
    targetNorm,
    blendNorm,
    sourceHex,
    targetHex,
    blendHex,
    originalTargetNorm = null,
    originalTargetHex = null,
}) => {
    const canvasEl = canvas || document.getElementById("rgb-slice-canvas");
    if (!canvasEl || !blendNorm) {
        console.log('drawRgbSlicePlot: early return - canvasEl:', canvasEl, 'blendNorm:', blendNorm);
        return;
    }
    const ctx = canvasEl.getContext("2d");
    if (!ctx) {
        console.log('drawRgbSlicePlot: could not get 2d context');
        return;
    }

    // Use getAttribute to get the intended size, falling back to defaults
    const width = parseInt(canvasEl.getAttribute('width')) || canvasEl.width || 600;
    const height = parseInt(canvasEl.getAttribute('height')) || canvasEl.height || 250;
    
    console.log('drawRgbSlicePlot: canvas dimensions:', width, 'x', height);
    
    // Set the canvas internal dimensions
    canvasEl.width = width;
    canvasEl.height = height;

    ctx.clearRect(0, 0, width, height);

    // Basic vector helpers
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const norm = (v) => Math.sqrt(dot(v, v));
    const scale = (v, k) => [v[0] * k, v[1] * k, v[2] * k];
    const cross = (a, b) => [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ];
    const normalize = (v) => {
        const n = norm(v);
        return n < 1e-6 ? [0, 0, 0] : scale(v, 1 / n);
    };

    // Basis vectors in the plane
    const s = sourceNorm;
    const b = blendNorm;
    const t = targetNorm;

    let u = sub(b, s);
    if (norm(u) < 1e-6) u = [1, 0, 0];
    u = normalize(u);

    let vTemp = sub(t, s);
    let v = sub(vTemp, scale(u, dot(vTemp, u))); // remove u component
    if (norm(v) < 1e-6) {
        // pick any vector roughly perpendicular to u
        const alt = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
        v = sub(alt, scale(u, dot(alt, u)));
    }
    v = normalize(v);

    // Normal of the slice plane
    let n = normalize(cross(u, v));
    if (norm(n) < 1e-6) n = [0, 0, 1];

    const project = (p) => {
        const ps = sub(p, s);
        const x = dot(ps, u);
        const y = dot(ps, v);
        return { x, y };
    };

    const ps = project(s);
    const pb = project(b);
    const pt = project(t);

    const points = [ps, pb, pt];
    let pOrig = null;
    if (originalTargetNorm) {
        pOrig = project(originalTargetNorm);
        points.push(pOrig);
    }

    let minX = points.reduce((m, p) => Math.min(m, p.x), Infinity);
    let maxX = points.reduce((m, p) => Math.max(m, p.x), -Infinity);
    let minY = points.reduce((m, p) => Math.min(m, p.y), Infinity);
    let maxY = points.reduce((m, p) => Math.max(m, p.y), -Infinity);

    if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY)) {
        minX = -0.5;
        maxX = 0.5;
        minY = -0.5;
        maxY = 0.5;
    }

    const padX = (maxX - minX || 0.5) * 0.35;
    const padY = (maxY - minY || 0.5) * 0.35;
    minX -= padX;
    maxX += padX;
    minY -= padY;
    maxY += padY;

    const mapPoint = ({ x, y }) => {
        const nx = (x - minX) / (maxX - minX || 1);
        const ny = (y - minY) / (maxY - minY || 1);
        const px = 20 + nx * (width - 40);
        const py = height - (20 + ny * (height - 40));
        return { x: px, y: py };
    };

    const Ps = mapPoint(ps);
    const Pb = mapPoint(pb);
    const Pt = mapPoint(pt);

    let Pto = null;
    if (pOrig) {
        Pto = mapPoint(pOrig);
    }

    // --- Fill slice with colors from this RGB plane ---
    const img = ctx.createImageData(width, height);
    const data = img.data;
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;

    for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
            // Invert screen mapping (including the padding used for markers)
            const nx = (px - 20) / (width - 40);
            const ny = (height - py - 20) / (height - 40);

            const planeX = minX + nx * rangeX;
            const planeY = minY + ny * rangeY;

            // Point in RGB space: p = s + u * planeX + v * planeY
            const pr = s[0] + u[0] * planeX + v[0] * planeY;
            const pg = s[1] + u[1] * planeX + v[1] * planeY;
            const pbVal = s[2] + u[2] * planeX + v[2] * planeY;

            const r = clamp(pr, 0, 1) * 255;
            const g = clamp(pg, 0, 1) * 255;
            const bVal = clamp(pbVal, 0, 1) * 255;

            const idx = (py * width + px) * 4;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = bVal;
            data[idx + 3] = 255;
        }
    }

    ctx.putImageData(img, 0, 0);

    // Dark overlay for contrast
    ctx.save();
    ctx.fillStyle = "rgba(15, 23, 42, 0.35)";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    // Small RGB axis compass in the top-left
    const compassCx = 34;
    const compassCy = 34;
    const compassRadius = 16;
    const compassAxisLen = 14;

    ctx.save();
    ctx.beginPath();
    ctx.arc(compassCx, compassCy, compassRadius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(15,23,42,0.85)";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(148,163,184,0.9)";
    ctx.stroke();

    const drawCompassAxis = (axisDir, color, label) => {
        const axisPlane = sub(axisDir, scale(n, dot(axisDir, n)));
        const ax = dot(axisPlane, u);
        const ay = dot(axisPlane, v);
        const len2d = Math.sqrt(ax * ax + ay * ay);
        if (len2d < 1e-6) return; // nearly perpendicular

        const ux = ax / len2d;
        const uy = ay / len2d;

        const endX = compassCx + ux * compassAxisLen;
        const endY = compassCy - uy * compassAxisLen; // invert Y for screen coords

        const headLen = 5;

        // Shaft
        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 1.4;
        const shaftEndX = endX - ux * (headLen * 0.6);
        const shaftEndY = endY + uy * (headLen * 0.6);

        ctx.beginPath();
        ctx.moveTo(compassCx, compassCy);
        ctx.lineTo(shaftEndX, shaftEndY);
        ctx.stroke();

        const angle = Math.atan2(endY - compassCy, endX - compassCx);
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(
            endX - headLen * Math.cos(angle - Math.PI / 6),
            endY - headLen * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
            endX - headLen * Math.cos(angle + Math.PI / 6),
            endY - headLen * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();

        // Label
        ctx.font = "8px system-ui";
        ctx.fillStyle = "#f9fafb";
        const lx = endX + ux * 4;
        const ly = endY - uy * 4;
        ctx.fillText(label, lx - 2, ly + 2);

        ctx.restore();
    };

    drawCompassAxis([1, 0, 0], "rgba(239,68,68,0.95)", "R");
    drawCompassAxis([0, 1, 0], "rgba(34,197,94,0.95)", "G");
    drawCompassAxis([0, 0, 1], "rgba(59,130,246,0.95)", "B");
    ctx.restore();

    // Arrows
    const drawArrow = (from, to, color, radius = 6) => {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 2;

        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const headLen = 8;

        // End the arrow at the edge of the destination circle (if radius > 0)
        const endX = to.x - (dx / dist) * radius;
        const endY = to.y - (dy / dist) * radius;

        // Shorten the shaft slightly so the head doesn't extend under the circle
        const shaftEndX = endX - (dx / dist) * (headLen * 0.2);
        const shaftEndY = endY - (dy / dist) * (headLen * 0.2);

        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(shaftEndX, shaftEndY);
        ctx.stroke();

        const angle = Math.atan2(endY - from.y, endX - from.x);

        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(
            endX - headLen * Math.cos(angle - Math.PI / 6),
            endY - headLen * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
            endX - headLen * Math.cos(angle + Math.PI / 6),
            endY - headLen * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    };

    // Points
    const drawPoint = (p, color, label) => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(15,23,42,0.95)";
        ctx.stroke();

        ctx.font = "10px system-ui";
        ctx.fillStyle = "#f9fafb";
        ctx.textBaseline = "top";
        ctx.fillText(label, p.x + 8, p.y - 3);
        ctx.restore();
    };

    // Draw main S → B → T arrows and points
    drawArrow(Ps, Pb, "#7dd3fc", 7); // Source → Blend
    drawArrow(Pb, Pt, "#fdba74", 7); // Blend → Target
    drawPoint(Ps, sourceHex, "S");
    drawPoint(Pb, blendHex, "B");
    drawPoint(Pt, targetHex, "T");

    // If we have an original target (for clipped modes), draw its projection and dotted link
    if (Pto) {
        // Dotted line from achievable target to projected original target
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "rgba(252, 211, 77, 0.9)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(Pt.x, Pt.y);
        ctx.lineTo(Pto.x, Pto.y);
        ctx.stroke();
        ctx.restore();

        // Projected original target point
        ctx.save();
        ctx.beginPath();
        ctx.arc(Pto.x, Pto.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = originalTargetHex || "#facc15";
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(15,23,42,0.95)";
        ctx.stroke();

        ctx.font = "10px system-ui";
        ctx.fillStyle = "#fefce8";
        ctx.textBaseline = "top";
        ctx.fillText("T₀", Pto.x + 8, Pto.y - 3);
        ctx.restore();
    }
};
