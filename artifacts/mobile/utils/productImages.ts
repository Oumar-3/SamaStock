import { Directory, File, Paths } from "expo-file-system";

const PRODUCT_IMAGE_DIR = "product-images";

export const PRODUCT_IMAGE_PICKER_OPTIONS = {
  quality: 0.58,
  allowsEditing: true,
  aspect: [1, 1] as [number, number],
};

export async function saveProductImageAsync(uri: string) {
  const dir = new Directory(Paths.document, PRODUCT_IMAGE_DIR);
  dir.create({ intermediates: true, idempotent: true });

  const destination = new File(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`);
  new File(uri).copy(destination);
  return destination.uri;
}

export async function deleteProductImageAsync(uri?: string | null) {
  if (!uri || !uri.includes(`/${PRODUCT_IMAGE_DIR}/`)) return;

  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Image cleanup must not block product editing.
  }
}
function getProductImageDirectory() {
  return new Directory(Paths.document, PRODUCT_IMAGE_DIR);
}

function listProductImageFiles() {
  const dir = getProductImageDirectory();
  if (!dir.exists) return [];
  try {
    return dir.list().filter((entry): entry is File => entry instanceof File && entry.exists);
  } catch {
    return [];
  }
}


export type ProductImageFileInfo = {
  uri: string;
  name: string;
  size: number;
  isUsed: boolean;
};

export async function listProductImagesAsync(referencedUris: Array<string | null | undefined> = []) {
  const referenced = new Set(referencedUris.filter((uri): uri is string => Boolean(uri)));
  return listProductImageFiles().map<ProductImageFileInfo>(file => ({
    uri: file.uri,
    name: file.name,
    size: file.size,
    isUsed: referenced.has(file.uri),
  }));
}

export async function deleteSelectedProductImagesAsync(uris: string[]) {
  const targets = new Set(uris);
  let deleted = 0;
  for (const file of listProductImageFiles()) {
    if (!targets.has(file.uri)) continue;
    try {
      file.delete();
      deleted += 1;
    } catch {
      // Cleanup must not block settings.
    }
  }
  return deleted;
}

export function formatProductImagesSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} Mo`;
}

export async function getProductImagesOverviewAsync(referencedUris: Array<string | null | undefined> = []) {
  const files = listProductImageFiles();
  const referenced = new Set(referencedUris.filter((uri): uri is string => Boolean(uri)));
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const unusedFiles = files.filter(file => !referenced.has(file.uri));
  const unusedBytes = unusedFiles.reduce((sum, file) => sum + file.size, 0);
  return {
    count: files.length,
    totalBytes,
    unusedCount: unusedFiles.length,
    unusedBytes,
  };
}

export async function deleteUnusedProductImagesAsync(referencedUris: Array<string | null | undefined> = []) {
  const referenced = new Set(referencedUris.filter((uri): uri is string => Boolean(uri)));
  let deleted = 0;
  for (const file of listProductImageFiles()) {
    if (referenced.has(file.uri)) continue;
    try {
      file.delete();
      deleted += 1;
    } catch {
      // Cleanup must not block settings.
    }
  }
  return deleted;
}

export async function deleteAllProductImagesAsync() {
  let deleted = 0;
  for (const file of listProductImageFiles()) {
    try {
      file.delete();
      deleted += 1;
    } catch {
      // Cleanup must not block settings.
    }
  }
  return deleted;
}
