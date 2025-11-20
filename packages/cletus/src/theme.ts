/**
 * Terminal theme detection and adaptive color utilities
 */

/**
 * Detect if the terminal is using a light background
 * 
 * Detection methods (in order of priority):
 * 1. COLORFGBG environment variable (most reliable when available)
 * 2. TERM_PROGRAM for known terminals
 * 3. Default to dark mode if unable to determine
 * 
 * @returns true if light mode detected, false otherwise
 */
export function isLightTerminal(): boolean {
  // Method 1: Check COLORFGBG environment variable
  // Format is typically "foreground;background"
  // Light backgrounds typically have high values (7, 15), dark backgrounds have low values (0, 8)
  const colorFgBg = process.env.COLORFGBG;
  if (colorFgBg) {
    const parts = colorFgBg.split(';');
    if (parts.length >= 2) {
      const bg = parseInt(parts[1], 10);
      if (!isNaN(bg)) {
        // Background colors: 0-7 are dark, 8-15 are typically variants
        // but 7 and 15 are often white/light gray (light background)
        // 0 and 8 are black/dark gray (dark background)
        return bg === 7 || bg === 15;
      }
    }
  }

  // Method 2: Check for known terminal programs with light defaults
  const termProgram = process.env.TERM_PROGRAM;
  if (termProgram) {
    // Some terminals default to light mode
    const lightTerminals = ['Apple_Terminal']; // macOS Terminal.app often defaults to light
    if (lightTerminals.includes(termProgram)) {
      return true;
    }
  }

  // Method 3: Check for other environment hints
  // Some systems set COLORFGBG-like variables
  if (process.env.ITERM_PROFILE?.toLowerCase().includes('light')) {
    return true;
  }

  // Default to dark mode if we can't determine
  return false;
}

/**
 * Get a color value that adapts to the terminal theme
 * 
 * @param darkModeColor - Color to use in dark terminals
 * @param lightModeColor - Color to use in light terminals
 * @returns Appropriate color based on terminal theme
 */
export function adaptiveColor(darkModeColor: string, lightModeColor: string): string {
  return isLightTerminal() ? lightModeColor : darkModeColor;
}

/**
 * Adjust RGB values for light mode
 * Converts light colors to darker equivalents and vice versa
 * 
 * @param rgb - RGB string in format 'rgb(r,g,b)'
 * @param invert - If true, inverts the color brightness
 * @returns Adjusted RGB string
 */
export function adjustRgbForLightMode(rgb: string, invert: boolean = true): string {
  const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!match) return rgb;

  let [, r, g, b] = match.map(Number);

  if (invert) {
    // For very light colors (like cyan), make them darker
    // For very dark colors (like dark cyan), make them lighter isn't needed if we're darkening
    const brightness = (r + g + b) / 3;
    
    if (brightness > 127) {
      // Light color - darken it significantly
      r = Math.floor(r * 0.4);
      g = Math.floor(g * 0.4);
      b = Math.floor(b * 0.4);
    } else {
      // Dark color - lighten it less aggressively
      r = Math.min(255, Math.floor(r * 1.5));
      g = Math.min(255, Math.floor(g * 1.5));
      b = Math.min(255, Math.floor(b * 1.5));
    }
  }

  return `rgb(${r},${g},${b})`;
}

/**
 * Adjust hex color for light mode
 * 
 * @param hex - Hex color string (e.g., '#9d4edd')
 * @param factor - Darkening factor (0-1, where lower is darker)
 * @returns Adjusted hex color
 */
export function adjustHexForLightMode(hex: string, factor: number = 0.6): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;

  let r = parseInt(result[1], 16);
  let g = parseInt(result[2], 16);
  let b = parseInt(result[3], 16);

  // Darken the color for light mode
  r = Math.floor(r * factor);
  g = Math.floor(g * factor);
  b = Math.floor(b * factor);

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
