

// Utilities for generating Photopea / Photoshop scripts

const PS_MODES = {
    "Normal": "BlendMode.NORMAL",
    "Multiply": "BlendMode.MULTIPLY",
    "Screen": "BlendMode.SCREEN",
    "Linear Dodge (Add)": "BlendMode.LINEARDODGE",
    "Subtract": "BlendMode.SUBTRACT",
    "Divide": "BlendMode.DIVIDE",
    "Difference": "BlendMode.DIFFERENCE",
    "Overlay": "BlendMode.OVERLAY",
    "Hard Light": "BlendMode.HARDLIGHT",
    "Soft Light (Pegtop)": "BlendMode.SOFTLIGHT", // Best approximation
    "Color Burn": "BlendMode.COLORBURN",
    "Linear Burn": "BlendMode.LINEARBURN",
    "Color Dodge": "BlendMode.COLORDODGE",
    "Vivid Light": "BlendMode.VIVIDLIGHT",
    "Linear Light": "BlendMode.LINEARLIGHT",
    "Pin Light": "BlendMode.PINLIGHT",
    "Hard Mix": "BlendMode.HARDMIX"
};

/**
 * Generates a Photoshop/Photopea JSX script to create a stack of mixed layers
 * Handles both "Solid Color" blend layers and "Hue/Saturation" adjustment layers.
 * @param {Array} layers - Array of objects describing layers
 * @returns {string} - The JSX script
 */
const generatePhotopeaScript = (layers) => {
    
    // We construct the body of the script by iterating layers
    let scriptBody = `
var d=app.activeDocument, old=app.foregroundColor;
var g=d.layerSets.add(); 
g.name="Blend Result";
var s2t = function (s) { return app.stringIDToTypeID(s); };

function addSolidLayer(h,m,n,o){
  var l=g.artLayers.add(); l.name=n;
  var c=new SolidColor(); c.rgb.hexValue=h.replace("#","");
  app.foregroundColor=c; d.selection.selectAll(); d.selection.fill(c); d.selection.deselect();
  l.blendMode=m;
  l.opacity=o;
}

function addHslLayer(h,s,lVal,n,o) {
    // Create HSL Content Layer
    var descriptor = new ActionDescriptor();
    var reference = new ActionReference();
    reference.putClass(s2t("contentLayer"));
    descriptor.putReference(s2t("null"), reference);

    var channelSettings = new ActionDescriptor();
    channelSettings.putInteger(s2t("hue"), h);
    channelSettings.putInteger(s2t("saturation"), s);
    channelSettings.putInteger(s2t("lightness"), lVal);

    var adjustmentList = new ActionList();
    adjustmentList.putObject(s2t("hueSaturationV2"), channelSettings);

    var hueSatParams = new ActionDescriptor();
    hueSatParams.putBoolean(s2t("colorize"), false);
    hueSatParams.putList(s2t("adjustment"), adjustmentList);

    var descriptor2 = new ActionDescriptor();
    descriptor2.putObject(s2t("type"), s2t("hueSaturation"), hueSatParams);
    descriptor.putObject(s2t("using"), s2t("contentLayer"), descriptor2);
    executeAction(s2t("make"), descriptor, DialogModes.NO);
    
    // Move into group (new layers are created at top, assume we can move current active layer)
    var active = d.activeLayer;
    active.name = n;
    active.opacity = o;
    active.move(g, ElementPlacement.PLACEATEND);
}
`;

    // Iterate through provided layers and append appropriate calls
    layers.forEach(layer => {
        const opacity = layer.opacity !== undefined ? Math.round(layer.opacity * 100) : 100;
        
        if (layer.modeName === "Hue/Saturation" && layer.hslValues) {
            // HSL Layer
            const { h, s, l } = layer.hslValues;
            scriptBody += `addHslLayer(${h}, ${s}, ${l}, "${layer.name}", ${opacity});\n`;
        } else {
            // Solid Blend Layer
            const psMode = PS_MODES[layer.modeName] || 'BlendMode.NORMAL';
            scriptBody += `addSolidLayer("${layer.hex}", ${psMode}, "${layer.name}", ${opacity});\n`;
        }
    });

    scriptBody += `app.foregroundColor=old;\n`;

    return `(function(){\n${scriptBody}\n})();`;
};

/**
 * Generates a Photoshop/Photopea JSX script to create a Hue/Saturation adjustment layer
 * (Kept for compatibility with HSL tool export button)
 */
const generateHslScript = (hue, sat, light) => {
    // Photoshop expects integers
    const valHue = Math.round(hue);
    const valSat = Math.round(sat);
    const valLight = Math.round(light);
    const valOpacity = 100;

    return `(function() {
    var s2t = function (s) {
        return app.stringIDToTypeID(s);
    };

    var valHue = ${valHue};
    var valSat = ${valSat};
    var valLight = ${valLight};
    var valOpacity = ${valOpacity};

    var descriptor = new ActionDescriptor();
    var reference = new ActionReference();
    reference.putClass(s2t("contentLayer"));
    descriptor.putReference(s2t("null"), reference);

    var channelSettings = new ActionDescriptor();
    channelSettings.putInteger(s2t("hue"), valHue);
    channelSettings.putInteger(s2t("saturation"), valSat);
    channelSettings.putInteger(s2t("lightness"), valLight);

    var adjustmentList = new ActionList();
    adjustmentList.putObject(s2t("hueSaturationV2"), channelSettings);

    var hueSatParams = new ActionDescriptor();
    hueSatParams.putBoolean(s2t("colorize"), false);
    hueSatParams.putList(s2t("adjustment"), adjustmentList);

    var descriptor2 = new ActionDescriptor();
    descriptor2.putObject(s2t("type"), s2t("hueSaturation"), hueSatParams);
    descriptor.putObject(s2t("using"), s2t("contentLayer"), descriptor2);
    executeAction(s2t("make"), descriptor, DialogModes.NO);

    app.activeDocument.activeLayer.opacity = valOpacity;
})();`;
};
