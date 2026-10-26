import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chatRouter from "./chat";
import authRouter from "./auth";
import adminRouter from "./admin";
import notificationsRouter from "./notifications";

const router: IRouter = Router();

router.use(healthRouter);
router.use(chatRouter);
router.use(authRouter);
router.use(adminRouter);
router.use(notificationsRouter);

export default router;
