// Blend mode definitions and forward/inverse calculations

const blendModes = [
    {
        name: "Normal",
        inverse: (s, t) => t,
        inverseSource: (b, t) => t,
        equation: "result = blend",
    },
    {
        name: "Multiply",
        inverse: (s, t) => (s === 0 ? (t === 0 ? 0.5 : null) : t / s),
        inverseSource: (b, t) => (b === 0 ? (t === 0 ? 0 : null) : t / b),
        equation: "result = source × blend",
    },
    {
        name: "Screen",
        inverse: (s, t) => (s === 1 ? (t === 1 ? 0.5 : null) : 1 - (1 - t) / (1 - s)),
        inverseSource: (b, t) => (b === 1 ? (t === 1 ? 1 : null) : 1 - (1 - t) / (1 - b)),
        equation: "result = 1 − (1 − source) × (1 − blend)",
    },
    {
        name: "Subtract",
        inverse: (s, t) => s - t,
        inverseSource: (b, t) => t + b,
        equation: "result = source − blend (clamped to [0, 1])",
    },
    {
        name: "Divide",
        inverse: (s, t) => (t === 0 ? (s === 0 ? 0.5 : null) : s / t),
        inverseSource: (b, t) => t * b,
        equation: "result = source ÷ blend",
    },
    {
        name: "Difference",
        inverse: (s, t) => s - t,
        inverseSource: (b, t) => {
            const s1 = b + t;
            const s2 = b - t;
            if (s1 >= 0 && s1 <= 1) return s1;
            if (s2 >= 0 && s2 <= 1) return s2;
            return s1;
        },
        equation: "result = |source − blend|",
    },
    {
        name: "Overlay",
        inverse: (s, t) =>
            s < 0.5
                ? s === 0
                    ? t === 0
                        ? 0.5
                        : null
                    : t / (2 * s)
                : s === 1
                ? t === 1
                    ? 0.5
                    : null
                : 1 - (1 - t) / (2 * (1 - s)),
        inverseSource: (b, t) => {
            const s1 = b === 0 ? (t === 0 ? 0 : null) : t / (2 * b);
            if (b !== 0 && s1 !== null && s1 < 0.5) return s1;
            const s2 = b === 1 ? (t === 1 ? 1 : null) : 1 - (1 - t) / (2 * (1 - b));
            if (b !== 1 && s2 !== null && s2 >= 0.5) return s2;
            return b < 0.5 ? s1 : s2;
        },
        equation:
            "if source < 0.5: result = 2 × source × blend; else: result = 1 − 2 × (1 − source) × (1 − blend)",
    },
    {
        name: "Hard Light",
        inverse: (s, t) => {
            const b_m = s === 0 ? null : t / (2 * s);
            if (b_m !== null && b_m < 0.5) return b_m;
            const b_s = s === 1 ? null : 1 - (1 - t) / (2 * (1 - s));
            if (b_s !== null && b_s >= 0.5) return b_s;
            return b_m < 0.5 ? b_m : b_s >= 0.5 ? b_s : null;
        },
        inverseSource: (b, t) => {
            if (b < 0.5) {
                return b === 0 ? (t === 0 ? 0 : null) : t / (2 * b);
            } else {
                return b === 1 ? (t === 1 ? 1 : null) : 1 - (1 - t) / (2 * (1 - b));
            }
        },
        equation:
            "if blend < 0.5: result = 2 × source × blend; else: result = 1 − 2 × (1 − source) × (1 − blend)",
    },
    {
        name: "Soft Light (Pegtop)",
        inverse: (s, t) => {
            if (s === 0 || s === 1) return s === t ? 0.5 : null;
            return 0.5 * (1 - (s - t) / (s * (1 - s)));
        },
        inverseSource: (b, t) => {
            if (Math.abs(b - 0.5) < 1e-5) return t;
            const A = 1 - 2 * b;
            const B = 2 * b;
            const C = -t;
            const det = B * B - 4 * A * C;
            if (det < 0) return null;
            const sqrtDet = Math.sqrt(det);
            const s1 = (-B + sqrtDet) / (2 * A);
            const s2 = (-B - sqrtDet) / (2 * A);
            if (s1 >= 0 && s1 <= 1) return s1;
            if (s2 >= 0 && s2 <= 1) return s2;
            return s1;
        },
        equation: "result = (1 − 2 × blend) × source² + 2 × blend × source",
    },
    {
        name: "Color Burn",
        inverse: (s, t) => {
            if (s === 0) return t === 0 ? 0.5 : null;
            if (s === 1) return t === 1 ? 0.5 : null;
            if (t > s) return null; // Color Burn cannot lighten
            if (t === s) return 1; // blend = 1 leaves source unchanged
            if (t === 1) return null;
            return (1 - s) / (1 - t);
        },
        inverseSource: (b, t) => 1 - b * (1 - t),
        equation: "if blend = 0: result = 0; else: result = 1 − (1 − source) ÷ blend",
    },
    {
        name: "Linear Burn",
        inverse: (s, t) => t - s + 1,
        inverseSource: (b, t) => t - b + 1,
        equation: "result = source + blend − 1 (clamped to [0, 1])",
    },
    {
        name: "Color Dodge",
        inverse: (s, t) => {
            if (s === 0) {
                if (t === 0) return 0.5; // any blend < 1 leaves 0
                if (t === 1) return 1; // only blend = 1 can produce 1 from 0
                return null;
            }
            if (s === 1) return t === 1 ? 0.5 : null; // pure white stays white
            if (t === 0) return null;
            if (t === s) return 0; // blend = 0 leaves source unchanged
            if (t < s) {
                return null; // Color Dodge cannot darken
            }
            return 1 - s / t;
        },
        inverseSource: (b, t) => t * (1 - b),
        equation: "if blend = 1: result = 1; else: result = source ÷ (1 − blend)",
    },
    {
        name: "Linear Dodge (Add)",
        inverse: (s, t) => t - s,
        inverseSource: (b, t) => t - b,
        equation: "result = source + blend (clamped to [0, 1])",
    },
    {
        name: "Vivid Light",
        inverse: (s, t) => {
            let bBurn = null;
            if (t !== 1) {
                bBurn = (1 - s) / (2 * (1 - t));
            } else if (s === 1) {
                bBurn = 0.25;
            }
            if (bBurn !== null && isFinite(bBurn) && bBurn < 0.5) return bBurn;

            let bDodge = null;
            if (t !== 0) {
                bDodge = 1 - s / (2 * t);
            } else if (s === 0) {
                bDodge = 0.75;
            }
            if (bDodge !== null && isFinite(bDodge) && bDodge >= 0.5) return bDodge;

            return bBurn < 0.5 ? bBurn : bDodge >= 0.5 ? bDodge : null;
        },
        inverseSource: (b, t) => {
            if (b < 0.5) {
                return 1 - 2 * b * (1 - t);
            } else {
                return t * 2 * (1 - b);
            }
        },
        equation:
            "if blend < 0.5: result = 1 − (1 − source) ÷ (2 × blend); else: result = source ÷ (2 × (1 − blend))",
    },
    {
        name: "Linear Light",
        inverse: (s, t) => (t - s + 1) / 2,
        inverseSource: (b, t) => t - 2 * b + 1,
        equation: "result = source + 2 × blend − 1 (clamped to [0, 1])",
    },
    {
        name: "Pin Light",
        inverse: (s, t) => {
            let bLow = null;
            if (t < s) {
                bLow = t / 2;
            } else if (t === s) {
                if (s === 1) {
                    bLow = 0.499;
                } else {
                    bLow = (s / 2 + 0.5) / 2; // mid in [s/2, 0.5)
                }
            }
            if (bLow !== null && bLow < 0.5) return bLow;

            let bHigh = null;
            if (t > s) {
                bHigh = (t + 1) / 2;
            } else if (t === s) {
                bHigh = (0.5 + (s + 1) / 2) / 2; // mid in [0.5, (s+1)/2]
            }
            if (bHigh !== null && bHigh >= 0.5) return bHigh;

            return bLow < 0.5 ? bLow : bHigh >= 0.5 ? bHigh : null;
        },
        inverseSource: (b, t) => t, // Approximate
        equation:
            "if blend < 0.5: result = min(source, 2 × blend); else: result = max(source, 2 × blend − 1)",
    },
    {
        name: "Hard Mix",
        inverse: (s, t) => {
            if (t === 0) return 0.25; // pick a value that drives Vivid Light below 0.5
            if (t === 1) return 0.75; // pick a value that drives Vivid Light to ≥ 0.5
            return null; // cannot reach intermediate values in Hard Mix
        },
        inverseSource: (b, t) => null,
        equation:
            "per channel: result = 0 if VividLight(source, blend) < 0.5; otherwise result = 1 (after thresholding)",
    },
];

