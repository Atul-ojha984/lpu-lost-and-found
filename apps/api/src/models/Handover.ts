import { Schema, model, Document, Types } from 'mongoose';

export interface IHandover extends Document {
  _id: Types.ObjectId;
  item: Types.ObjectId;
  claim: Types.ObjectId;
  recipient: Types.ObjectId;
  supervisingOfficer: Types.ObjectId;
  otpHash: string;
  otpExpiresAt: Date;
  otpAttemptsCount: number;
  physicalDeskLocation: string;
  idCardPresentedType: string;
  idCardNumberMasked: string;
  recipientSignatureUrl?: string;
  acknowledgementNotes?: string;
  proofEvidenceUrl?: string;
  isCompleted: boolean;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const handoverSchema = new Schema<IHandover>(
  {
    item: {
      type: Schema.Types.ObjectId,
      ref: 'Item',
      required: true,
      index: true,
    },
    claim: {
      type: Schema.Types.ObjectId,
      ref: 'Claim',
      required: true,
      index: true,
    },
    recipient: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    supervisingOfficer: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    otpHash: {
      type: String,
      required: true,
      select: false, // Never expose in queries
    },
    otpExpiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    otpAttemptsCount: {
      type: Number,
      default: 0,
    },
    physicalDeskLocation: {
      type: String,
      required: true,
      trim: true,
    },
    idCardPresentedType: {
      type: String,
      required: true,
      trim: true,
    },
    idCardNumberMasked: {
      type: String,
      required: true,
      trim: true,
    },
    recipientSignatureUrl: {
      type: String,
      trim: true,
    },
    acknowledgementNotes: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    proofEvidenceUrl: {
      type: String,
      trim: true,
    },
    isCompleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    completedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_, ret) => {
        delete (ret as Record<string, unknown>).otpHash;
        delete (ret as Record<string, unknown>).__v;
        return ret;
      },
    },
  }
);

export const Handover = model<IHandover>('Handover', handoverSchema);
