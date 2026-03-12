import { Router, Request, Response } from 'express';
import { File, Folder, ShareLink } from '../models';
import { sharePasswordRateLimit } from '../middleware/security';
import bcrypt from 'bcrypt';
import path from 'path';
import fs from 'fs';
import archiver from 'archiver';

const router = Router();

// Helper: get all files in folder recursively
async function getAllFilesInFolder(
  folderId: number,
  basePath: string = ''
): Promise<{ file: any; relativePath: string }[]> {
  const folder = await Folder.findByPk(folderId);
  if (!folder) return [];

  const currentPath = basePath ? `${basePath}/${folder.name}` : folder.name;
  const files = await File.findAll({ where: { folderId } });
  let result = files.map((f) => ({
    file: f,
    relativePath: `${currentPath}/${f.originalName}`,
  }));

  const subfolders = await Folder.findAll({ where: { parentId: folderId } });
  for (const sub of subfolders) {
    const subFiles = await getAllFilesInFolder(sub.id, currentPath);
    result = [...result, ...subFiles];
  }

  return result;
}

// Share link access page
router.get('/:uuid', async (req: Request, res: Response) => {
  const link = await ShareLink.findOne({
    where: { uuid: req.params.uuid },
    include: [
      { model: File, as: 'file' },
      { model: Folder, as: 'folder' },
    ],
  });

  if (!link) {
    return res.status(404).render('share/access', {
      error: 'This link does not exist.',
      link: null,
      csrfToken: (req.session as any).csrfToken,
    });
  }

  if (!link.isActive) {
    return res.status(410).render('share/access', {
      error: 'This link has been deactivated.',
      link: null,
      csrfToken: (req.session as any).csrfToken,
    });
  }

  if (link.isExpired) {
    return res.status(410).render('share/access', {
      error: 'This link has expired.',
      link: null,
      csrfToken: (req.session as any).csrfToken,
    });
  }

  if (link.isMaxedOut) {
    return res.status(410).render('share/access', {
      error: 'This link has reached its download limit.',
      link: null,
      csrfToken: (req.session as any).csrfToken,
    });
  }

  // Already authenticated in this session?
  if ((req.session as any)?.[`share_${link.uuid}`]) {
    return renderDownloadPage(req, res, link);
  }

  res.render('share/access', {
    error: null,
    link: { uuid: link.uuid, name: link.name },
    csrfToken: (req.session as any).csrfToken,
  });
});

// Verify password
router.post('/:uuid', sharePasswordRateLimit, async (req: Request, res: Response) => {
  const link = await ShareLink.findOne({
    where: { uuid: req.params.uuid },
    include: [
      { model: File, as: 'file' },
      { model: Folder, as: 'folder' },
    ],
  });

  if (!link || !link.isActive || link.isExpired || link.isMaxedOut) {
    return res.status(404).render('share/access', {
      error: 'This link is no longer available.',
      link: null,
      csrfToken: (req.session as any).csrfToken,
    });
  }

  const valid = await bcrypt.compare(req.body.password || '', link.passwordHash);
  if (!valid) {
    return res.render('share/access', {
      error: 'Incorrect password.',
      link: { uuid: link.uuid, name: link.name },
      csrfToken: (req.session as any).csrfToken,
    });
  }

  (req.session as any)[`share_${link.uuid}`] = true;
  return renderDownloadPage(req, res, link);
});

// Download individual file
router.get('/:uuid/download/:fileUuid', async (req: Request, res: Response) => {
  const link = await ShareLink.findOne({ where: { uuid: req.params.uuid } });
  if (!link || !link.isActive || link.isExpired || link.isMaxedOut) {
    return res.status(404).send('Link unavailable');
  }

  if (!(req.session as any)?.[`share_${link.uuid}`]) {
    return res.redirect(`/s/${link.uuid}`);
  }

  const file = await File.findOne({ where: { uuid: req.params.fileUuid } });
  if (!file) return res.status(404).send('File not found');

  // Verify file belongs to this share
  if (link.fileId && file.id !== link.fileId) {
    return res.status(403).send('Access denied');
  }
  if (link.folderId) {
    // Check file is in the shared folder tree
    const allFiles = await getAllFilesInFolder(link.folderId);
    const found = allFiles.find((f) => f.file.id === file.id);
    if (!found) return res.status(403).send('Access denied');
  }

  link.downloadCount += 1;
  await link.save();

  const uploadDir = process.env.UPLOAD_DIR || './uploads';
  const filePath = path.join(uploadDir, file.storedName);
  if (!fs.existsSync(filePath)) return res.status(404).send('File not found on disk');

  res.download(filePath, file.originalName);
});

// Download all as ZIP
router.get('/:uuid/download-zip', async (req: Request, res: Response) => {
  const link = await ShareLink.findOne({
    where: { uuid: req.params.uuid },
    include: [
      { model: File, as: 'file' },
      { model: Folder, as: 'folder' },
    ],
  });

  if (!link || !link.isActive || link.isExpired || link.isMaxedOut) {
    return res.status(404).send('Link unavailable');
  }

  if (!(req.session as any)?.[`share_${link.uuid}`]) {
    return res.redirect(`/s/${link.uuid}`);
  }

  const uploadDir = process.env.UPLOAD_DIR || './uploads';
  const archive = archiver('zip', { zlib: { level: 5 } });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${link.name.replace(/[^a-zA-Z0-9-_. ]/g, '')}.zip"`);
  archive.pipe(res);

  if (link.fileId && link.file) {
    const filePath = path.join(uploadDir, link.file.storedName);
    if (fs.existsSync(filePath)) {
      archive.file(filePath, { name: link.file.originalName });
    }
  } else if (link.folderId) {
    const allFiles = await getAllFilesInFolder(link.folderId);
    for (const { file, relativePath } of allFiles) {
      const filePath = path.join(uploadDir, file.storedName);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: relativePath });
      }
    }
  }

  link.downloadCount += 1;
  await link.save();

  await archive.finalize();
});

// Helper: render download page
async function renderDownloadPage(req: Request, res: Response, link: any) {
  let files: any[] = [];
  let folderName = '';

  if (link.fileId && link.file) {
    files = [{ file: link.file, relativePath: link.file.originalName }];
    folderName = link.file.originalName;
  } else if (link.folderId) {
    files = await getAllFilesInFolder(link.folderId);
    const folder = await Folder.findByPk(link.folderId);
    folderName = folder?.name || 'Files';
  }

  res.render('share/download', {
    link: {
      uuid: link.uuid,
      name: link.name,
      expiresAt: link.expiresAt,
      downloadCount: link.downloadCount,
      maxDownloads: link.maxDownloads,
    },
    files,
    folderName,
    isFolder: !!link.folderId,
  });
}

export default router;
