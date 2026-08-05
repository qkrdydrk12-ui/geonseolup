import { Router, type IRouter, type Request, type Response } from "express";
import { getDraftImage } from "../lib/threadsDrafts.js";

const router: IRouter = Router();

// GET /api/threads-image/:id — Threads 홍보 초안에 첨부된 생성 이미지를 서빙.
// 인증 없이 공개 접근 가능해야 한다 — 실제 Threads로 발행할 때 Threads
// 서버가 이 URL을 직접 fetch해서 이미지를 가져가기 때문 (image_url 파라미터).
router.get("/threads-image/:id", async (req: Request, res: Response) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) {
    res.status(400).send("invalid id");
    return;
  }
  const image = await getDraftImage(id);
  if (!image) {
    res.status(404).send("not found");
    return;
  }
  res.set("Content-Type", image.mime);
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  res.send(image.data);
});

export default router;
