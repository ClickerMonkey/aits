import fs from 'fs/promises';
import path from 'path';

/**
 * Load prompt files from the current working directory
 * Files are searched case-insensitively
 * Returns the first file found from the list
 */
export async function loadPromptFiles(
  cwd: string,
  fileNames: string[]
): Promise<string> {
  for (const fileName of fileNames) {
    try {
      // Read directory to find case-insensitive match
      const files = await fs.readdir(cwd);
      const matchedFile = files.find(
        (file) => file.toLowerCase() === fileName.toLowerCase()
      );

      if (matchedFile) {
        const filePath = path.join(cwd, matchedFile);
        const stats = await fs.stat(filePath);

        if (stats.isFile()) {
          const content = await fs.readFile(filePath, 'utf-8');
          if (content.trim()) {
            return `<prompt-file name="${matchedFile}">\n${content}\n</prompt-file>`;
          }
        }
      }
    } catch (error) {
      // Silently skip files that can't be read
      // This is expected when files don't exist
    }
  }

  return '';
}
