import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface ShareLinkAttributes {
  id: number;
  uuid: string;
  name: string;
  passwordHash: string;
  expiresAt: Date;
  maxDownloads: number | null;
  downloadCount: number;
  folderId: number | null;
  fileId: number | null;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface ShareLinkCreationAttributes
  extends Optional<ShareLinkAttributes, 'id' | 'downloadCount' | 'maxDownloads' | 'folderId' | 'fileId' | 'isActive'> {}

class ShareLink
  extends Model<ShareLinkAttributes, ShareLinkCreationAttributes>
  implements ShareLinkAttributes
{
  public id!: number;
  public uuid!: string;
  public name!: string;
  public passwordHash!: string;
  public expiresAt!: Date;
  public maxDownloads!: number | null;
  public downloadCount!: number;
  public folderId!: number | null;
  public fileId!: number | null;
  public isActive!: boolean;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // Associations
  public file?: any;
  public folder?: any;

  get isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  get isMaxedOut(): boolean {
    return this.maxDownloads !== null && this.downloadCount >= this.maxDownloads;
  }

  get isAccessible(): boolean {
    return this.isActive && !this.isExpired && !this.isMaxedOut;
  }
}

ShareLink.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    uuid: {
      type: DataTypes.STRING(16),
      unique: true,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    maxDownloads: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
    downloadCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    folderId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    fileId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    tableName: 'share_links',
    timestamps: true,
  }
);

export default ShareLink;
