import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LoggerHelper } from '../../common/helpers/logger.helper';

export interface MpCreateOrderPaymentMethod {
  id: string;
  type: 'credit_card' | 'debit_card';
  token: string;
  installments: number;
  /** Resumen de tarjeta ("Essence Vapes") - reduce desconocimientos/contracargos (checklist de
   *  calidad oficial de MP, campo `statement_descriptor_/_soft_descriptor`). */
  statement_descriptor?: string;
}

export interface MpCreateOrderItem {
  title: string;
  unit_price: string;
  quantity: number;
  description?: string;
  category_id?: string;
  external_code?: string;
}

export interface MpCreateOrderBody {
  type: 'online';
  processing_mode: 'automatic';
  total_amount: string;
  external_reference: string;
  payer: {
    email: string;
    first_name?: string;
    last_name?: string;
    phone?: { number: string };
    address?: { zip_code: string; street_name: string; street_number: string };
    identification?: { type: string; number: string };
  };
  transactions: { payments: [{ amount: string; payment_method: MpCreateOrderPaymentMethod }] };
  // Ítems de la orden - usados por el motor de prevención de fraude de MP para evaluar el
  // riesgo de la operación (checklist de calidad oficial: item_category_id/description/id).
  items?: MpCreateOrderItem[];
  description?: string;
}

export interface MpOrderTransactionPayment {
  id: string;
  status: string;
  status_detail?: string;
}

export interface MpOrderResponse {
  id: string;
  status: string;
  status_detail?: string;
  total_amount?: string;
  external_reference?: string;
  transactions?: { payments?: MpOrderTransactionPayment[] };
  // Presente solo en respuestas de error (4xx) - nunca asumir su forma en una respuesta 2xx.
  message?: string;
  error?: string;
}

/**
 * Único punto que habla con la Orders API de Mercado Pago (`/v1/orders`) - vía HTTP directo
 * (fetch nativo de Node, ya disponible en Node 18+) en vez del SDK npm `mercadopago`: ese SDK no
 * documenta públicamente (a la fecha de esta implementación) una clase para Orders API, solo
 * para la Payments API clásica (`new Payment(client)`) - usar esa clase para pegarle a un
 * endpoint distinto habría significado inventar una integración no documentada. Los campos del
 * body/respuesta de abajo están tomados textual de la documentación oficial ("Cómo migrar de
 * Payments API a Orders API"), no inventados.
 */
@Injectable()
export class MercadoPagoService {
  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.configService.get<string>('mercadopago.accessToken'));
  }

  /**
   * `deviceId` (`X-meli-session-id`) es opcional - recomendación oficial de MP para mejorar la
   * tasa de aprobación (ver "Integrar el Device ID"), no un requisito duro. El SDK v2 del
   * frontend lo genera solo; si por lo que sea no llegó, simplemente no se manda ese header.
   */
  async createOrder(
    body: MpCreateOrderBody,
    idempotencyKey: string,
    deviceId?: string,
  ): Promise<MpOrderResponse> {
    return this.request('/v1/orders', 'POST', body, idempotencyKey, deviceId);
  }

  async getOrder(mpOrderId: string): Promise<MpOrderResponse> {
    return this.request(`/v1/orders/${encodeURIComponent(mpOrderId)}`, 'GET');
  }

  private assertConfigured(): string {
    const token = this.configService.get<string>('mercadopago.accessToken');
    if (!token) {
      throw new ServiceUnavailableException(
        'Mercado Pago no está configurado todavía (MERCADOPAGO_ACCESS_TOKEN)',
      );
    }
    return token;
  }

  private async request(
    path: string,
    method: 'GET' | 'POST',
    body?: unknown,
    idempotencyKey?: string,
    deviceId?: string,
  ): Promise<MpOrderResponse> {
    const accessToken = this.assertConfigured();
    const baseUrl = this.configService.get<string>('mercadopago.apiBaseUrl')!;

    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
          ...(deviceId ? { 'X-meli-session-id': deviceId } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch (error) {
      LoggerHelper(
        `No se pudo contactar a Mercado Pago (${method} ${path}): ${
          error instanceof Error ? error.message : String(error)
        }`,
        'MercadoPagoService',
        true,
      );
      throw new BadGatewayException('No se pudo contactar a Mercado Pago');
    }

    const data = (await response.json().catch(() => ({}))) as MpOrderResponse;

    // Un pago rechazado por el emisor/banco NO es un error HTTP acá - MP crea la order igual y
    // devuelve 2xx con `status: "failed"` (ver PaymentsService). Solo 4xx/5xx son un problema de
    // la integración en sí (credenciales, idempotencia repetida, body mal formado).
    if (!response.ok) {
      LoggerHelper(
        `Mercado Pago respondió ${response.status} en ${method} ${path}: ${
          data.message ?? data.error ?? 'sin detalle'
        }`,
        'MercadoPagoService',
        true,
      );
      throw new BadGatewayException(
        'Mercado Pago rechazó la solicitud - intentá de nuevo en unos segundos',
      );
    }

    return data;
  }
}
