/**
 * Mock implementation of file-type module for Jest tests
 * This is needed because file-type v21+ is pure ESM and causes issues with Jest
 */

export interface FileTypeResult {
  ext: string;
  mime: string;
}

/**
 * Mock implementation of fileTypeFromFile
 * Returns a basic file type based on file extension
 */
export async function fileTypeFromFile(filePath: string): Promise<FileTypeResult | undefined> {
  // Simple mock that returns undefined, allowing tests to use fallback detection
  // In real tests, this could be enhanced to return specific types based on path
  const ext = filePath.split('.').pop()?.toLowerCase();

  const mimeMap: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'pdf': 'application/pdf',
    'zip': 'application/zip',
    'txt': 'text/plain',
    'md': 'text/markdown',
  };

  if (ext && mimeMap[ext]) {
    return {
      ext: ext,
      mime: mimeMap[ext]
    };
  }

  return undefined;
}
