import { Router } from 'express';
import {
  createReport,
  getItems,
  getItemById,
  updateItem,
  getMyReports,
  uploadImage,
  getCategories,
  getLocations,
} from '../controllers/item.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { imageUploadMiddleware } from '../services/image.service';
import { createItemSchema, updateItemSchema, queryItemsSchema } from '../schemas/item.schema';

const router = Router();

// 1. Reference Endpoints (Categories & Locations)
router.get('/categories', getCategories);
router.get('/locations', getLocations);

// 2. Public Board & Search
router.get('/items', validate({ query: queryItemsSchema }), getItems);

// 3. User Reports
router.get('/items/my-reports', authenticate, getMyReports);

// 4. Single Item Detail (Accessible endpoint)
router.get('/items/:id', getItemById);

// 5. Image Upload (Authenticated)
router.post(
  '/items/upload',
  authenticate,
  imageUploadMiddleware.single('image'),
  uploadImage
);

// 6. Create Report Endpoints
router.post('/items/lost', authenticate, validate({ body: createItemSchema }), createReport);
router.post('/items/found', authenticate, validate({ body: createItemSchema }), createReport);
router.post('/items', authenticate, validate({ body: createItemSchema }), createReport);

// 7. Update Eligible Report by Owner
router.patch('/items/:id', authenticate, validate({ body: updateItemSchema }), updateItem);

export const itemRoutes = router;
