import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminRouter from "./admin";
import visitorsRouter from "./visitors";
import postCooldownRouter from "./postCooldown";

const router: IRouter = Router();

router.use(healthRouter);
router.use(adminRouter);
router.use(visitorsRouter);
router.use(postCooldownRouter);

export default router;
