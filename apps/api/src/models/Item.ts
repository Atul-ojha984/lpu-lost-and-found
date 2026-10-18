import { Schema, model, Document, Types } from 'mongoose';
import { ItemType, ItemStatus } from '../constants/enums';

export interface IItem extends Document {
  _id: Types.ObjectId;
  referenceNumber: string;
  itemType: ItemType;
  title: string;
  publicDescription: string;
  category: Types.ObjectId;
  location: Types.ObjectId;
  specificLocation: string;
  eventDate: Date;
  primaryImageUrl?: string;
  additionalImages?: string[];
  status: ItemStatus;
  reportedBy: Types.ObjectId;
  currentCustodyDesk?: string;
  lockerStorageReference?: string;
  retentionExpiresAt: Date;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const itemSchema = new Schema<IItem>(
  {
    referenceNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    itemType: {
      type: String,
      enum: Object.values(ItemType),
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    publicDescription: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: 'ItemCategory',
      required: true,
      index: true,
    },
    location: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      required: true,
      index: true,
    },
    specificLocation: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    eventDate: {
      type: Date,
      required: true,
      index: true,
    },
    primaryImageUrl: {
      type: String,
      trim: true,
    },
    additionalImages: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: Object.values(ItemStatus),
      default: ItemStatus.REPORTED,
      index: true,
    },
    reportedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    currentCustodyDesk: {
      type: String,
      trim: true,
    },
    lockerStorageReference: {
      type: String,
      trim: true,
    },
    retentionExpiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
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

itemSchema.index({ status: 1, itemType: 1 });
itemSchema.index({ category: 1, location: 1 });
itemSchema.index({ createdAt: -1 });

export const Item = model<IItem>('Item', itemSchema);
