import { WithdrawalRequest } from '../entities/withdrawal-request.entity';

export interface WithdrawalRequestResponse {
  id: string;
  trackingCode: string;
  buyerName: string;
  email: string;
  phone: string | null;
  orderReference: string | null;
  productDescription: string;
  comments: string | null;
  status: string;
  adminNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
}

/** Shape completo - solo para el panel admin. */
export function toWithdrawalResponse(entity: WithdrawalRequest): WithdrawalRequestResponse {
  return {
    id: entity.id,
    trackingCode: entity.trackingCode,
    buyerName: entity.buyerName,
    email: entity.email,
    phone: entity.phone,
    orderReference: entity.orderReference,
    productDescription: entity.productDescription,
    comments: entity.comments,
    status: entity.status,
    adminNotes: entity.adminNotes,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    resolvedAt: entity.resolvedAt,
  };
}

/** Shape público para la consulta de estado - sin adminNotes ni datos de contacto propios. */
export function toPublicWithdrawalResponse(entity: WithdrawalRequest) {
  return {
    trackingCode: entity.trackingCode,
    status: entity.status,
    productDescription: entity.productDescription,
    createdAt: entity.createdAt,
    resolvedAt: entity.resolvedAt,
  };
}
