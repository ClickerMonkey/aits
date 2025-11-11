import { Text } from 'ink';
import React, { useEffect, useState } from 'react';

const DEFAULT_COLORS: Array<[number, number, number]> = [
  [0, 255, 255],    // cyan
  [0, 100, 255],    // blue
  [255, 0, 255],    // magenta
  [255, 255, 0],    // yellow
  [0, 255, 100],    // green
  [255, 255, 255],  // white
];

interface InkAnimatedTextProps {
  text: string;
  colors?: Array<[number, number, number]>;
  min?: number;
  max?: number;
  distance?: number;
  wrap?: boolean;
}

/**
 * Animated text component that displays text with a moving gradient effect.
 * A bright spot moves across the text with surrounding letters progressively dimmed.
 */
export const InkAnimatedText: React.FC<InkAnimatedTextProps> = ({
  text,
  colors = DEFAULT_COLORS,
  min = 0.5,
  max = 1.0,
  distance = 4,
  wrap = true,
}) => {
  const [litIndex, setLitIndex] = useState(0);
  const [baseColor, setBaseColor] = useState<[number, number, number]>(colors[0]);

  // Pick random color when text changes
  useEffect(() => {
    if (text) {
      setBaseColor(colors[Math.floor(Math.random() * colors.length)]);
      setLitIndex(0);
    }
  }, [text, colors]);

  // Animate lit letter moving across text
  useEffect(() => {
    if (!text) {
      return;
    }

    const interval = setInterval(() => {
      setLitIndex((prev) => (prev + 1) % (text.length + distance));
    }, 100);

    return () => clearInterval(interval);
  }, [text, distance]);

  if (!text) {
    return null;
  }

  return (
    <>
      {text.split('').map((char, index) => {
        const litLength = text.length + distance;
        const normalizedLitIndex = litIndex % litLength;

        // Calculate distance (with or without wrap-around)
        const linearDistance = Math.abs(index - normalizedLitIndex);
        const calcDistance = wrap
          ? Math.min(linearDistance, litLength - linearDistance)
          : linearDistance;

        // Calculate brightness based on distance using linear interpolation
        const brightness = calcDistance === 0
          ? max
          : calcDistance >= distance
            ? min
            : max - ((max - min) * calcDistance / distance);

        const [r, g, b] = baseColor;
        const colorStr = `rgb(${Math.round(r * brightness)},${Math.round(g * brightness)},${Math.round(b * brightness)})`;

        return (
          <Text key={index} color={colorStr as any}>
            {char}
          </Text>
        );
      })}
    </>
  );
};
