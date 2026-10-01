import express from 'express';
import { submitJobApplication } from '../controllers/jobController.js';

const router = express.Router();

router.post('/apply-job', submitJobApplication);

export default router;
