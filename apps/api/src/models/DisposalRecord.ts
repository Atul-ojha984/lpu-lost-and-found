import { Schema, model, Document, Types } from 'mongoose';
import { DisposalMethod } from '../constants/enums';

export interface IDisposalRecord extends Document {
  _id: Types.ObjectId;
  item: Types.ObjectId;
  method: DisposalMethod;
  approvedBy: Types.ObjectId;
  committeeNotes: string;
  reason?: string;
  recipientOrganization?: string;
  disposalDate: Date;
  certificateUrl?: string;
  evidenceReference?: string;
  createdAt: Date;
  updatedAt: Date;
}

const disposalRecordSchema = new Schema<IDisposalRecord>(
  {
    item: {
      type: Schema.Types.ObjectId,
      ref: 'Item',
      required: true,
      unique: true,
      index: true,
    },
    method: {
      type: String,
      enum: Object.values(DisposalMethod),
      required: true,
      index: true,
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    committeeNotes: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    recipientOrganization: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    disposalDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    certificateUrl: {
      type: String,
      trim: true,
    },
    evidenceReference: {
      type: String,
      trim: true,
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

export const DisposalRecord = model<IDisposalRecord>('DisposalRecord', disposalRecordSchema);
