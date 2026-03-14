import { AppStoreConnectClient } from '../services/index.js';
import { validateRequired, sanitizeLimit } from '../utils/index.js';

export interface ReviewSubmission {
  type: 'reviewSubmissions';
  id: string;
  attributes: {
    platform: string;
    submittedDate: string;
    state: string; // WAITING_FOR_REVIEW, IN_REVIEW, UNRESOLVED_ISSUES, COMPLETE, etc.
  };
  relationships?: Record<string, any>;
}

export interface ReviewSubmissionItem {
  type: 'reviewSubmissionItems';
  id: string;
  attributes: {
    state: string; // ACCEPTED, APPROVED, REJECTED, READY_FOR_REVIEW, etc.
    resolved?: boolean;
  };
  relationships?: {
    appStoreVersion?: {
      data?: { type: string; id: string };
      links?: Record<string, string>;
    };
  };
}

export interface AppStoreReviewDetail {
  type: 'appStoreReviewDetails';
  id: string;
  attributes: {
    contactFirstName?: string;
    contactLastName?: string;
    contactPhone?: string;
    contactEmail?: string;
    demoAccountName?: string;
    demoAccountPassword?: string;
    demoAccountRequired?: boolean;
    notes?: string;
  };
}

export class ReviewHandlers {
  constructor(private client: AppStoreConnectClient) {}

  async listReviewSubmissions(args: {
    appId: string;
    limit?: number;
    filterState?: string[];
  }): Promise<any> {
    const { appId, limit = 10, filterState } = args;
    validateRequired(args, ['appId']);

    const params: Record<string, any> = {
      limit: sanitizeLimit(limit),
    };

    if (filterState?.length) {
      params['filter[state]'] = filterState.join(',');
    }

    return this.client.get(`/apps/${appId}/reviewSubmissions`, params);
  }

  async getReviewSubmission(args: {
    submissionId: string;
    include?: string[];
  }): Promise<any> {
    const { submissionId, include } = args;
    validateRequired(args, ['submissionId']);

    const params: Record<string, any> = {};
    if (include?.length) {
      params.include = include.join(',');
    }

    return this.client.get(`/reviewSubmissions/${submissionId}`, params);
  }

  async listReviewSubmissionItems(args: {
    submissionId: string;
    limit?: number;
  }): Promise<any> {
    const { submissionId, limit = 20 } = args;
    validateRequired(args, ['submissionId']);

    const params: Record<string, any> = {
      limit: sanitizeLimit(limit),
      include: 'appStoreVersion',
    };

    return this.client.get(`/reviewSubmissions/${submissionId}/items`, params);
  }

  async getAppStoreReviewDetail(args: {
    appStoreVersionId: string;
  }): Promise<any> {
    const { appStoreVersionId } = args;
    validateRequired(args, ['appStoreVersionId']);

    return this.client.get(`/appStoreVersions/${appStoreVersionId}/appStoreReviewDetail`);
  }

