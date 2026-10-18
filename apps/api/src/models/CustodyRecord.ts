import { Schema, model, Document, Types } from 'mongoose';
import { CustodyAction } from '../constants/enums';

export interface ICustodyRecord extends Document {
  _id: Types.ObjectId;
  item: Types.ObjectId;
  action: CustodyAction;
  fromLocation?: string;
  toLocation: string;
  lockerReference?: string;
  evidenceReference?: string;
  handledBy: Types.ObjectId;
  remarks?: string;
  timestamp: Date;
}

const custodyRecordSchema = new Schema<ICustodyRecord>(
  {
    item: {
      type: Schema.Types.ObjectId,
      ref: 'Item',
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: Object.values(CustodyAction),
      required: true,
      index: true,
    },
    fromLocation: {
      type: String,
      trim: true,
    },
    toLocation: {
      type: String,
      required: true,
      trim: true,
    },
    lockerReference: {
      type: String,
      trim: true,
    },
    evidenceReference: {
      type: String,
      trim: true,
    },
    handledBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    remarks: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
    toJSON: {
      transform: (_, ret) => {
        delete (ret as Record<string, unknown>).__v;
        return ret;
      },
    },
  }
);

custodyRecordSchema.index({ item: 1, timestamp: -1 });

export const CustodyRecord = model<ICustodyRecord>('CustodyRecord', custodyRecordSchema);
