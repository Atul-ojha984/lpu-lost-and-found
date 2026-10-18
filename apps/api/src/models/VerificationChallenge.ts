import { Schema, model, Document, Types } from 'mongoose';

export interface IVerificationChallenge extends Document {
  _id: Types.ObjectId;
  item: Types.ObjectId;
  questionText: string;
  hashedAnswer: string;
  hint?: string;
  maxAttempts?: number;
  expiresAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const verificationChallengeSchema = new Schema<IVerificationChallenge>(
  {
    item: {
      type: Schema.Types.ObjectId,
      ref: 'Item',
      required: true,
      index: true,
    },
    questionText: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    hashedAnswer: {
      type: String,
      required: true,
      select: false, // Omit from default queries to prevent leakage
    },
    hint: {
      type: String,
      trim: true,
      maxlength: 150,
    },
    maxAttempts: {
      type: Number,
      default: 3,
    },
    expiresAt: {
      type: Date,
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
        delete (ret as Record<string, unknown>).hashedAnswer;
        delete (ret as Record<string, unknown>).__v;
        return ret;
      },
    },
  }
);

export const VerificationChallenge = model<IVerificationChallenge>(
  'VerificationChallenge',
  verificationChallengeSchema
);