  /**
   * High-level compound tool: given an appId, find all submissions with unresolved issues,
   * fetch their items and version details, and return a structured rejection report.
   */
  async getRejectionInfo(args: {
    appId: string;
  }): Promise<{
    hasRejections: boolean;
    rejections: Array<{
      submissionId: string;
      submittedDate: string;
      state: string;
      items: any[];
      versionDetails: any[];
    }>;
    summary: string;
  }> {
    const { appId } = args;
    validateRequired(args, ['appId']);

    const result: {
      hasRejections: boolean;
      rejections: Array<{
        submissionId: string;
        submittedDate: string;
        state: string;
        items: any[];
        versionDetails: any[];
      }>;
      summary: string;
    } = {
      hasRejections: false,
      rejections: [],
      summary: '',
    };

    // Step 1: Get all review submissions with UNRESOLVED_ISSUES
    const submissions = await this.listReviewSubmissions({
      appId,
      limit: 20,
      filterState: ['UNRESOLVED_ISSUES'],
    });

    const unresolvedSubmissions: ReviewSubmission[] = submissions.data || [];

    if (unresolvedSubmissions.length === 0) {
      // Also check for REJECTED versions via appStoreVersions
      const versions = await this.client.get(`/apps/${appId}/appStoreVersions`, {
        'filter[appStoreState]': 'REJECTED',
        limit: 10,
      });
      const rejectedVersions = versions.data || [];

      if (rejectedVersions.length === 0) {
        result.summary = 'No active rejections or unresolved issues found.';
        return result;
      }

      // Fetch review detail for each rejected version
      for (const ver of rejectedVersions) {
        try {
          const reviewDetail = await this.getAppStoreReviewDetail({
            appStoreVersionId: ver.id,
          });
          result.rejections.push({
            submissionId: 'N/A',
            submittedDate: ver.attributes?.createdDate || 'unknown',
            state: `REJECTED (version ${ver.attributes?.versionString})`,
            items: [],
            versionDetails: [{ version: ver, reviewDetail: reviewDetail.data || reviewDetail }],
          });
        } catch {
          result.rejections.push({
            submissionId: 'N/A',
            submittedDate: ver.attributes?.createdDate || 'unknown',
            state: `REJECTED (version ${ver.attributes?.versionString})`,
            items: [],
            versionDetails: [{ version: ver, reviewDetail: null }],
          });
        }
      }
    }

    // Step 2: For each unresolved submission, get items and version details
    for (const sub of unresolvedSubmissions) {
      let items: any[] = [];
      const versionDetails: any[] = [];

      try {
        const itemsResp = await this.listReviewSubmissionItems({
          submissionId: sub.id,
        });
        items = itemsResp.data || [];

        // For each item that references an appStoreVersion, get the review detail
        const includedVersions = itemsResp.included || [];
        for (const included of includedVersions) {
          if (included.type === 'appStoreVersions') {
            try {
              const reviewDetail = await this.getAppStoreReviewDetail({
                appStoreVersionId: included.id,
              });
              versionDetails.push({
                version: included,
                reviewDetail: reviewDetail.data || reviewDetail,
              });
            } catch {
              versionDetails.push({ version: included, reviewDetail: null });
            }
          }
        }

        // If no included versions, try to get version IDs from item relationships
        if (includedVersions.length === 0) {
          for (const item of items) {
            const versionRef = item.relationships?.appStoreVersion?.data;
            if (versionRef) {
              try {
                const versionResp = await this.client.get(
                  `/appStoreVersions/${versionRef.id}`,
                  {}
                );
                const reviewDetail = await this.getAppStoreReviewDetail({
                  appStoreVersionId: versionRef.id,
                });
                versionDetails.push({
                  version: versionResp.data || versionResp,
                  reviewDetail: reviewDetail.data || reviewDetail,
                });
              } catch {
                versionDetails.push({ versionId: versionRef.id, reviewDetail: null });
              }
            }
          }
        }
      } catch {
        // items fetch failed
      }

      result.rejections.push({
        submissionId: sub.id,
        submittedDate: sub.attributes.submittedDate,
        state: sub.attributes.state,
        items,
        versionDetails,
      });
    }

    result.hasRejections = result.rejections.length > 0;

    // Build summary
    const parts: string[] = [];
    for (const rej of result.rejections) {
      parts.push(`Submission ${rej.submissionId} (${rej.state}, submitted ${rej.submittedDate})`);
      for (const vd of rej.versionDetails) {
        const ver = vd.version?.attributes?.versionString || vd.version?.id || 'unknown';
        const verState = vd.version?.attributes?.appStoreState || 'unknown';
        parts.push(`  Version ${ver}: ${verState}`);
        if (vd.reviewDetail?.attributes?.notes) {
          parts.push(`  Review Notes: ${vd.reviewDetail.attributes.notes}`);
        }
      }
      for (const item of rej.items) {
        parts.push(`  Item ${item.id}: state=${item.attributes?.state}, resolved=${item.attributes?.resolved}`);
      }
    }
    result.summary = parts.join('\n');

    return result;
  }
}
