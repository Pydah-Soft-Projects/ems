import mongoose from 'mongoose';
import { config } from '../config';

const hrmsUserSchema = new mongoose.Schema(
  {
    email: { type: String, lowercase: true, trim: true },
    password: { type: String, select: false },
    role: String,
    roles: [String],
    name: String,
    isActive: Boolean,
    status: String,
  },
  { collection: config.hrms.usersCollection, strict: false },
);

export const HrmsUserModel =
  mongoose.models.HrmsUser ||
  mongoose.model('HrmsUser', hrmsUserSchema);

export async function connectHrmsMongo() {
  if (!config.hrms.mongodbUri) {
    throw new Error('HRMS_MONGODB_URI is not configured');
  }
  await mongoose.connect(config.hrms.mongodbUri);
  return mongoose.connection;
}

export async function disconnectHrmsMongo() {
  await mongoose.disconnect();
}
