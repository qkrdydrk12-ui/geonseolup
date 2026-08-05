import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminRouter from "./admin";
import visitorsRouter from "./visitors";
import postCooldownRouter from "./postCooldown";
import schedulerRouter from "./scheduler";
import jobsRouter from "./jobs";
import coupangRouter from "./coupang";
import indexingRouter from "./indexing";
import pushRouter from "./push";
import subscribeRouter from "./subscribe";
import infoRouter from "./info";

const router: IRouter = Router();

router.use(healthRouter);
router.use(adminRouter);
router.use(visitorsRouter);
router.use(postCooldownRouter);
router.use(schedulerRouter);
router.use(jobsRouter);
router.use(coupangRouter);
router.use(indexingRouter);
router.use(pushRouter);
router.use(subscribeRouter);
router.use(infoRouter);

export default router;
