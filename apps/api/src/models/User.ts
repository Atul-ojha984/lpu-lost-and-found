import { Schema, model, Document, Types } from 'mongoose';
import { UserRole } from '../constants/enums';

export interface IUser extends Document {
  _id: Types.ObjectId;
  registrationNumber: string;
  email: string;
  fullName: string;
  passwordHash: string;
  role: UserRole;
  department?: string;
  securityPost?: string;
  phone?: string;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    registrationNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // Omit from default queries
    },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.STUDENT_STAFF,
      index: true,
    },
    department: {
      type: String,
      trim: true,
    },
    securityPost: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_, ret) => {
        delete (ret as Record<string, unknown>).passwordHash;
        delete (ret as Record<string, unknown>).__v;
        return ret;
      },
    },
  }
);

export const User = model<IUser>('User', userSchema);
