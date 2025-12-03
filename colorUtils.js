// Color conversion utilities (hex, RGB, HSV, Lab, Delta E)

const hexToRgb = (hex) => {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return r ? [parseInt(r[1], 16), parseInt(r[2], 16), parseInt(r[3], 16)] : null;
};

const rgbToHex = (r, g, b) =>
    "#" +
    [r, g, b]
        .map((x) => {
            const h = Math.round(clamp(x, 0, 255)).toString(16);
            return h.length === 1 ? "0" + h : h;
        })
        .join("");

const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

const fmt01 = (v) => v.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");

const channels = ["R", "G", "B"];

const rgbToHsv = (r, g, b) => {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    let s = max === 0 ? 0 : d / max;
    const v = max;

    if (d !== 0) {
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            case b:
                h = (r - g) / d + 4;
                break;
        }
        h /= 6;
    }
    return [h * 360, s, v];
};

const formatRgb = (rgb) => `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;

const formatHsv = (hsv) => `${hsv[0].toFixed(1)}°, ${(hsv[1] * 100).toFixed(1)}%, ${(hsv[2] * 100).toFixed(1)}%`;

// --- CIE Lab Color Space Conversions ---

// Convert sRGB (0-255) to linear RGB (0-1)
const srgbToLinear = (c) => {
    c = c / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

// Convert RGB (0-255) to XYZ
const rgbToXyz = (r, g, b) => {
    const lr = srgbToLinear(r);
    const lg = srgbToLinear(g);
    const lb = srgbToLinear(b);
    
    // sRGB D65 matrix
    const x = lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375;
    const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.0721750;
    const z = lr * 0.0193339 + lg * 0.1191920 + lb * 0.9503041;
    
    return [x * 100, y * 100, z * 100];
};

// D65 reference white
const REF_X = 95.047;
const REF_Y = 100.000;
const REF_Z = 108.883;

// Convert XYZ to Lab
const xyzToLab = (x, y, z) => {
    x = x / REF_X;
    y = y / REF_Y;
    z = z / REF_Z;
    
    const epsilon = 0.008856;
    const kappa = 903.3;
    
    const fx = x > epsilon ? Math.cbrt(x) : (kappa * x + 16) / 116;
    const fy = y > epsilon ? Math.cbrt(y) : (kappa * y + 16) / 116;
    const fz = z > epsilon ? Math.cbrt(z) : (kappa * z + 16) / 116;
    
    const L = 116 * fy - 16;
    const a = 500 * (fx - fy);
    const bVal = 200 * (fy - fz);
    
    return [L, a, bVal];
};

// Convert RGB (0-255) directly to Lab
const rgbToLab = (r, g, b) => {
    const [x, y, z] = rgbToXyz(r, g, b);
    return xyzToLab(x, y, z);
};

// Delta E (CIE76) - Euclidean distance in Lab space
const deltaE76 = (lab1, lab2) => {
    const dL = lab1[0] - lab2[0];
    const da = lab1[1] - lab2[1];
    const db = lab1[2] - lab2[2];
    return Math.sqrt(dL * dL + da * da + db * db);
};

// Delta E (CIEDE2000) - More accurate perceptual difference
const deltaE2000 = (lab1, lab2) => {
    const L1 = lab1[0], a1 = lab1[1], b1 = lab1[2];
    const L2 = lab2[0], a2 = lab2[1], b2 = lab2[2];
    
    const kL = 1, kC = 1, kH = 1;
    
    const C1 = Math.sqrt(a1 * a1 + b1 * b1);
    const C2 = Math.sqrt(a2 * a2 + b2 * b2);
    const Cab = (C1 + C2) / 2;
    
    const G = 0.5 * (1 - Math.sqrt(Math.pow(Cab, 7) / (Math.pow(Cab, 7) + Math.pow(25, 7))));
    
    const a1p = a1 * (1 + G);
    const a2p = a2 * (1 + G);
    
    const C1p = Math.sqrt(a1p * a1p + b1 * b1);
    const C2p = Math.sqrt(a2p * a2p + b2 * b2);
    
    const h1p = Math.atan2(b1, a1p) * 180 / Math.PI + (b1 < 0 ? 360 : 0);
    const h2p = Math.atan2(b2, a2p) * 180 / Math.PI + (b2 < 0 ? 360 : 0);
    
    const dLp = L2 - L1;
    const dCp = C2p - C1p;
    
    let dhp;
    if (C1p * C2p === 0) {
        dhp = 0;
    } else if (Math.abs(h2p - h1p) <= 180) {
        dhp = h2p - h1p;
    } else if (h2p - h1p > 180) {
        dhp = h2p - h1p - 360;
    } else {
        dhp = h2p - h1p + 360;
    }
    
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * Math.PI / 360);
    
    const Lp = (L1 + L2) / 2;
    const Cp = (C1p + C2p) / 2;
    
    let Hp;
    if (C1p * C2p === 0) {
        Hp = h1p + h2p;
    } else if (Math.abs(h1p - h2p) <= 180) {
        Hp = (h1p + h2p) / 2;
    } else if (h1p + h2p < 360) {
        Hp = (h1p + h2p + 360) / 2;
    } else {
        Hp = (h1p + h2p - 360) / 2;
    }
    
    const T = 1 - 0.17 * Math.cos((Hp - 30) * Math.PI / 180) +
              0.24 * Math.cos(2 * Hp * Math.PI / 180) +
              0.32 * Math.cos((3 * Hp + 6) * Math.PI / 180) -
              0.20 * Math.cos((4 * Hp - 63) * Math.PI / 180);
    
    const dTheta = 30 * Math.exp(-Math.pow((Hp - 275) / 25, 2));
    const RC = 2 * Math.sqrt(Math.pow(Cp, 7) / (Math.pow(Cp, 7) + Math.pow(25, 7)));
    const SL = 1 + (0.015 * Math.pow(Lp - 50, 2)) / Math.sqrt(20 + Math.pow(Lp - 50, 2));
    const SC = 1 + 0.045 * Cp;
    const SH = 1 + 0.015 * Cp * T;
    const RT = -Math.sin(2 * dTheta * Math.PI / 180) * RC;
    
    const dE = Math.sqrt(
        Math.pow(dLp / (kL * SL), 2) +
        Math.pow(dCp / (kC * SC), 2) +
        Math.pow(dHp / (kH * SH), 2) +
        RT * (dCp / (kC * SC)) * (dHp / (kH * SH))
    );
    
    return dE;
};

// Use CIEDE2000 as default Delta E
const deltaE = deltaE2000;

// Convert RGB (0-255) to HSL (H: 0-360, S: 0-1, L: 0-1)
const rgbToHsl = (r, g, b) => {
    r /= 255;
    g /= 255;
    b /= 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    
    if (max === min) {
        return [0, 0, l]; // achromatic
    }
    
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    let h;
    switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
    }
    
    return [h * 360, s, l];
};

// Convert HSL (H: 0-360, S: 0-1, L: 0-1) to RGB (0-255)
const hslToRgb = (h, s, l) => {
    h = ((h % 360) + 360) % 360; // normalize hue
    h /= 360;
    
    if (s === 0) {
        const v = Math.round(l * 255);
        return [v, v, v]; // achromatic
    }
    
    const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
    };
    
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    
    const r = hue2rgb(p, q, h + 1/3);
    const g = hue2rgb(p, q, h);
    const b = hue2rgb(p, q, h - 1/3);
    
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
};

const applyHslAdjustment = (rgb, hueShift, satAdj, lightAdj) => {
    // Helper to clamp values between 0 and 255
    const clamp = (v) => Math.max(0, Math.min(255, v));

    // 1. Adjust HUE (Must be done in HSL space)
    // We assume rgbToHsl returns h[0-360], s[0-1], l[0-1]
    let [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    
    // Rotate Hue
    h = (h + hueShift) % 360;
    if (h < 0) h += 360;

    // Convert back to RGB immediately. 
    // The Saturation/Lightness math MUST happen in RGB space to match Photopea.
    let [r, g, b] = hslToRgb(h, s, l);

    // 2. Adjust SATURATION (RGB Space Algorithm)
    // Calculate the 'Gray' reference point (Lightness as (Min+Max)/2)
    const gray = (Math.max(r, g, b) + Math.min(r, g, b)) / 2;

    let satMultiplier;
    
    if (satAdj < 0) {
        // Desaturation: Linearly interpolate towards Gray
        // -100 maps to 0. (Result is pure Gray)
        // -50 maps to 0.5. (Result is mix of Color and Gray)
        satMultiplier = 1 + (satAdj / 100); 
    } else {
        // Saturation: Push values away from Gray
        // Formula: 1 / (1 - adjustment)
        // This matches your observation: +50 (0.5) becomes a 2x multiplier.
        if (satAdj === 100) {
            satMultiplier = 1000; // Avoid divide by zero, just push to max
        } else {
            satMultiplier = 1 / (1 - (satAdj / 100));
        }
    }

    // Apply the spread from gray
    r = gray + (r - gray) * satMultiplier;
    g = gray + (g - gray) * satMultiplier;
    b = gray + (b - gray) * satMultiplier;

    // 3. Adjust LIGHTNESS (RGB Space Linear Blend)
    // Photopea/Photoshop Lightness is a simple blend to Black or White
    const lightMultiplier = lightAdj / 100;

    if (lightAdj < 0) {
        // Fade to Black (Multiply)
        const factor = 1 + lightMultiplier; // e.g., -50 becomes 0.5
        r = r * factor;
        g = g * factor;
        b = b * factor;
    } else {
        // Fade to White (Screen/Add)
        // value + (255 - value) * factor
        r = r + (255 - r) * lightMultiplier;
        g = g + (255 - g) * lightMultiplier;
        b = b + (255 - b) * lightMultiplier;
    }

    // Return clamped RGB
    return [clamp(r), clamp(g), clamp(b)];
};
