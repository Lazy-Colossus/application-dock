import { describe, it, expect, vi, afterEach } from "vitest";
import { downscaleImage } from "./image";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("downscaleImage", () => {
  it("passes a small JPEG through untouched", async () => {
    const file = new File(["small"], "label.jpg", { type: "image/jpeg" });
    expect(await downscaleImage(file)).toBe(file);
  });

  it("re-encodes a large photo to a JPEG no wider than the limit", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 4000, height: 3000, close })),
    );
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D); // jsdom has no canvas implementation
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      function (cb) {
        cb(new Blob(["jpeg"], { type: "image/jpeg" }));
      },
    );
    const big = new File([new Uint8Array(2_000_000)], "IMG_0042.HEIC", {
      type: "image/heic",
    });

    const result = await downscaleImage(big);

    expect(result.type).toBe("image/jpeg");
    expect(result.name).toBe("IMG_0042.jpg");
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1200);
    expect(close).toHaveBeenCalled();
  });

  it("throws when the browser can't decode the photo", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new DOMException("unsupported", "InvalidStateError");
      }),
    );
    const heic = new File(["x"], "IMG.HEIC", { type: "image/heic" });
    await expect(downscaleImage(heic)).rejects.toThrow();
  });
});
