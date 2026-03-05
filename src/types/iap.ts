/**
 * In-App Purchase types for App Store Connect API
 * @see https://developer.apple.com/documentation/appstoreconnectapi/in-app-purchases
 */

export type InAppPurchaseType = "CONSUMABLE" | "NON_CONSUMABLE" | "NON_RENEWING_SUBSCRIPTION";

export type SubscriptionDuration =
  | "ONE_WEEK"
  | "ONE_MONTH"
  | "TWO_MONTHS"
  | "THREE_MONTHS"
  | "SIX_MONTHS"
  | "ONE_YEAR";

export interface CreateInAppPurchaseRequest {
  data: {
    type: "inAppPurchases";
    attributes: {
      productId: string;
      referenceName: string;
      inAppPurchaseType: InAppPurchaseType;
    };
    relationships: {
      app: {
        data: {
          type: "apps";
          id: string;
        };
      };
    };
  };
}

export interface CreateSubscriptionGroupRequest {
  data: {
    type: "subscriptionGroups";
    attributes: {
      referenceName: string;
    };
    relationships: {
      app: {
        data: {
          type: "apps";
          id: string;
        };
      };
    };
  };
}

export interface CreateSubscriptionRequest {
  data: {
    type: "subscriptions";
    attributes: {
      productId: string;
      name: string;
      subscriptionPeriod: SubscriptionDuration;
    };
    relationships: {
      group: {
        data: {
          type: "subscriptionGroups";
          id: string;
        };
      };
    };
  };
}
