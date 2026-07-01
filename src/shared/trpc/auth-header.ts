let currentUserId: string | null = null;
let currentActingAsId: string | null = null;

export function setTrpcUserId(userId: string | null) {
  currentUserId = userId;
}

export function getTrpcUserId(): string {
  return currentUserId ?? "";
}

export function setTrpcActingAsId(actingAsId: string | null) {
  currentActingAsId = actingAsId;
}

export function getTrpcActingAsId(): string {
  return currentActingAsId ?? "";
}
