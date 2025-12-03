// Application state and DOM element references

let nextPairId = 1;

const state = {
    pairs: [
        { id: nextPairId++, source: null, target: null, weight: 1 }
    ]
};

// Get all valid (complete) pairs
const getValidPairs = () => state.pairs.filter(p => p.source && p.target);

// Add a new pair
const addPair = () => {
    const newPair = { id: nextPairId++, source: null, target: null, weight: 1 };
    state.pairs.push(newPair);
    return newPair;
};

// Remove a pair by ID
const removePair = (id) => {
    if (state.pairs.length <= 1) return false;
    const index = state.pairs.findIndex(p => p.id === id);
    if (index !== -1) {
        state.pairs.splice(index, 1);
        return true;
    }
    return false;
};

// Get pair by ID
const getPairById = (id) => state.pairs.find(p => p.id === id);

// Global color history (per session, no cookies)
const historyState = {
    colors: [],
    max: 20,
};

// Multi-step optimization state
const multiStepState = {
    numSteps: 2,
    minOpacity: 10,    // Minimum opacity percentage (1-100)
    maxOpacity: 100,   // Maximum opacity percentage (1-100)
    computing: false,
    result: null,
    progressMessage: '',
    topSolutions: [],  // Array of top N solutions
    activeTab: 0       // Currently selected solution tab
};

// Cache for DOM element references (rebuilt when pairs change)
let els = null;

const rebuildEls = () => {
    els = {
        pairsContainer: document.getElementById('pairs-container'),
        addPairBtn: document.getElementById('add-pair-btn'),
        results: {
            placeholder: document.getElementById('results-placeholder'),
            table: document.getElementById('results-table'),
            body: document.getElementById('results-body'),
        },
        unsupported: document.getElementById('unsupported-message'),
        modal: {
            root: document.getElementById('detail-modal'),
            title: document.getElementById('modal-title'),
            body: document.getElementById('modal-body'),
            badge: document.getElementById('modal-status-badge'),
            close: document.getElementById('modal-close'),
        },
    };
};