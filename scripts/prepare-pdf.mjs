import { copyFile } from "node:fs/promises";
await copyFile(
  new URL(import.meta.resolve("pdfjs-dist/build/pdf.worker.min.mjs")),
  new URL("../public/pdf.worker.min.mjs", import.meta.url),
);
