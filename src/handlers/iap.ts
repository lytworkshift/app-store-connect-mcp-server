import { AppStoreConnectClient } from '../services/index.js';
import {
  CreateInAppPurchaseRequest,
  CreateSubscriptionGroupRequest,
  CreateSubscriptionRequest,
  InAppPurchaseType,
  SubscriptionDuration
} from '../types/iap.js';
import { validateRequired, sanitizeLimit } from '../utils/index.js';

export class IapHandlers {
  constructor(private client: AppStoreConnectClient) {}

  /**
   * List in-app purchases for an app
   */
  async listInAppPurchases(args: {
    appId: string;
    limit?: number;
  }): Promise<any> {
    const { appId, limit = 100 } = args;
    validateRequired(args, ['appId']);

    const params: Record<string, any> = {
      limit: sanitizeLimit(limit)
    };

    return this.client.get(`/apps/${appId}/inAppPurchases`, params);
  }

  /**
   * Create a non-consumable or consumable in-app purchase (e.g. lifetime unlock)
   */
  async createInAppPurchase(args: {
    appId: string;
    productId: string;
    referenceName: string;
    inAppPurchaseType?: InAppPurchaseType;
  }): Promise<any> {
    const { appId, productId, referenceName, inAppPurchaseType = 'NON_CONSUMABLE' } = args;
    validateRequired(args, ['appId', 'productId', 'referenceName']);

    const requestBody: CreateInAppPurchaseRequest = {
      data: {
        type: 'inAppPurchases',
        attributes: {
          productId,
          referenceName,
          inAppPurchaseType
        },
        relationships: {
          app: {
            data: {
              type: 'apps',
              id: appId
            }
          }
        }
      }
    };

    return this.client.post('/inAppPurchases', requestBody);
  }

  /**
   * List subscription groups for an app
   */
  async listSubscriptionGroups(args: {
    appId: string;
    limit?: number;
  }): Promise<any> {
    const { appId, limit = 100 } = args;
    validateRequired(args, ['appId']);

    const params: Record<string, any> = {
      limit: sanitizeLimit(limit)
    };

    return this.client.get(`/apps/${appId}/subscriptionGroups`, params);
  }

  /**
   * Create a subscription group (required before creating subscriptions)
   */
  async createSubscriptionGroup(args: {
    appId: string;
    referenceName: string;
  }): Promise<any> {
    const { appId, referenceName } = args;
    validateRequired(args, ['appId', 'referenceName']);

    const requestBody: CreateSubscriptionGroupRequest = {
      data: {
        type: 'subscriptionGroups',
        attributes: {
          referenceName
        },
        relationships: {
          app: {
            data: {
              type: 'apps',
              id: appId
            }
          }
        }
      }
    };

    return this.client.post('/subscriptionGroups', requestBody);
  }

  /**
   * Create an auto-renewable subscription (monthly, yearly, etc.)
   */
  async createSubscription(args: {
    subscriptionGroupId: string;
    productId: string;
    name: string;
    duration: SubscriptionDuration;
  }): Promise<any> {
    const { subscriptionGroupId, productId, name, duration } = args;
    validateRequired(args, ['subscriptionGroupId', 'productId', 'name', 'duration']);

    const requestBody: CreateSubscriptionRequest = {
      data: {
        type: 'subscriptions',
        attributes: {
          productId,
          name,
          subscriptionPeriod: duration
        },
        relationships: {
          group: {
            data: {
              type: 'subscriptionGroups',
              id: subscriptionGroupId
            }
          }
        }
      }
    };

    return this.client.post('/subscriptions', requestBody);
  }

  /**
   * Get available price points for an in-app purchase (v2 API)
   */
  async listInAppPurchasePricePoints(args: {
    inAppPurchaseId: string;
    territory?: string;
    limit?: number;
  }): Promise<any> {
    const { inAppPurchaseId, territory = 'USA', limit = 200 } = args;
    validateRequired(args, ['inAppPurchaseId']);

    const params: Record<string, any> = {
      'filter[territory]': territory,
      limit: sanitizeLimit(limit, 200),
      include: 'territory'
    };

    return this.client.getV2(`/inAppPurchases/${inAppPurchaseId}/pricePoints`, params);
  }
}
