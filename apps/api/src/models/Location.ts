import { Schema, model, Document, Types } from 'mongoose';

export interface ILocation extends Document {
  _id: Types.ObjectId;
  code: string;
  name: string;
  campusZone: string;
  buildingName?: string;
  hasSecurityDesk: boolean;
  securityContactPhone?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const locationSchema = new Schema<ILocation>(
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
    campusZone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    buildingName: {
      type: String,
      trim: true,
    },
    hasSecurityDesk: {
      type: Boolean,
      default: false,
    },
    securityContactPhone: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
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

export const Location = model<ILocation>('Location', locationSchema);
