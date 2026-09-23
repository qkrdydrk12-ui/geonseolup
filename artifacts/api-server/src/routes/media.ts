import { Router, type IRouter } from "express";
import { Client } from "@replit/object-storage";

const router: IRouter = Router();
const client = new Client();

const ALLOWED_FILES = new Set(["app-install.mp4", "gongsu-alert.mp4"]);

router.get("/media/:filename", (req, res) => {
  const { filename } = req.params;
  if (!ALLOWED_FILES.has(filename)) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const stream = client.downloadAsStream(filename);
  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Cache-Control", "public, max-age=86400");
  stream.on("error", () => {
    if (!res.headersSent) res.status(404);
    res.end();
  });
  stream.pipe(res);
});

export default router;
