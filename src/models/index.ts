import sequelize from '../config/database';
import File from './File';
import Folder from './Folder';
import ShareLink from './ShareLink';

// Folder self-reference
Folder.hasMany(Folder, { as: 'children', foreignKey: 'parentId' });
Folder.belongsTo(Folder, { as: 'parent', foreignKey: 'parentId' });

// File belongs to Folder
File.belongsTo(Folder, { as: 'folder', foreignKey: 'folderId' });
Folder.hasMany(File, { as: 'files', foreignKey: 'folderId' });

// ShareLink can point to a File or Folder
ShareLink.belongsTo(File, { as: 'file', foreignKey: 'fileId' });
ShareLink.belongsTo(Folder, { as: 'folder', foreignKey: 'folderId' });
File.hasMany(ShareLink, { as: 'shareLinks', foreignKey: 'fileId' });
Folder.hasMany(ShareLink, { as: 'shareLinks', foreignKey: 'folderId' });

export { sequelize, File, Folder, ShareLink };
