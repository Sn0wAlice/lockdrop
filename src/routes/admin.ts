import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { File, Folder, ShareLink } from '../models';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

const router = Router();
router.use(requireAuth);

// Helper: get breadcrumb path
async function getBreadcrumbs(folderId: number | null): Promise<{ id: number; uuid: string; name: string }[]> {
  const crumbs: { id: number; uuid: string; name: string }[] = [];
  let currentId = folderId;
  while (currentId) {
    const folder = await Folder.findByPk(currentId);
    if (!folder) break;
    crumbs.unshift({ id: folder.id, uuid: folder.uuid, name: folder.name });
    currentId = folder.parentId;
  }
  return crumbs;
}

// Helper: get all files in a folder recursively
async function getAllFilesInFolder(folderId: number): Promise<any[]> {
  const files = await File.findAll({ where: { folderId } });
  const subfolders = await Folder.findAll({ where: { parentId: folderId } });
  let allFiles = [...files];
  for (const sub of subfolders) {
    const subFiles = await getAllFilesInFolder(sub.id);
    allFiles = [...allFiles, ...subFiles];
  }
  return allFiles;
}

// Helper: delete folder recursively
async function deleteFolderRecursive(folderId: number) {
  const uploadDir = process.env.UPLOAD_DIR || './uploads';
  const files = await File.findAll({ where: { folderId } });
  for (const file of files) {
    const filePath = path.join(uploadDir, file.storedName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await ShareLink.destroy({ where: { fileId: file.id } });
    await file.destroy();
  }
  const subfolders = await Folder.findAll({ where: { parentId: folderId } });
  for (const sub of subfolders) {
    await deleteFolderRecursive(sub.id);
  }
  await ShareLink.destroy({ where: { folderId } });
  await Folder.destroy({ where: { id: folderId } });
}

// Dashboard
router.get('/', async (req: Request, res: Response) => {
  const folderUuid = req.query.folder as string | undefined;
  let currentFolder: any = null;
  let folderId: number | null = null;

  if (folderUuid) {
    currentFolder = await Folder.findOne({ where: { uuid: folderUuid } });
    if (!currentFolder) return res.redirect('/admin');
    folderId = currentFolder.id;
  }

  const folders = await Folder.findAll({
    where: { parentId: folderId },
    order: [['name', 'ASC']],
  });

  const files = await File.findAll({
    where: { folderId },
    order: [['originalName', 'ASC']],
  });

  const shareLinks = await ShareLink.findAll({
    include: [
      { model: File, as: 'file' },
      { model: Folder, as: 'folder' },
    ],
    order: [['createdAt', 'DESC']],
  });

  const breadcrumbs = await getBreadcrumbs(folderId);
  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;

  res.render('admin/dashboard', {
    folders,
    files,
    shareLinks,
    currentFolder,
    breadcrumbs,
    appUrl,
    csrfToken: (req.session as any).csrfToken,
  });
});

// Upload files
router.post('/upload', upload.array('files', 100), async (req: Request, res: Response) => {
  const multerFiles = req.files as Express.Multer.File[];
  if (!multerFiles || multerFiles.length === 0) {
    return res.status(400).json({ error: 'No files provided' });
  }

  const folderId = req.body.folderId ? parseInt(req.body.folderId, 10) : null;

  // Handle relative paths (folder upload via webkitdirectory)
  const relativePaths: string[] = req.body.relativePaths
    ? (Array.isArray(req.body.relativePaths) ? req.body.relativePaths : [req.body.relativePaths])
    : [];

  const folderCache = new Map<string, number>();

  const created = [];
  for (let i = 0; i < multerFiles.length; i++) {
    const f = multerFiles[i];
    let targetFolderId = folderId;

    // If file has a relative path, create folder structure
    if (relativePaths[i]) {
      const parts = relativePaths[i].split('/').filter(Boolean);
      parts.pop(); // Remove filename

      let parentId = folderId;
      let pathSoFar = '';
      for (const part of parts) {
        pathSoFar += '/' + part;
        const cacheKey = `${parentId}:${pathSoFar}`;
        if (folderCache.has(cacheKey)) {
          parentId = folderCache.get(cacheKey)!;
        } else {
          let folder = await Folder.findOne({ where: { name: part, parentId } });
          if (!folder) {
            folder = await Folder.create({ uuid: uuidv4(), name: part, parentId });
          }
          folderCache.set(cacheKey, folder.id);
          parentId = folder.id;
        }
      }
      targetFolderId = parentId;
    }

    const file = await File.create({
      uuid: uuidv4(),
      originalName: f.originalname,
      storedName: f.filename,
      mimeType: f.mimetype,
      size: f.size,
      folderId: targetFolderId,
    });
    created.push(file);
  }

  res.json({ success: true, count: created.length });
});

// Create folder
router.post('/folders', async (req: Request, res: Response) => {
  const { name, parentId } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Folder name is required' });
  }

  const folder = await Folder.create({
    uuid: uuidv4(),
    name: name.trim(),
    parentId: parentId ? parseInt(parentId, 10) : null,
  });

  res.json({ success: true, folder });
});

// Delete folder
router.delete('/folders/:uuid', async (req: Request, res: Response) => {
  const folder = await Folder.findOne({ where: { uuid: req.params.uuid } });
  if (!folder) return res.status(404).json({ error: 'Folder not found' });

  await deleteFolderRecursive(folder.id);
  res.json({ success: true });
});

// Delete file
router.delete('/files/:uuid', async (req: Request, res: Response) => {
  const file = await File.findOne({ where: { uuid: req.params.uuid } });
  if (!file) return res.status(404).json({ error: 'File not found' });

  const uploadDir = process.env.UPLOAD_DIR || './uploads';
  const filePath = path.join(uploadDir, file.storedName);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  await ShareLink.destroy({ where: { fileId: file.id } });
  await file.destroy();
  res.json({ success: true });
});

// Create share link
router.post('/share', async (req: Request, res: Response) => {
  const { name, password, expiresIn, maxDownloads, fileId, folderId } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }
  if (!fileId && !folderId) {
    return res.status(400).json({ error: 'Select a file or folder to share' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const uuid = crypto.randomBytes(8).toString('hex');

  const hours = parseInt(expiresIn || '24', 10);
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

  const shareLink = await ShareLink.create({
    uuid,
    name: name || 'Shared files',
    passwordHash,
    expiresAt,
    maxDownloads: maxDownloads ? parseInt(maxDownloads, 10) : null,
    fileId: fileId ? parseInt(fileId, 10) : null,
    folderId: folderId ? parseInt(folderId, 10) : null,
  });

  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  res.json({
    success: true,
    link: `${appUrl}/s/${shareLink.uuid}`,
    shareLink,
  });
});

// Delete share link
router.delete('/share/:uuid', async (req: Request, res: Response) => {
  const link = await ShareLink.findOne({ where: { uuid: req.params.uuid } });
  if (!link) return res.status(404).json({ error: 'Share link not found' });

  await link.destroy();
  res.json({ success: true });
});

// Toggle share link active
router.patch('/share/:uuid/toggle', async (req: Request, res: Response) => {
  const link = await ShareLink.findOne({ where: { uuid: req.params.uuid } });
  if (!link) return res.status(404).json({ error: 'Share link not found' });

  link.isActive = !link.isActive;
  await link.save();
  res.json({ success: true, isActive: link.isActive });
});

export default router;
