import { Schema, model, Document, Types } from 'mongoose';
import { UserRole, AuditAction } from '../constants/enums';

export interface IAuditEntry extends Document {
  _id: Types.ObjectId;
  actor?: Types.ObjectId;
  actorRole: UserRole;
  action: AuditAction | string;
  targetEntity: string;
  targetId?: string;
  ipAddress: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

const auditEntrySchema = new Schema<IAuditEntry>(
  {
    actor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    actorRole: {
      type: String,
      enum: Object.values(UserRole),
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    targetEntity: {
      type: String,
      required: true,
      index: true,
    },
    targetId: {
      type: String,
      index: true,
    },
    ipAddress: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
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

auditEntrySchema.index({ timestamp: -1 });
auditEntrySchema.index({ actor: 1, action: 1 });

export const AuditEntry = model<IAuditEntry>('AuditEntry', auditEntrySchema);
