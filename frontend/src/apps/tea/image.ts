const MAX_SIDE = 1600;
// Phone cameras produce 3–8MB photos, over the server's 5MB limit; files under
// this size in a type the server keeps go up byte-for-byte, undecoded.
const PASSTHROUGH_BYTES = 1_500_000;
const PASSTHROUGH_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const JPEG_QUALITY = 0.85;

/** A photo small enough to upload: re-encoded as JPEG, longest side ≤ `maxSide`. */
export async function downscaleImage(
  file: File,
  maxSide = MAX_SIDE,
): Promise<File> {
  if (file.size <= PASSTHROUGH_BYTES && PASSTHROUGH_TYPES.has(file.type))
    return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) throw new Error("Couldn't re-encode the photo");
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, {
    type: "image/jpeg",
  });
}
