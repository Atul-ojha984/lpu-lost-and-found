import { Schema, model, Document, Types } from 'mongoose';

export interface IMatchSuggestion extends Document {
  _id: Types.ObjectId;
  lostItem: Types.ObjectId;
  foundItem: Types.ObjectId;
  matchScore: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  explanation: {
    categoryMatch: string;
    locationProximity: string;
    timeDelta: string;
    matchingTokens: string[];
  };
  status: 'PENDING' | 'ACCEPTED' | 'DISMISSED';
  reviewedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const matchSuggestionSchema = new Schema<IMatchSuggestion>(
  {
    lostItem: {
      type: Schema.Types.ObjectId,
      ref: 'Item',
      required: true,
      index: true,
    },
    foundItem: {
      type: Schema.Types.ObjectId,
      ref: 'Item',
      required: true,
      index: true,
    },
    matchScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      index: true,
    },
    confidence: {
      type: String,
      enum: ['HIGH', 'MEDIUM', 'LOW'],
      required: true,
    },
    explanation: {
      categoryMatch: { type: String, required: true },
      locationProximity: { type: String, required: true },
      timeDelta: { type: String, required: true },
      matchingTokens: { type: [String], default: [] },
    },
    status: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'DISMISSED'],
      default: 'PENDING',
      index: true,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
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

matchSuggestionSchema.index({ lostItem: 1, foundItem: 1 }, { unique: true });

export const MatchSuggestion = model<IMatchSuggestion>('MatchSuggestion', matchSuggestionSchema);
