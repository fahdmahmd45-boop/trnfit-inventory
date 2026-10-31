// Builds fake-camera videos from the barcode labels the app itself generates (PNG download),
// so the scanner test proves generated labels ↔ scanner compatibility end to end.
import { test as setup, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const DIR = "tests/e2e/fixtures";

setup("render labels and camera videos", async ({ page }) => {
  setup.setTimeout(120_000);
  mkdirSync(DIR, { recursive: true });
  await page.goto("/barcodes");
  for (const sku of ["TRN-WWRAP-BLK", "TRN-WWRAP-OLV"]) {
    const row = page.locator("li", { hasText: sku });
    const [dl] = await Promise.all([page.waitForEvent("download"), row.getByRole("button", { name: "PNG" }).click()]);
    await dl.saveAs(`${DIR}/${sku}.png`);
  }
  // A portrait 720×1280 "phone camera" frame: label ~75% of frame width, slight rotation, blur and sensor noise.
  const frame = (png: string, out: string) => execFileSync("ffmpeg", ["-y", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=0x6b6b66:s=720x1280:r=15", "-loop", "1", "-i", png,
    "-filter_complex", "[1]scale=540:-1,rotate=2*PI/180:c=0x6b6b66,gblur=sigma=0.9[l];[0][l]overlay=(W-w)/2:(H-h)/2:shortest=1,noise=alls=10:allf=t",
    "-frames:v", "15", "-pix_fmt", "yuv420p", out]);
  frame(`${DIR}/TRN-WWRAP-BLK.png`, `${DIR}/blk.y4m`);
  frame(`${DIR}/TRN-WWRAP-OLV.png`, `${DIR}/olv.y4m`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0x6b6b66:s=720x1280:r=15", "-frames:v", "18", "-vf", "noise=alls=10:allf=t", "-pix_fmt", "yuv420p", `${DIR}/blank.y4m`]);
  // static: barcode permanently in view (3 s loop)
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-stream_loop", "2", "-i", `${DIR}/blk.y4m`, "-pix_fmt", "yuv420p", `${DIR}/static-blk.y4m`]);
  // sequence: BLK 1 s, blank 1.2 s, OLV 1 s, blank 1.2 s (loops)
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", `${DIR}/blk.y4m`, "-i", `${DIR}/blank.y4m`, "-i", `${DIR}/olv.y4m`, "-i", `${DIR}/blank.y4m`,
    "-filter_complex", "[0][1][2][3]concat=n=4:v=1:a=0", "-pix_fmt", "yuv420p", `${DIR}/sequence.y4m`]);
  expect(true).toBe(true);
});
