import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const uploadDir = process.env.UPLOAD_DIR || './uploads';
const maxSize = parseInt(process.env.MAX_FILE_SIZE_MB || '500', 10) * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, _file, cb) => {
    const ext = path.extname(_file.originalname);
    cb(null, uuidv4() + ext);
  },
});

export const upload = multer({
  storage,
  limits: {
    fileSize: maxSize,
  },
});
