
import mongoose from 'mongoose';

const findingSchema = new mongoose.Schema({
  category: {
    type: String,
    default: 'General'
  },

  severity: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },

  issue: {
    type: String,
    required: true
  },

  explanation: {
    type: String,
    required: true
  },

  guidelineReference: {
    type: String,
    default: 'No specific reference supplied'
  },

  // Exact brand reference that triggered the finding
  matchedReferenceType: {
    type: String,
    enum: [
      'rule',
      'approved_fact',
      'approved_term',
      'prohibited_term',
      'tone',
      'none'
    ],
    default: 'none'
  },

  matchedReferenceText: {
    type: String,
    default: ''
  },

  evidenceStatus: {
    type: String,
    enum: [
      'supported',
      'unsupported',
      'contradicted',
      'inconclusive'
    ],
    default: 'inconclusive'
  },

  // Relevant text from submitted content
  evidenceSnippet: {
    type: String,
    default: ''
  },

  // Qualitative indicator, not a statistical probability
  confidenceLevel: {
    type: String,
    enum: ['high', 'medium', 'low', 'uncertain'],
    default: 'uncertain'
  },

  originalText: {
    type: String,
    default: ''
  },

  suggestedCorrection: {
    type: String,
    default: ''
  },

  reviewStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },

  // Complete history of reviewer decisions
  reviewHistory: {
    type: [{
      decision: {
        type: String,
        enum: ['approved', 'rejected'],
        required: true
      },

      reviewerName: {
        type: String,
        required: true,
        maxlength: 80
      },

      reviewerRole: {
        type: String,
        enum: ['admin', 'reviewer', 'viewer'],
        required: true
      },

      note: {
        type: String,
        default: '',
        maxlength: 500
      },

      reviewedAt: {
        type: Date,
        default: Date.now
      }
    }],
    default: []
  }

}, { _id: true });


const auditSchema = new mongoose.Schema({
  brand: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Brand',
    required: true
  },

  // Content format
  sourceType: {
    type: String,
    enum: ['text', 'image', 'pdf'],
    default: 'text'
  },

  // Content publishing channel
  channel: {
    type: String,
    enum: [
      'general',
      'social_media',
      'email',
      'website',
      'advertisement',
      'campaign'
    ],
    default: 'general'
  },

  submittedContent: {
    type: String,
    default: '',
    maxlength: 20000
  },

  // Uploaded file metadata
  fileName: {
    type: String,
    default: ''
  },

  mimeType: {
    type: String,
    default: ''
  },

  fileSize: {
    type: Number,
    default: 0
  },

  fileHash: {
    type: String,
    default: ''
  },

  overallStatus: {
    type: String,
    enum: [
      'compliant',
      'needs_review',
      'non_compliant'
    ],
    required: true
  },

  summary: {
    type: String,
    required: true
  },

  findings: {
    type: [findingSchema],
    default: []
  }

}, { timestamps: true });


// Database indexes
auditSchema.index({ brand: 1, createdAt: -1 });
auditSchema.index({ channel: 1, createdAt: -1 });

export default mongoose.model('Audit', auditSchema);
