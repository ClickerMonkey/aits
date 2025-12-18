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



/**
 * Get color constants for the Cletus UI based on terminal theme
 */
function getColors() {
  const isLight = isLightTerminal();
  
  return {
    // User colors
    USER: isLight ? adjustHexForLightMode('#9d4edd', 0.5) : '#9d4edd',
    USER_INPUT_BORDER: isLight ? adjustHexForLightMode('#9d4edd', 0.5) : '#9d4edd',
    USER_INPUT_PROMPT: isLight ? adjustHexForLightMode('#9d4edd', 0.5) : '#9d4edd',

    // Assistant colors
    ASSISTANT: adaptiveColor('green', 'green'), // Green works on both

    // System colors
    SYSTEM: adaptiveColor('yellow', '#b8860b'), // Darker yellow for light mode

    // Status indicator colors
    STATUS_USER: isLight ? adjustHexForLightMode('#9d4edd', 0.5) : '#9d4edd',
    STATUS_NO_OPS: adaptiveColor('gray', '#666666'), // Darker gray for light mode
    STATUS_DONE: adaptiveColor('green', 'green'), // Green works on both
    STATUS_ANALYZED: adaptiveColor('yellow', '#b8860b'), // Darker yellow for light mode
    STATUS_IN_PROGRESS: adaptiveColor('rgb(255,165,0)', 'rgb(180,120,0)'), // Darker orange for light mode

    // Menu Gradient
    MENU_GRADIENT: isLight 
      ? [
          adjustHexForLightMode('#9d4edd', 0.5),
          'rgb(0,90,180)',
          'rgb(180,120,0)',
        ]
      : [
          '#9d4edd',
          'rgb(0,128,255)',
          'rgb(255,165,0)',
        ],

    // Operation approval menu colors
    APPROVAL_BORDER: adaptiveColor('yellow', '#b8860b'),
    APPROVAL_SELECTED: adaptiveColor('cyan', 'rgb(0,139,139)'), // Dark cyan for light mode
    APPROVAL_UNSELECTED: adaptiveColor('white', 'black'),

    // Processing states
    PROCESSING_BORDER: adaptiveColor('cyan', 'rgb(0,139,139)'), // Dark cyan for light mode
    PROCESSING_TEXT: adaptiveColor('cyan', 'rgb(0,139,139)'), // Dark cyan for light mode

    // Completion states
    SUCCESS_BORDER: adaptiveColor('green', 'green'),
    SUCCESS_TEXT: adaptiveColor('green', 'green'),
    ERROR_BORDER: adaptiveColor('red', 'red'),
    ERROR_TEXT: adaptiveColor('red', 'red'),

    // Input states
    INPUT_TRANSCRIBING: adaptiveColor('blue', 'rgb(0,0,180)'), // Darker blue for light mode
    INPUT_WAITING: adaptiveColor('gray', '#666666'),
    INPUT_APPROVAL_MENU: adaptiveColor('gray', '#666666'),

    // Markdown colors
    MAKRDOWN_HEADINGS: isLight 
      ? [
          { color: 'rgb(0,139,139)', bold: true }, // Dark cyan
          { color: 'rgb(0,120,120)', bold: true },
          { color: 'rgb(0,100,100)', bold: true },
          { color: 'rgb(0,80,80)', bold: true },
          { color: 'rgb(0,60,60)', bold: true },
          { color: 'rgb(0,40,40)', bold: false },
        ]
      : [
          { color: 'rgb(0,255,255)', bold: true },
          { color: 'rgb(0,210,210)', bold: true },
          { color: 'rgb(0,165,165)', bold: true },
          { color: 'rgb(0,130,130)', bold: true },
          { color: 'rgb(0,95,95)', bold: true },
          { color: 'rgb(0,60,60)', bold: false },
        ],
    MARKDOWN_CODE_BACKGROUND: adaptiveColor('rgb(25,25,25)', 'rgb(240,240,240)'), // Light gray for light mode
    MARKDOWN_LINK: adaptiveColor('rgb(15,101,187)', 'rgb(10,70,130)'), // Darker blue for light mode
    MARKDOWN_BLOCKQUOTE: adaptiveColor('rgb(30,30,30)', 'rgb(235,235,235)'), // Light gray for light mode

    // Other UI elements
    DIM_TEXT: adaptiveColor('gray', '#666666'),
  };
}

/**
 * Color constants for the Cletus UI
 */
export const COLORS = getColors();


/**
 * Type for color values
 */
export type ColorValue = typeof COLORS[keyof typeof COLORS];