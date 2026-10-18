import { Schema, model, Document, Types } from 'mongoose';

export interface IItemCategory extends Document {
  _id: Types.ObjectId;
  code: string;
  name: string;
  description?: string;
  icon?: string;
  isActive: boolean;
  defaultRetentionDays: number;
  createdAt: Date;
  updatedAt: Date;
}

const itemCategorySchema = new Schema<IItemCategory>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    icon: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    defaultRetentionDays: {
      type: Number,
      default: 90,
      min: 1,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_, ret) => {
        delete (ret as Record<string, unknown>).__v;
        return ret;
      },
    },
  }
);

export const ItemCategory = model<IItemCategory>('ItemCategory', itemCategorySchema);
