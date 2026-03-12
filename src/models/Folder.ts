import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface FolderAttributes {
  id: number;
  uuid: string;
  name: string;
  parentId: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface FolderCreationAttributes extends Optional<FolderAttributes, 'id' | 'parentId'> {}

class Folder extends Model<FolderAttributes, FolderCreationAttributes> implements FolderAttributes {
  public id!: number;
  public uuid!: string;
  public name!: string;
  public parentId!: number | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // Associations
  public children?: Folder[];
  public files?: any[];
  public parent?: Folder;
}

Folder.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    uuid: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      unique: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    parentId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'folders',
    timestamps: true,
  }
);

export default Folder;
