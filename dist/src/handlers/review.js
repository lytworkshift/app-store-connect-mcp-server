import { validateRequired, sanitizeLimit } from '../utils/index.js';
export class ReviewHandlers {
    client;
    constructor(client) {
        this.client = client;
    }
    /**
     * List review submissions for an app (find rejections, unresolved issues, etc.)
     */
    async listReviewSubmissions(args) {
        const { appId, state, limit = 20 } = args;
        validateRequired(args, ['appId']);
        const params = {
            limit: sanitizeLimit(limit),
        };
        if (state) {
            params['filter[state]'] = state;
        }
        return this.client.get(`/apps/${appId}/reviewSubmissions`, params);
    }
    /**
     * Get items in a review submission (shows which items are rejected/approved)
     */
    async getReviewSubmissionItems(args) {
        const { submissionId, limit = 50 } = args;
        validateRequired(args, ['submissionId']);
        const params = {
            limit: sanitizeLimit(limit),
            include: 'appStoreVersion',
        };
        return this.client.get(`/reviewSubmissions/${submissionId}/items`, params);
    }
    /**
     * Get the app review detail for a version (developer notes, demo account, contact info).
     * NOTE: "notes" field = developer's own notes TO Apple (e.g. demo credentials),
     * NOT Apple's rejection reason. Apple's rejection reasons are only in the
     * Resolution Center (web UI), not available via this API.
     */
    async getAppStoreReviewDetail(args) {
        const { appStoreVersionId } = args;
        validateRequired(args, ['appStoreVersionId']);
        return this.client.get(`/appStoreVersions/${appStoreVersionId}/appStoreReviewDetail`);
    }
    /**
     * Get comprehensive rejection status for an app. Combines:
     * 1. Review submissions with UNRESOLVED_ISSUES
     * 2. Submission items and their states
     * 3. REJECTED versions
     * 4. Developer notes (NOT Apple's rejection reason)
     *
     * Apple's actual rejection feedback (guideline violations, bug descriptions)
     * is only in the Resolution Center (web UI) and cannot be fetched via this API.
     */
    async getRejectionStatus(args) {
        const { appId } = args;
        validateRequired(args, ['appId']);
        const result = {
            has_rejections: false,
            rejected_versions: [],
            unresolved_submissions: [],
            action_required: '',
        };
        // 1. Find UNRESOLVED_ISSUES submissions
        try {
            const subs = await this.client.get(`/apps/${appId}/reviewSubmissions`, {
                limit: 10,
                'filter[state]': 'UNRESOLVED_ISSUES',
            });
            for (const sub of subs?.data || []) {
                const subInfo = {
                    submission_id: sub.id,
                    state: sub.attributes?.state,
                    submitted_date: sub.attributes?.submittedDate,
                    items: [],
                };
                // Get submission items
                try {
                    const items = await this.client.get(`/reviewSubmissions/${sub.id}/items`, {
                        include: 'appStoreVersion',
                        limit: 20,
                    });
                    for (const item of items?.data || []) {
                        subInfo.items.push({
                            id: item.id,
                            state: item.attributes?.state,
                            resolved: item.attributes?.resolved,
                        });
                    }
                    // Get version info from included
                    for (const inc of items?.included || []) {
                        if (inc.type === 'appStoreVersions') {
                            subInfo.version_string = inc.attributes?.versionString;
                            subInfo.version_state = inc.attributes?.appStoreState;
                            subInfo.version_id = inc.id;
                        }
                    }
                }
                catch (e) {
                    // Items fetch failed, continue
                }
                result.unresolved_submissions.push(subInfo);
            }
        }
        catch (e) {
            // Submissions fetch failed
        }
        // 2. Check for REJECTED versions
        try {
            const versions = await this.client.get(`/apps/${appId}/appStoreVersions`, { limit: 10 });
            for (const v of versions?.data || []) {
                if (v.attributes?.appStoreState === 'REJECTED') {
                    const vInfo = {
                        version_id: v.id,
                        version_string: v.attributes?.versionString,
                        state: v.attributes?.appStoreState,
                        created_date: v.attributes?.createdDate,
                    };
                    // Get developer notes (NOT Apple's rejection reason)
                    try {
                        const detail = await this.client.get(`/appStoreVersions/${v.id}/appStoreReviewDetail`);
                        const notes = detail?.data?.attributes?.notes;
                        if (notes) {
                            vInfo.developer_notes_to_apple = notes;
                        }
                    }
                    catch (e) {
                        // Review detail not available
                    }
                    result.rejected_versions.push(vInfo);
                }
            }
        }
        catch (e) {
            // Versions fetch failed
        }
        result.has_rejections =
            result.rejected_versions.length > 0 ||
                result.unresolved_submissions.length > 0;
        if (result.has_rejections) {
            const parts = [];
            for (const rv of result.rejected_versions) {
                parts.push(`v${rv.version_string}: REJECTED`);
                if (rv.developer_notes_to_apple) {
                    parts.push(`  Developer notes to Apple (NOT rejection reason): ${rv.developer_notes_to_apple}`);
                }
            }
            for (const us of result.unresolved_submissions) {
                parts.push(`Submission ${us.submission_id}: ${us.state} (v${us.version_string || '?'})`);
                for (const item of us.items || []) {
                    parts.push(`  Item ${item.id}: state=${item.state}, resolved=${item.resolved}`);
                }
            }
            parts.push('');
            parts.push('[HUMAN ACTION REQUIRED] Apple\'s actual rejection reasons (guideline violations, bug descriptions)');
            parts.push('are only in the Resolution Center. The REST API cannot access them.');
            parts.push('Go to: App Store Connect > your app > click the rejected version > Resolution Center');
            result.action_required = parts.join('\n');
        }
        return result;
    }
}
