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
 * Handles Solid Color blend layers, Hue/Saturation layers, and Levels layers.
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
var c2t = function (s) { return app.charIDToTypeID(s); };

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
    
    // Move into group and set opacity
    var active = d.activeLayer;
    active.name = n;
    active.opacity = o;
    active.move(g, ElementPlacement.PLACEATEND);
}

function addLevelsLayer(ib, iw, gam, ob, ow, n, o) {
    // 1. Make the adjustment layer (default levels)
    var idAdjL = c2t("AdjL");
    var idLvls = c2t("Lvls");
    var idPrst = s2t("presetKind");
    var idPrstT = s2t("presetKindType");
    var idNull = c2t("null");

    var d1 = new ActionDescriptor();
    var r1 = new ActionReference();
    r1.putClass(idAdjL);
    d1.putReference(idNull, r1);
    var d2 = new ActionDescriptor();
    var d3 = new ActionDescriptor();
    d3.putEnumerated(idPrst, idPrstT, s2t("presetKindDefault"));
    d2.putObject(c2t("Type"), idLvls, d3);
    d1.putObject(c2t("Usng"), idAdjL, d2);
    executeAction(c2t("Mk  "), d1, DialogModes.NO);

    // 2. Set the parameters
    var d4 = new ActionDescriptor();
    var r2 = new ActionReference();
    r2.putEnumerated(idAdjL, c2t("Ordn"), c2t("Trgt"));
    d4.putReference(idNull, r2);
    var d5 = new ActionDescriptor();
    d5.putEnumerated(idPrst, idPrstT, s2t("presetKindCustom"));
    var l1 = new ActionList();
    var d6 = new ActionDescriptor();
    var r3 = new ActionReference();
    var idChnl = c2t("Chnl");
    r3.putEnumerated(idChnl, idChnl, c2t("Cmps"));
    d6.putReference(idChnl, r3);
    d6.putDouble(c2t("Gmm "), gam);
    var l2 = new ActionList();
    l2.putInteger(ib);
    l2.putInteger(iw);
    d6.putList(c2t("Inpt"), l2);
    var l3 = new ActionList();
    l3.putInteger(ob);
    l3.putInteger(ow);
    d6.putList(c2t("Otpt"), l3);
    l1.putObject(c2t("LvlA"), d6);
    d5.putList(c2t("Adjs"), l1);
    d4.putObject(c2t("T   "), idLvls, d5);
    executeAction(c2t("setd"), d4, DialogModes.NO);

    // Move into group and set opacity
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
        } else if (layer.modeName === "Levels" && layer.levelsValues) {
            // Levels Layer
            const { inputBlack, inputWhite, inputGamma, outputBlack, outputWhite } = layer.levelsValues;
            scriptBody += `addLevelsLayer(${inputBlack}, ${inputWhite}, ${inputGamma}, ${outputBlack}, ${outputWhite}, "${layer.name}", ${opacity});\n`;
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

/**
 * Generates a Photoshop/Photopea JSX script to create a Levels adjustment layer
 */
const generateLevelsScript = (params) => {
    const { inputBlack, inputWhite, inputGamma, outputBlack, outputWhite } = params;

    return `(function() {
    var inBlack = ${Math.round(inputBlack)};
    var gamma = ${inputGamma};
    var inWhite = ${Math.round(inputWhite)};
    var outBlack = ${Math.round(outputBlack)};
    var outWhite = ${Math.round(outputWhite)};

    var c2t = function(s) { return app.charIDToTypeID(s); };
    var s2t = function(s) { return app.stringIDToTypeID(s); };
    
    var idAdjL = c2t("AdjL");
    var idLvls = c2t("Lvls");
    var idPrst = s2t("presetKind");
    var idPrstT = s2t("presetKindType");
    var idNull = c2t("null");

    // 1. Make the adjustment layer (default levels)
    var d1 = new ActionDescriptor();
    var r1 = new ActionReference();
    r1.putClass(idAdjL);
    d1.putReference(idNull, r1);
    var d2 = new ActionDescriptor();
    var d3 = new ActionDescriptor();
    d3.putEnumerated(idPrst, idPrstT, s2t("presetKindDefault"));
    d2.putObject(c2t("Type"), idLvls, d3);
    d1.putObject(c2t("Usng"), idAdjL, d2);
    executeAction(c2t("Mk  "), d1, DialogModes.NO);

    // 2. Set the parameters
    var d4 = new ActionDescriptor();
    var r2 = new ActionReference();
    r2.putEnumerated(idAdjL, c2t("Ordn"), c2t("Trgt"));
    d4.putReference(idNull, r2);
    var d5 = new ActionDescriptor();
    d5.putEnumerated(idPrst, idPrstT, s2t("presetKindCustom"));
    var l1 = new ActionList();
    var d6 = new ActionDescriptor();
    var r3 = new ActionReference();
    var idChnl = c2t("Chnl");
    r3.putEnumerated(idChnl, idChnl, c2t("Cmps"));
    d6.putReference(idChnl, r3);
    d6.putDouble(c2t("Gmm "), gamma);
    var l2 = new ActionList();
    l2.putInteger(inBlack);
    l2.putInteger(inWhite);
    d6.putList(c2t("Inpt"), l2);
    var l3 = new ActionList();
    l3.putInteger(outBlack);
    l3.putInteger(outWhite);
    d6.putList(c2t("Otpt"), l3);
    l1.putObject(c2t("LvlA"), d6);
    d5.putList(c2t("Adjs"), l1);
    d4.putObject(c2t("T   "), idLvls, d5);
    executeAction(c2t("setd"), d4, DialogModes.NO);
})();`;
};