// Forward per-channel Vivid Light (used for Hard Mix and for computing achievable colors)
const vividLightChannel = (s, b) => {
    if (b < 0.5) {
        if (b <= 0) return 0;
        return 1 - (1 - s) / (2 * b);
    }
    if (b >= 1) return 1;
    return s / (2 * (1 - b));
};

// Forward per-channel blend application for all supported modes
const applyBlendChannel = (modeName, s, b) => {
    switch (modeName) {
        case "Normal":
            return b;
        case "Multiply":
            return s * b;
        case "Screen":
            return 1 - (1 - s) * (1 - b);
        case "Linear Dodge (Add)": {
            const r = s + b;
            return clamp(r, 0, 1);
        }
        case "Subtract": {
            const r = s - b;
            return clamp(r, 0, 1);
        }
        case "Divide":
            if (b === 0) return s === 0 ? 0 : 1; // best-effort edge handling
            return s / b;
        case "Difference":
            return Math.abs(s - b);
        case "Overlay":
            return s < 0.5 ? 2 * s * b : 1 - 2 * (1 - s) * (1 - b);
        case "Hard Light":
            return b < 0.5 ? 2 * s * b : 1 - 2 * (1 - s) * (1 - b);
        case "Soft Light (Pegtop)":
            return (1 - 2 * b) * s * s + 2 * b * s;
        case "Color Burn":
            if (b === 0) return 0;
            return 1 - (1 - s) / b;
        case "Linear Burn": {
            const r = s + b - 1;
            return clamp(r, 0, 1);
        }
        case "Color Dodge":
            if (b === 1) return 1;
            return s / (1 - b);
        case "Vivid Light":
            return vividLightChannel(s, b);
        case "Linear Light": {
            const r = s + 2 * b - 1;
            return clamp(r, 0, 1);
        }
        case "Pin Light": {
            if (b < 0.5) {
                return Math.min(s, 2 * b);
            }
            return Math.max(s, 2 * b - 1);
        }
        case "Hard Mix": {
            const vl = vividLightChannel(s, b);
            return vl < 0.5 ? 0 : 1;
        }
        default:
            return s;
    }
};
