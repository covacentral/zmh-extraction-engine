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
  cartEnabled?: boolean;      // opcional, false/ausente en Fases 1-2
  advisorLines?: EcometriAdvisorLine[];
}

/**
 * Subset seguro serializable hacia el cliente. Nunca incluye storeId.
 */
export interface EcometriClientConfig {
  enabled: boolean;
  cartEnabled: boolean;
  advisorLines: EcometriAdvisorLine[];
}

export interface ProductDTO {
  id: string;
  title: string;
  sku: string | null;
  priceCop: number;           // entero COP
  inStock: boolean;
  imageUrl: string | null;
  description: string | null;
  productUrl: string;
}

export interface EcometriSearchResponse {
  items: ProductDTO[];
  total: number;
  page: number;
  hasMore: boolean;
}
