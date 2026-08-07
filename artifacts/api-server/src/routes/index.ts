import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminRouter from "./admin";
import visitorsRouter from "./visitors";
import postCooldownRouter from "./postCooldown";
import schedulerRouter from "./scheduler";
import jobsRouter from "./jobs";
import coupangRouter from "./coupang";
import pushRouter from "./push";
import subscribeRouter from "./subscribe";
import threadsImageRouter from "./threadsImage";
import wageRatesRouter from "./wageRates";
import siteNewsRouter from "./siteNews";

const router: IRouter = Router();

router.use(healthRouter);
router.use(adminRouter);
router.use(visitorsRouter);
router.use(postCooldownRouter);
router.use(schedulerRouter);
router.use(jobsRouter);
router.use(coupangRouter);
router.use(pushRouter);
router.use(subscribeRouter);
router.use(threadsImageRouter);
router.use(wageRatesRouter);
router.use(siteNewsRouter);

export default router;
