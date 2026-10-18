import { Schema, model, Document, Types } from 'mongoose';

export interface IPrivateDetail extends Document {
  _id: Types.ObjectId;
  item: Types.ObjectId;
  encryptedCiphertext: string;
  iv: string;
  authTag: string;
  fieldsSummary: string[];
  lastDecryptedBy?: Types.ObjectId;
  lastDecryptedAt?: Date;
  accessCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const privateDetailSchema = new Schema<IPrivateDetail>(
  {
    item: {
      type: Schema.Types.ObjectId,
      ref: 'Item',
      required: true,
      unique: true,
      index: true,
    },
    encryptedCiphertext: {
      type: String,
      required: true,
    },
    iv: {
      type: String,
      required: true,
      length: 24, // 12 bytes in hex
    },
    authTag: {
      type: String,
      required: true,
      length: 32, // 16 bytes in hex
    },
    fieldsSummary: {
      type: [String],
      default: [],
    },
    lastDecryptedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    lastDecryptedAt: {
      type: Date,
    },
    accessCount: {
      type: Number,
      default: 0,
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

export const PrivateDetail = model<IPrivateDetail>('PrivateDetail', privateDetailSchema);
