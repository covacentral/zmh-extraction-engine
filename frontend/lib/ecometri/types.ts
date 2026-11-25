export interface EcometriAdvisorLine {
  id: string;
  label: string;
  phone: string; // E.164 sin '+'
}

export interface EcometriConfig {
  enabled: boolean;
  storeId: string;            // UUID de tienda Ecometri (solo servidor)
  storeBaseUrl: string;       // https://{host}/{telefono}
  allowedImageHost: string;   // d1b50uin55dq3m.cloudfront.net
  visualSearchEnabled?: boolean;
  cartEnabled?: boolean;      // opcional, false/ausente en Fases 1-2
  advisorLines?: EcometriAdvisorLine[];
}

/**
 * Subset seguro serializable hacia el cliente. Nunca incluye storeId.
 */
export interface EcometriClientConfig {
  enabled: boolean;
  visualSearchEnabled: boolean;
  cartEnabled: boolean;
  advisorLines: EcometriAdvisorLine[];
}

export interface ProductDTO {
  id: string;
  slug: string | null;
  title: string;
  sku: string | null;
  priceCop: number;           // entero COP
  inStock: boolean;
  imageUrl: string | null;
  description: string | null;
  productUrl: string;
}

export interface ProductDetailDTO {
  sku: string | null;
  inStock: boolean | null;
  description: string | null;
}

export interface EcometriSearchResponse {
  items: ProductDTO[];
  total: number;
  page: number;
  hasMore: boolean;
}

export interface VisualAnalysis {
  label: string;
  exactTerms: string[];
  functionalTerms: string[];
  broadRoots: string[];
}

export interface VisualSearchRequest {
  commerceId: string;
  imageBase64: string;
  mimeType: 'image/jpeg';
}

export type VisualSearchDegraded = 'none' | 'rerank_skipped' | 'paused';

export interface VisualSearchQuota {
  remaining: number;
  limit: number;
  resetInSec: number;
  resetAt: number; // unix epoch ms
}

export interface VisualSearchResponse {
  items: ProductDTO[];
  detected: {
    label: string;
    chips: string[];
  };
  degraded: VisualSearchDegraded;
  quota?: VisualSearchQuota;
  error?: string;
}
