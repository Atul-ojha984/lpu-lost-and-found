import { Schema, model, Document, Types } from 'mongoose';
import { ClaimStatus } from '../constants/enums';

export interface IClaim extends Document {
  _id: Types.ObjectId;
  item: Types.ObjectId;
  claimant: Types.ObjectId;
  claimStatus: ClaimStatus;
  statement: string;
  challengeAnswers: {
    challenge: Types.ObjectId;
    providedAnswer: string;
    isCorrect?: boolean;
  }[];
  privateEvidenceProofUrls: string[];
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  reviewNotes?: string;
  rejectionReason?: string;
  handoverOtp?: string;
  handoverOtpCipher?: string;
  handoverOtpIv?: string;
  handoverOtpTag?: string;
  handoverOtpExpiresAt?: Date;
  verificationAttemptsCount: number;
  handoverRecord?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const claimSchema = new Schema<IClaim>(
  {
    item: {
      type: Schema.Types.ObjectId,
      ref: 'Item',
      required: true,
      index: true,
    },
    claimant: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    claimStatus: {
      type: String,
      enum: Object.values(ClaimStatus),
      default: ClaimStatus.SUBMITTED,
      index: true,
    },
    statement: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    challengeAnswers: [
      {
        challenge: {
          type: Schema.Types.ObjectId,
          ref: 'VerificationChallenge',
          required: true,
        },
        providedAnswer: {
          type: String,
          required: true,
          trim: true,
        },
        isCorrect: {
          type: Boolean,
        },
      },
    ],
    privateEvidenceProofUrls: {
      type: [String],
      default: [],
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewedAt: {
      type: Date,
    },
    reviewNotes: {
      type: String,
      trim: true,
    },
    rejectionReason: {
      type: String,
      trim: true,
    },
    handoverOtp: {
      type: String,
      trim: true,
    },
    handoverOtpCipher: {
      type: String,
    },
    handoverOtpIv: {
      type: String,
    },
    handoverOtpTag: {
      type: String,
    },
    handoverOtpExpiresAt: {
      type: Date,
    },
    verificationAttemptsCount: {
      type: Number,
      default: 0,
    },
    handoverRecord: {
      type: Schema.Types.ObjectId,
      ref: 'Handover',
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

claimSchema.index({ item: 1, claimant: 1 });
claimSchema.index({ claimStatus: 1, createdAt: -1 });

export const Claim = model<IClaim>('Claim', claimSchema);
