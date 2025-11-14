import mongoose, { Document, Schema } from 'mongoose';

/**
 * Contact Submission Model
 * Stores contact form submissions from the contact page
 */
export interface IContactSubmission extends Document {
  // Basic Information
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  
  // Contact Details
  subject: string;
  message: string;
  
  // Status and Processing
  status: 'new' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignedTo?: mongoose.Types.ObjectId;
  adminNotes?: string;
  response?: string;
  respondedAt?: Date;
  respondedBy?: mongoose.Types.ObjectId;
  
  // Metadata
  submittedAt: Date;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ContactSubmissionSchema = new Schema<IContactSubmission>({
  // Basic Information
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [100, 'First name cannot be more than 100 characters'],
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [100, 'Last name cannot be more than 100 characters'],
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email'],
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    maxlength: [20, 'Phone number cannot be more than 20 characters'],
  },
  
  // Contact Details
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    trim: true,
    maxlength: [200, 'Subject cannot be more than 200 characters'],
  },
  message: {
    type: String,
    required: [true, 'Message is required'],
    trim: true,
    maxlength: [2000, 'Message cannot be more than 2000 characters'],
  },
  
  // Status and Processing
  status: {
    type: String,
    enum: ['new', 'in_progress', 'resolved', 'closed'],
    default: 'new',
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
  },
  assignedTo: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  adminNotes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Admin notes cannot be more than 1000 characters'],
  },
  response: {
    type: String,
    trim: true,
    maxlength: [2000, 'Response cannot be more than 2000 characters'],
  },
  respondedAt: {
    type: Date,
  },
  respondedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  
  // Metadata
  submittedAt: {
    type: Date,
    default: Date.now,
  },
  ipAddress: {
    type: String,
    trim: true,
    maxlength: [45, 'IP address cannot be more than 45 characters'],
  },
  userAgent: {
    type: String,
    trim: true,
    maxlength: [500, 'User agent cannot be more than 500 characters'],
  },
}, {
  timestamps: true,
});

// Indexes for better query performance
ContactSubmissionSchema.index({ status: 1 });
ContactSubmissionSchema.index({ priority: 1 });
ContactSubmissionSchema.index({ submittedAt: -1 });
ContactSubmissionSchema.index({ email: 1 });
ContactSubmissionSchema.index({ assignedTo: 1 });
ContactSubmissionSchema.index({ subject: 1 });
ContactSubmissionSchema.index({ firstName: 1, lastName: 1 });

export default mongoose.models.ContactSubmission || mongoose.model<IContactSubmission>('ContactSubmission', ContactSubmissionSchema);
