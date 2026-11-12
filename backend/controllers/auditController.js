
import mongoose from 'mongoose';
import { createHash } from 'node:crypto';

import Brand from '../models/Brand.js';
import Audit from '../models/Audit.js';

import {
  analyzeContent,
  analyzeFile
} from '../services/auditService.js';

const ALLOWED_CHANNELS = [
  'general',
  'social_media',
  'email',
  'website',
  'advertisement',
  'campaign'
];

const ALLOWED_REVIEWER_ROLES = [
  'admin',
  'reviewer',
  'viewer'
];

// Validate uploaded file signatures
function isValidFileSignature(file) {
  const buffer = file.buffer;

  if (file.mimetype === 'image/jpeg') {
    return buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff;
  }

  if (file.mimetype === 'image/png') {
    return buffer.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    );
  }

  if (file.mimetype === 'image/webp') {
    return buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP';
  }

  if (file.mimetype === 'application/pdf') {
    return buffer.toString('ascii', 0, 5) === '%PDF-';
  }

  return false;
}

// Create a new content audit
export async function auditContent(req, res, next) {
  try {
    const { brandId, content } = req.body;
    const file = req.file;

    if (!mongoose.isValidObjectId(brandId)) {
      return res.status(400).json({
        success: false,
        message: 'A valid brandId is required.'
      });
    }

    const channel = req.body.channel || 'general';

    if (!ALLOWED_CHANNELS.includes(channel)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid content channel.'
      });
    }

    if (!file && (
      typeof content !== 'string' ||
      !content.trim()
    )) {
      return res.status(400).json({
        success: false,
        message: 'Enter content or upload an image/PDF.'
      });
    }

    if (!file && content.length > 20000) {
      return res.status(400).json({
        success: false,
        message: 'Content must be 20,000 characters or fewer.'
      });
    }

    if (file && !isValidFileSignature(file)) {
      return res.status(400).json({
        success: false,
        message: 'The uploaded file does not match its file type.'
      });
    }

    const brand = await Brand.findById(brandId);

    if (!brand) {
      return res.status(404).json({
        success: false,
        message: 'Brand not found.'
      });
    }

    let result;
    let sourceType = 'text';
    let submittedContent = content?.trim() || '';

    const fileMetadata = {};

    if (file) {
      sourceType =
        file.mimetype === 'application/pdf'
          ? 'pdf'
          : 'image';

      result = await analyzeFile(brand, file, channel);

      const safeFileName =
        file.originalname.split(/[\\/]/).pop().slice(0, 200);

      Object.assign(fileMetadata, {
        fileName: safeFileName,
        mimeType: file.mimetype,
        fileSize: file.size,
        fileHash: createHash('sha256')
          .update(file.buffer)
          .digest('hex')
      });

      submittedContent = `Uploaded ${sourceType}: ${safeFileName}`;

    } else {
      result = await analyzeContent(
        brand,
        submittedContent,
        channel
      );
    }

    const audit = await Audit.create({
      brand: brand._id,
      sourceType,
      channel,
      submittedContent,
      ...fileMetadata,
      overallStatus: result.overallStatus,
      summary: result.summary,
      findings: result.findings
    });

    return res.status(201).json({
      success: true,
      message: 'Content audit completed.',
      audit
    });

  } catch (error) {
    return next(error);
  }
}

// Get audit history
export async function getAudits(req, res, next) {
  try {
    const filter = {};

    if (req.query.brandId) {
      if (!mongoose.isValidObjectId(req.query.brandId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid brandId.'
        });
      }

      filter.brand = req.query.brandId;
    }

    const audits = await Audit.find(filter)
      .populate('brand', 'name')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.json({
      success: true,
      count: audits.length,
      audits
    });

  } catch (error) {
    return next(error);
  }
}

// Get one audit by ID
export async function getAuditById(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.auditId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid audit ID.'
      });
    }

    const audit = await Audit.findById(req.params.auditId)
      .populate('brand', 'name');

    if (!audit) {
      return res.status(404).json({
        success: false,
        message: 'Audit not found.'
      });
    }

    return res.json({
      success: true,
      audit
    });

  } catch (error) {
    return next(error);
  }
}

// Approve or reject a finding and record review history
export async function reviewFinding(req, res, next) {
  try {
    const { auditId, findingId } = req.params;

    const {
      decision,
      reviewerName,
      reviewerRole,
      note = ''
    } = req.body;

    if (!mongoose.isValidObjectId(auditId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid audit ID.'
      });
    }

    if (!mongoose.isValidObjectId(findingId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid finding ID.'
      });
    }

    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({
        success: false,
        message: 'Decision must be approved or rejected.'
      });
    }

    if (
      typeof reviewerName !== 'string' ||
      !reviewerName.trim() ||
      reviewerName.trim().length > 80
    ) {
      return res.status(400).json({
        success: false,
        message: 'A valid reviewer name is required (maximum 80 characters).'
      });
    }

    if (!ALLOWED_REVIEWER_ROLES.includes(reviewerRole)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reviewer role.'
      });
    }

    if (
      typeof note !== 'string' ||
      note.length > 500
    ) {
      return res.status(400).json({
        success: false,
        message: 'Review note must be 500 characters or fewer.'
      });
    }

    const audit = await Audit.findById(auditId);

    if (!audit) {
      return res.status(404).json({
        success: false,
        message: 'Audit not found.'
      });
    }

    const finding = audit.findings.id(findingId);

    if (!finding) {
      return res.status(404).json({
        success: false,
        message: 'Finding not found.'
      });
    }

    finding.reviewStatus = decision;

    finding.reviewHistory.push({
      decision,
      reviewerName: reviewerName.trim(),
      reviewerRole,
      note: note.trim(),
      reviewedAt: new Date()
    });

    await audit.save();

    return res.json({
      success: true,
      message: `Finding ${decision} successfully.`,
      audit
    });

  } catch (error) {
    return next(error);
  }
}

// Governance analytics dashboard
export async function getAuditAnalytics(req, res, next) {
  try {
    const [
      totalAudits,
      statusStats,
      channelStats,
      categoryStats,
      monthlyStats,
      reviewStats
    ] = await Promise.all([

      // Total audits
      Audit.countDocuments(),

      // Audit status breakdown
      Audit.aggregate([
        {
          $group: {
            _id: '$overallStatus',
            count: { $sum: 1 }
          }
        }
      ]),

      // Audits by channel
      // Older audits without a channel are counted as General
      Audit.aggregate([
        {
          $group: {
            _id: { $ifNull: ['$channel', 'general'] },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { count: -1 }
        }
      ]),

      // Violations by category and severity
      Audit.aggregate([
        { $unwind: '$findings' },
        {
          $group: {
            _id: '$findings.category',
            count: { $sum: 1 },
            highSeverity: {
              $sum: {
                $cond: [
                  { $eq: ['$findings.severity', 'high'] },
                  1,
                  0
                ]
              }
            }
          }
        },
        { $sort: { count: -1 } }
      ]),

      // Monthly audit trends
      Audit.aggregate([
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]),

      // Approval and rejection statistics
      Audit.aggregate([
        { $unwind: '$findings' },
        {
          $group: {
            _id: '$findings.reviewStatus',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    return res.json({
      success: true,
      analytics: {
        totalAudits,
        statusStats,
        channelStats,
        categoryStats,
        monthlyStats,
        reviewStats
      }
    });

  } catch (error) {
    return next(error);
  }
}
