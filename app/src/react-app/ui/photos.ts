const MAX_SIDE = 1024;

export function pickPhoto(fileInput: HTMLInputElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    fileInput.value = "";
    fileInput.onchange = async () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return resolve(null);
      try {
        resolve(await downscale(f));
      } catch (e) {
        console.warn("Could not read image", e);
        resolve(null);
      }
    };
    fileInput.click();
  });
}

/** Re-encodes any image as a JPEG no larger than MAX_SIDE on its long edge. */
export function downscale(file: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * s)), h = Math.max(1, Math.round(img.naturalHeight * s));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const x = c.getContext("2d")!;
      x.fillStyle = "#fff";
      x.fillRect(0, 0, w, h);
      x.imageSmoothingQuality = "high";
      x.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.82);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode failed"));
    };
    img.src = url;
  });
}
