# ColorLab: Multi-Color Blend Optimizer & Extraction Tool

**ColorLab** is a powerful web-based utility designed for digital artists, designers, creators, and developers. It solves the complex problem of finding optimal blend modes, colors, and adjustments to transform a set of source colors into specific target colors. Whether you're trying to match a color palette, reverse-engineer a filter, or automate color correction, ColorLab provides the mathematical precision you need.

Try it out
# [HERE](https://biohazardry69.github.io/ColorLab/)

## 🚀 Key Features

### 1. Multi-Pair Color Optimization
Instead of optimizing for a single color, ColorLab allows you to define multiple **Source → Target** pairs. The optimizer then finds the best global solution that minimizes the perceptual error (Delta E) across all pairs simultaneously.

- **Weighted Pairs:** Assign importance weights to specific pairs to prioritize their accuracy.
- **Perceptual Accuracy:** Uses the CIEDE2000 Delta E formula for human-perceptible color difference metrics.

### 2. Advanced Blend Analysis
- **Simple Blend:** Calculates the optimal solid blend color for standard Photoshop blend modes (Multiply, Overlay, Soft Light, etc.).
- **Multi-Step Optimization:** Uses a sophisticated algorithm (Greedy Search + Nelder-Mead with Basin Hopping) to find a chain of multiple blend layers (e.g., "Step 1: Multiply #ABC @ 50% → Step 2: Overlay #DEF @ 80%") that best achieves the target look.
- **HSL Tool:** Computes the optimal global Hue, Saturation, and Lightness adjustments to shift your source colors towards your targets.

### 3. Intelligent Color Extraction
Don't have hex codes? Upload images directly.
- **Auto-Extraction:** Uses K-Means clustering, Distinct Color frequency analysis, or Luminance Quantiles to automatically extract representative color palettes from source and target images.
- **Manual Selection:** Click directly on images to pick specific pixels.
- **Visual Feedback:** See exactly which regions of the image correspond to your extracted colors with interactive SVG overlays.

### 4. Developer & Designer Friendly
- **Export Scripts:** Generate ready-to-run `.jsx` scripts for Photoshop or [Photopea](https://www.photopea.com/) to instantly apply your calculated blend layers.
- **3D Visualization:** Visualize RGB vectors to understand how source colors map to targets in 3D space.
- **Deep Analysis:** Detailed per-pair breakdown of error rates, intermediate color states, and clipping warnings.

## 📦 Usage
1.  **Define Colors:** Manually enter hex codes or upload Source/Target images to extract palettes.
2.  **Analyze:** The app automatically computes the best single-layer blend modes.
3.  **Refine:** Use the "Advanced Blend" tab to find multi-layer solutions or the "HSL Tool" for adjustment layer values.
4.  **Preview:** Click the eye icon to see an estimated preview of the result applied to your source image.
5.  **Export:** Copy the generated script and run it in Photopea or Photoshop.

---

*Note: This project runs entirely in the browser. No image data is uploaded to any server.*


# FAQ

- Q: Why does this website exist?
I wanted to learn more about color theory and blend modes, but instad of doing that, I automated the whole process 😅

- Q: How accurate are the results?
I tested quite a few source colors, blend modes, and blend colors in Photopea. Most results are accurate beween 0-10 R/G/B values. Some blend effects seem to introduce some weird rounding. For Photoshop, I can't really tell, but I'd guess it is similarly close.

- Q: Did you really program all of that?
Nope, I did use multiple AIs to "vibe" code most of it. But I still spend a lot of time making sure everything is bug free(-ish).