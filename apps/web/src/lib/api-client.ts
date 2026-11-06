import { PublicItem, ItemType, ItemCategory, LPUCampusZone, ItemStatus, ClaimStatus } from '@/types';

// Environment-based API URL configuration (Django REST Framework v1). Localhost
// is only a development default; production builds must supply the Vercel env.
const developmentApiUrl = process.env.NODE_ENV === 'development'
  ? 'http://localhost:8000/api/v1'
  : '';
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.trim() || developmentApiUrl;

export class ApiClientError extends Error {
  public statusCode: number;
  public errorCode?: string;
  public details?: unknown;

  constructor(message: string, statusCode: number, errorCode?: string, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
  }
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface CreateReportPayload {
  itemType: ItemType;
  title: string;
  category: string;
  location: string;
  specificLocation: string;
  eventDate: string;
  publicDescription: string;
  primaryImageUrl?: string;
  additionalImages?: string[];
  privateIdentifyingDetails?: string;
  verificationQuestions?: Array<{ questionText: string; expectedAnswer: string }>;
}

export interface DailyLostReportAllowance {
  applies: boolean;
  limit: number;
  submitted: number;
  remaining: number | null;
  localDate: string | null;
}

export interface SecurityReviewReport {
  id: string;
  referenceNumber: string;
  itemType: ItemType;
  title: string;
  publicDescription: string;
  category: { id: string; code: string; name: string };
  location: { id: string; code: string; name: string; campusZone: string };
  specificLocation: string;
  eventDate: string;
  primaryImageUrl?: string;
  additionalImages?: string[];
  status: ItemStatus;
  createdAt: string;
  reporter: {
    fullName: string;
    registrationNumber: string;
    userType: string;
  };
}

export interface DirectRecoveryReport extends SecurityReviewReport {
  verificationQuestions: Array<{ id: string; questionText: string; hint?: string }>;
  verificationAvailable: { privateDetails: boolean; reportPhotos: boolean; questions: boolean };
}

export interface DirectRecoveryRecord {
  id: string;
  directRecoveryId: string;
  recoveryReference: string;
  itemId: string;
  item: PublicItem;
  recipient: { id: string; fullName: string; registrationNumber: string; department?: string; phone?: string };
  status: string;
  intakeOfficer: { id: string; fullName: string; registrationNumber: string };
  physicalDeskLocation: string;
  createdAt: string;
  reviewedBy?: { id: string; fullName: string; registrationNumber: string } | null;
  reviewedAt?: string | null;
  verificationMethods?: string[];
  verificationNotes?: string;
  verificationQuestions?: Array<{ id: string; questionText: string; hint?: string }>;
  verificationAvailable?: { privateDetails: boolean; reportPhotos: boolean; questions: boolean };
  otpExpiresAt?: string | null;
  otpGeneratedAt?: string | null;
  otpRemainingSeconds?: number;
  otpStatus?: 'PENDING_APPROVAL' | 'NOT_ISSUED' | 'ACTIVE' | 'EXPIRED' | 'RENEWED' | 'USED';
  otpRenewed?: boolean;
  handoverStatus?: string;
  handoverOtp?: string | null;
  completedAt?: string | null;
  completedBy?: { id: string; fullName: string; registrationNumber: string } | null;
}

export interface DirectRecoveryHandoverReceipt {
  handoverId: string;
  directRecoveryId: string;
  referenceNumber: string;
  itemTitle: string;
  recipientName: string;
  recipientRegNo: string;
  officerId: string;
  physicalDeskLocation: string;
  idCardPresentedType: string;
  idCardNumberMasked: string;
  completedAt: string;
}

export interface AdminInventoryItem {
  id: string;
  _id?: string;
  referenceNumber: string;
  title: string;
  status: string;
  primaryImageUrl?: string;
  currentCustodyDesk?: string;
  lockerStorageReference?: string;
  updatedAt?: string;
  category?: { id?: string; name?: string; code?: string };
}

export interface AdminInventoryLocker {
  id: string;
  lockerNumber: string;
  location: string;
  is_active: boolean;
  currentItemId: string | null;
  currentItemTitle: string | null;
  currentItem: AdminInventoryItem | null;
  occupied: boolean;
  updatedAt: string;
  hasCustodyHistory: boolean;
  canDelete: boolean;
  deleteBlockedReason: string;
}

export interface AdminInventoryUpdate {
  id: string;
  action: string;
  itemReference?: string;
  itemTitle?: string;
  previousLockerReference?: string;
  lockerReference?: string;
  officerName?: string;
  handledBy?: { fullName?: string; registrationNumber?: string };
  timestamp: string;
  toLocation?: string;
}

export interface AdminInventorySnapshot {
  items: AdminInventoryItem[];
  lockers: AdminInventoryLocker[];
  recentUpdates: AdminInventoryUpdate[];
}

export interface CustodyLockerRecord {
  id: string;
  lockerNumber: string;
  location: string;
  locationId: string;
  locationCode: string;
  locationActive: boolean;
  is_active: boolean;
  currentItemId: string | null;
  currentItemTitle: string | null;
  updatedAt: string;
  updatedBy: { id: string; fullName: string; role: string } | null;
  occupied: boolean;
}

export interface CustodyLocationRecord {
  id: string;
  code: string;
  name: string;
  description: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; fullName: string; role: string } | null;
  updatedBy: { id: string; fullName: string; role: string } | null;
  lockers: CustodyLockerRecord[];
  lockersTotal: number;
  lockersOccupied: number;
  itemsStored: number;
}

export interface PortalNotification {
  id: string;
  eventType: string;
  title: string;
  message: string;
  targetPath: string;
  createdAt: string;
  readAt: string | null;
  isRead: boolean;
}

export interface NotificationsResponse {
  items: PortalNotification[];
  unreadCount: number;
  nextCursor: string;
}

export interface UpdateReportPayload {
  title?: string;
  category?: string;
  location?: string;
  specificLocation?: string;
  eventDate?: string;
  publicDescription?: string;
  primaryImageUrl?: string;
  additionalImages?: string[];
  privateIdentifyingDetails?: string;
}

export interface QueryItemsParams {
  itemType?: ItemType | 'ALL';
  category?: ItemCategory | 'ALL';
  campusZone?: LPUCampusZone | 'ALL';
  location?: string;
  status?: ItemStatus | 'ALL';
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'eventDate' | 'title';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Normalizes raw API response item into clean frontend PublicItem
 */
export function normalizeApiItem(raw: Record<string, unknown>): PublicItem {
  const categoryCode =
    raw.category && typeof raw.category === 'object' && 'code' in raw.category
      ? (raw.category as { code: ItemCategory }).code
      : (raw.category as ItemCategory) || 'OTHERS';

  const zoneCode =
    raw.location && typeof raw.location === 'object' && 'code' in raw.location
      ? (raw.location as { code: LPUCampusZone }).code
      : (raw.campusZone as LPUCampusZone) || 'OTHER_CAMPUS_AREA';

  return {
    id: String(raw.id || raw._id),
    referenceNumber: String(raw.referenceNumber || ''),
    itemType: raw.itemType as ItemType,
    title: String(raw.title || ''),
    category: categoryCode,
    campusZone: zoneCode,
    specificLocation: String(raw.specificLocation || ''),
    eventDate: String(raw.eventDate || ''),
    publicDescription: String(raw.publicDescription || ''),
    primaryImageUrl: raw.primaryImageUrl ? String(raw.primaryImageUrl) : undefined,
    status: (raw.status as ItemStatus) || 'REPORTED',
    reportedByRole: 'STUDENT_STAFF',
    currentCustodyDesk: raw.currentCustodyDesk ? String(raw.currentCustodyDesk) : undefined,
    createdAt: String(raw.createdAt || ''),
    isOwner: Boolean(raw.isOwner),
  };
}

const ACCESS_TOKEN_KEY = 'lpu_access_token';
const REFRESH_TOKEN_KEY = 'lpu_refresh_token';
const LEGACY_TOKEN_KEY = 'lpu_auth_token';

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (token) return token;
  const legacy = localStorage.getItem(LEGACY_TOKEN_KEY);
  if (legacy) {
    localStorage.setItem(ACCESS_TOKEN_KEY, legacy);
    return legacy;
  }
  return null;
}

function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const cookie = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('csrftoken='));
  return cookie ? decodeURIComponent(cookie.slice('csrftoken='.length)) : null;
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setAuthTokens(accessToken: string, refreshToken?: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(LEGACY_TOKEN_KEY, accessToken);
  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }
}

export function clearAuthTokens(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem('lpu_user_profile');
}

export interface ApiFetchOptions extends RequestInit {
  _retry?: boolean;
  skipAuth?: boolean;
}

let isRefreshing = false;
let refreshSubscribers: Array<(token: string | null) => void> = [];

function notifyRefreshSubscribers(token: string | null) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

async function executeTokenRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearAuthTokens();
    return null;
  }

  try {
    const refreshUrl = `${API_BASE_URL.replace(/\/+$/, '')}/auth/token/refresh/`;
    const res = await fetch(refreshUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ refresh: refreshToken }),
    });

    if (!res.ok) {
      clearAuthTokens();
      return null;
    }

    const json = await res.json();
    const payload = json?.data || json;
    const newAccess = payload.access || payload.accessToken || payload.token;
    const newRefresh = payload.refresh || payload.refreshToken;

    if (newAccess) {
      setAuthTokens(newAccess, newRefresh || refreshToken);
      return newAccess;
    } else {
      clearAuthTokens();
      return null;
    }
  } catch {
    clearAuthTokens();
    return null;
  }
}

/**
 * Core HTTP client with credentials and standard error parsing
 */
async function apiFetch<T>(
  endpoint: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  if (!API_BASE_URL && !/^https?:\/\//i.test(endpoint)) {
    throw new ApiClientError(
      'The backend API URL is not configured. Set NEXT_PUBLIC_API_URL for this deployment.',
      0,
      'API_URL_NOT_CONFIGURED'
    );
  }

  const url = endpoint.startsWith('http')
    ? endpoint
    : `${API_BASE_URL.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const cleanEndpoint = endpoint.replace(/^\/+/, '');
  const isAuthRoute =
    cleanEndpoint.startsWith('auth/login') ||
    cleanEndpoint.startsWith('auth/register') ||
    cleanEndpoint.startsWith('auth/token/refresh');

  if (isAuthRoute || options.skipAuth) {
    delete headers['Authorization'];
  } else if (!headers['Authorization']) {
    const token = getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const method = (options.method || 'GET').toUpperCase();
  const unsafeMethod = !['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method);
  if (!isAuthRoute && !options.skipAuth && unsafeMethod && !headers['Authorization']) {
    const csrfToken = getCsrfToken();
    if (csrfToken) headers['X-CSRFToken'] = csrfToken;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include', // Support HttpOnly cookie sessions
    });
  } catch (netErr: unknown) {
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    const errorMsg = isOffline
      ? 'Network offline. Please check your internet connection.'
      : 'The backend API is unreachable. Check the network and the configured API URL.';
    throw new ApiClientError(errorMsg, 0, 'NETWORK_ERROR', netErr);
  }

  // Handle 401 Unauthorized with centralized token refresh
  if (response.status === 401 && !options._retry && !isAuthRoute) {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      if (isRefreshing) {
        return new Promise<T>((resolve, reject) => {
          refreshSubscribers.push((newToken) => {
            if (newToken) {
              resolve(
                apiFetch<T>(endpoint, {
                  ...options,
                  _retry: true,
                  headers: {
                    ...headers,
                    Authorization: `Bearer ${newToken}`,
                  },
                })
              );
            } else {
              reject(
                new ApiClientError(
                  'Your session has expired. Please log in again.',
                  401,
                  'TOKEN_EXPIRED'
                )
              );
            }
          });
        });
      }

      isRefreshing = true;
      try {
        const newAccessToken = await executeTokenRefresh();
        if (newAccessToken) {
          notifyRefreshSubscribers(newAccessToken);
          return apiFetch<T>(endpoint, {
            ...options,
            _retry: true,
            headers: {
              ...headers,
              Authorization: `Bearer ${newAccessToken}`,
            },
          });
        } else {
          notifyRefreshSubscribers(null);
          clearAuthTokens();
          if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
            window.location.replace('/login?session_expired=1');
          }
          throw new ApiClientError(
            'Your session has expired. Please log in again.',
            401,
            'TOKEN_EXPIRED'
          );
        }
      } finally {
        isRefreshing = false;
      }
    } else {
      clearAuthTokens();
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.replace('/login?session_expired=1');
      }
    }
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    const explicitMessage = data?.error?.message || data?.message || data?.detail;
    const errorDetails = data?.error?.details || data?.details;
    const detailMessages = Array.isArray(errorDetails)
      ? errorDetails.flatMap((entry: { field?: unknown; message?: unknown }) => {
        if (typeof entry?.message !== 'string') return [];
        const field = typeof entry.field === 'string'
          ? `${entry.field.replace(/([A-Z])/g, ' $1').replace(/^./, (letter: string) => letter.toUpperCase())}: `
          : '';
        return [`${field}${entry.message}`];
      })
      : [];
    const fieldMessages = data && typeof data === 'object'
      ? Object.entries(data)
        .filter(([field]) => !['error', 'message', 'detail', 'code', 'status'].includes(field))
        .flatMap(([field, value]) => {
          const messages = Array.isArray(value) ? value : [value];
          return messages
            .filter((entry): entry is string => typeof entry === 'string')
            .map((entry) => `${field.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())}: ${entry}`);
        })
      : [];
    const message = detailMessages.join(' ') || fieldMessages.join(' ') || explicitMessage || `HTTP error ${response.status}`;
    const code = data?.error?.code || data?.code || 'UNKNOWN_ERROR';
    const details = data?.error?.details || data?.details;
    throw new ApiClientError(message, response.status, code, details);
  }

  return data?.data !== undefined ? data.data : data;
}

export const apiClient = {
  async getNotifications(cursor?: string): Promise<NotificationsResponse> {
    const query = new URLSearchParams();
    if (cursor) query.set('cursor', cursor);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return apiFetch(`notifications/${suffix}`);
  },

  async markNotificationRead(notificationId: string): Promise<{ id: string; readAt: string; unreadCount: number }> {
    return apiFetch(`notifications/${notificationId}/read/`, { method: 'POST' });
  },

  async markAllNotificationsRead(): Promise<{ unreadCount: number }> {
    return apiFetch('notifications/read-all/', { method: 'POST' });
  },

  /**
   * Fetch signed-in item listings with filtering and server-side pagination
   */
  async getItems(params: QueryItemsParams = {}): Promise<PaginatedResult<PublicItem>> {
    const query = new URLSearchParams();

    if (params.itemType && params.itemType !== 'ALL') query.set('itemType', params.itemType);
    if (params.category && params.category !== 'ALL') query.set('category', params.category);
    if (params.campusZone && params.campusZone !== 'ALL') query.set('campusZone', params.campusZone);
    if (params.location && params.location !== 'ALL') query.set('location', params.location);
    if (params.status && params.status !== 'ALL') query.set('status', params.status);
    if (params.search && params.search.trim()) query.set('search', params.search.trim());
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.sortBy) query.set('sortBy', params.sortBy);
    if (params.sortOrder) query.set('sortOrder', params.sortOrder);

    const queryString = query.toString() ? `?${query.toString()}` : '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawData = await apiFetch<{ items: any[]; pagination: any }>(`items${queryString}`);

    return {
      items: rawData.items.map(normalizeApiItem),
      pagination: rawData.pagination,
    };
  },

  /**
   * Fetch a single item detail by ID or reference number
   */
  async getItemById(id: string): Promise<PublicItem> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await apiFetch<any>(`items/${id}`);
    return normalizeApiItem(raw);
  },

  /**
   * Submit a new lost or found property report
   */
  async createReport(payload: CreateReportPayload): Promise<PublicItem> {
    const endpoint = payload.itemType === 'LOST' ? 'items/lost' : 'items/found';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await apiFetch<any>(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return normalizeApiItem(raw);
  },

  /** Get the current user's student-only lost-report allowance for the local day. */
  async getDailyLostReportAllowance(): Promise<DailyLostReportAllowance> {
    return apiFetch<DailyLostReportAllowance>('items/daily-lost-report-limit');
  },

  /**
   * Update an eligible report by its owner
   */
  async updateReport(id: string, payload: UpdateReportPayload): Promise<PublicItem> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await apiFetch<any>(`items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return normalizeApiItem(raw);
  },

  /**
   * Soft-withdraw an eligible report owned by the authenticated student or staff member
   */
  async withdrawReport(id: string): Promise<{ success: boolean; reportId: string; message: string }> {
    return apiFetch<{ success: boolean; reportId: string; message: string }>(`items/${id}/withdraw`, {
      method: 'DELETE',
    });
  },

  /**
   * List reports submitted by the currently authenticated user
   */
  async getMyReports(): Promise<PublicItem[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawList = await apiFetch<any[]>('items/my-reports');
    return rawList.map(normalizeApiItem);
  },

  /**
   * Upload and process a photograph via Sharp endpoint (strips EXIF, converts to WebP)
   */
  async uploadImage(file: File): Promise<{ filename: string; url: string; mimeType: string }> {
    const formData = new FormData();
    formData.append('image', file);

    return apiFetch<{ filename: string; url: string; mimeType: string }>('items/upload', {
      method: 'POST',
      body: formData,
    });
  },

  /**
   * Get reference categories
   */
  async getCategories(): Promise<Array<{ id: string; code: string; name: string; icon?: string }>> {
    return apiFetch<Array<{ id: string; code: string; name: string; icon?: string }>>('categories');
  },

  /**
   * Get reference locations
   */
  async getLocations(): Promise<Array<{ id: string; code: string; name: string; campusZone: string }>> {
    return apiFetch<Array<{ id: string; code: string; name: string; campusZone: string }>>('locations');
  },

  /**
   * Retrieve deterministic match suggestions for a specific item
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getMatchesForItem(itemId: string): Promise<any[]> {
    return apiFetch(`items/${itemId}/matches`);
  },

  /**
   * Refresh deterministic match suggestions for an item
   */
  async refreshMatchesForItem(itemId: string): Promise<{ count: number }> {
    return apiFetch(`items/${itemId}/matches/refresh`, { method: 'POST' });
  },

  /**
   * Retrieve verification challenges for an item (question text and hints only)
   */
  async getItemChallenges(itemId: string): Promise<Array<{ id: string; questionText: string; hint?: string; maxAttempts: number }>> {
    return apiFetch(`items/${itemId}/challenges`);
  },

  /**
   * Submit an ownership claim
   */
  async submitClaim(payload: {
    itemId: string;
    statement: string;
    challengeAnswers?: Array<{ challengeId: string; providedAnswer: string }>;
    privateEvidenceProofUrls?: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }): Promise<any> {
    return apiFetch('claims/', {
      method: 'POST',
      body: JSON.stringify({
        itemId: payload.itemId,
        item_id: payload.itemId,
        statement: payload.statement,
        challengeAnswers: payload.challengeAnswers || [],
        privateEvidenceProofUrls: payload.privateEvidenceProofUrls || [],
      }),
    });
  },

  /**
   * Answer a verification challenge for an active claim
   */
  async answerChallenge(
    claimId: string,
    challengeId: string,
    answer: string
  ): Promise<{ success: boolean; isCorrect: boolean; remainingAttempts: number; claimStatus: ClaimStatus }> {
    return apiFetch(`claims/${claimId}/challenges/${challengeId}/answer`, {
      method: 'POST',
      body: JSON.stringify({ answer }),
    });
  },

  /**
   * Retrieve current user's ownership claims
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getMyClaims(): Promise<any[]> {
    return apiFetch('claims/my-claims');
  },

  /**
   * Retrieve the authenticated user's persisted, completed recovery receipts
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getMyRecoveryHistory(): Promise<any[]> {
    return apiFetch('handovers/my-recovery-history');
  },

  /**
   * Upload ownership verification evidence (receipt, photo, ID card) for an initiated claim
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async uploadClaimEvidence(claimId: string, file: File): Promise<{ message: string; url: string; claim: any }> {
    const formData = new FormData();
    formData.append('file', file);
    return apiFetch(`claims/${claimId}/evidence/`, {
      method: 'POST',
      body: formData,
    });
  },

  /**
   * Security Queue: Retrieve claims register with optional status and search filters
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getPendingClaimsQueue(params: { status?: string; search?: string } = {}): Promise<any[]> {
    const query = new URLSearchParams();
    if (params.status && params.status !== 'ALL') query.set('status', params.status);
    if (params.search && params.search.trim()) query.set('search', params.search.trim());
    const qs = query.toString() ? `?${query.toString()}` : '';
    return apiFetch(`claims/pending${qs}`);
  },

  /**
   * Security Adjudication: Approve or Reject an ownership claim
   */
  async reviewClaim(
    claimId: string,
    payload: { action: 'APPROVE' | 'REJECT'; reviewNotes?: string; rejectionReason?: string }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return apiFetch(`claims/${claimId}/review`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Security Adjudication: Decrypt and inspect private vault records
   */
  async viewPrivateVault(itemId: string): Promise<{ fieldsSummary: string[]; decryptedContent: string; accessCount: number }> {
    return apiFetch(`items/${itemId}/private-vault/view`, { method: 'POST' });
  },

  /**
   * User Authentication: Login with email/regNo and password
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async login(payload: { emailOrRegNo?: string; registration_number?: string; registrationNumber?: string; password: string }): Promise<{ user: any; token: string; accessToken: string; refreshToken?: string }> {
    const identifier = (payload.emailOrRegNo || payload.registration_number || payload.registrationNumber || '').trim();
    clearAuthTokens();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await apiFetch<any>('auth/login', {
      method: 'POST',
      body: JSON.stringify({
        emailOrRegNo: identifier,
        registration_number: identifier,
        password: payload.password,
      }),
      skipAuth: true,
    });
    const accessToken = res.accessToken || res.token;
    const refreshToken = res.refreshToken || res.refresh;
    if (accessToken) {
      setAuthTokens(accessToken, refreshToken);
    }
    return {
      user: res.user,
      token: accessToken,
      accessToken,
      refreshToken,
    };
  },

  /**
   * User Authentication: Register new student/staff account
   */
  async register(payload: {
    fullName: string;
    registrationNumber: string;
    email: string;
    password: string;
    confirmPassword: string;
    department?: string;
    role?: string;
    securityPost?: string;
    phone?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }): Promise<{ user: any; token: string; accessToken: string; refreshToken?: string }> {
    clearAuthTokens();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await apiFetch<any>('auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
      skipAuth: true,
    });
    const accessToken = res.accessToken || res.token;
    const refreshToken = res.refreshToken || res.refresh;
    if (accessToken) {
      setAuthTokens(accessToken, refreshToken);
    }
    return {
      user: res.user,
      token: accessToken,
      accessToken,
      refreshToken,
    };
  },

  /**
   * User Authentication: Logout current user
   */
  async logout(): Promise<void> {
    const refreshToken = getRefreshToken();
    try {
      await apiFetch('auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refresh: refreshToken, refreshToken }),
        skipAuth: true,
      });
    } finally {
      clearAuthTokens();
    }
  },

  /**
   * Get currently logged-in user profile
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getCurrentUser(): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await apiFetch<any>('auth/me');
    return res?.user !== undefined ? res.user : res;
  },

  /** Update only the authenticated user's contact phone number. */
  async updateCurrentUserProfile(phone: string): Promise<{ user?: { phone?: string } }> {
    return apiFetch<{ user?: { phone?: string } }>('auth/me', {
      method: 'PATCH',
      body: JSON.stringify({ phone }),
    });
  },

  /**
   * Custody: Retrieve items in security custody inventory
   */
  async getCustodyInventory(filters?: {
    search?: string;
    category?: string;
    campusZone?: string;
    status?: string;
    desk?: string;
    page?: number;
    limit?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }): Promise<{ items: any[]; pagination: any }> {
    const params = new URLSearchParams();
    if (filters?.search) params.set('search', filters.search);
    if (filters?.category) params.set('category', filters.category);
    if (filters?.campusZone) params.set('campusZone', filters.campusZone);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.desk) params.set('desk', filters.desk);
    if (filters?.page) params.set('page', filters.page.toString());
    if (filters?.limit) params.set('limit', filters.limit.toString());

    const qs = params.toString();
    const endpoint = qs ? `custody/inventory?${qs}` : 'custody/inventory';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await apiFetch<any>(endpoint);
    return {
      items: res || [],
      pagination: {
        page: filters?.page || 1,
        limit: filters?.limit || 20,
        total: (res && res.length) || 0,
        totalPages: 1,
      },
    };
  },

  /**
   * Custody: Transfer or check-in an item in the physical custody ledger
   */
  async getLockers(): Promise<CustodyLockerRecord[]> {
    return apiFetch('custody/lockers');
  },

  async createLocker(payload: { lockerNumber: string; custodyLocationId?: string; location?: string }): Promise<CustodyLockerRecord> {
    return apiFetch('custody/lockers', { method: 'POST', body: JSON.stringify(payload) });
  },

  async updateLocker(lockerId: string, payload: { lockerNumber?: string; custodyLocationId?: string; is_active?: boolean }): Promise<CustodyLockerRecord> {
    return apiFetch(`custody/lockers/${lockerId}`, { method: 'PATCH', body: JSON.stringify(payload) });
  },

  async deleteLocker(lockerId: string): Promise<{ deleted: boolean; archived?: boolean; lockerId: string }> {
    return apiFetch(`custody/lockers/${lockerId}`, { method: 'DELETE' });
  },

  async getCustodyLocations(includeInactive = false): Promise<CustodyLocationRecord[]> {
    return apiFetch(`custody/locations?includeInactive=${includeInactive}`);
  },

  async createCustodyLocation(payload: { code: string; name: string; description?: string; isActive?: boolean }): Promise<CustodyLocationRecord> {
    return apiFetch('custody/locations', { method: 'POST', body: JSON.stringify(payload) });
  },

  async updateCustodyLocation(
    id: string,
    payload: { code?: string; name?: string; description?: string; isActive?: boolean },
  ): Promise<CustodyLocationRecord> {
    return apiFetch(`custody/locations/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
  },

  async deleteCustodyLocation(id: string): Promise<{ deleted: boolean; archived?: boolean; locationId: string }> {
    return apiFetch(`custody/locations/${id}`, { method: 'DELETE' });
  },

  async getAdminInventory(): Promise<AdminInventorySnapshot> {
    return apiFetch('admin/inventory');
  },

  async assignLocker(payload: { itemId: string; lockerId: string | null; reason?: string }): Promise<unknown> {
    return apiFetch('custody/assign-locker', { method: 'POST', body: JSON.stringify(payload) });
  },

  /**
   * Custody: Transfer or check-in an item in the physical custody ledger
   */
  async transferCustody(payload: {
    itemId: string;
    toLocation?: string;
    custodyLocationId?: string;
    lockerId?: string;
    lockerReference?: string;
    action?: string;
    remarks?: string;
    evidenceReference?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }): Promise<any> {
    return apiFetch('custody/transfer', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Custody: Chronological append-only custody movement history
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getItemCustodyHistory(itemId: string): Promise<any[]> {
    return apiFetch(`custody/items/${itemId}/history`);
  },

  /**
   * Handover: Retrieve approved claims awaiting physical handover
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getPendingHandovers(filters?: { search?: string; page?: number; limit?: number }): Promise<any[]> {
    const params = new URLSearchParams();
    if (filters?.search) params.set('search', filters.search);
    if (filters?.page) params.set('page', filters.page.toString());
    if (filters?.limit) params.set('limit', filters.limit.toString());

    const qs = params.toString();
    const endpoint = qs ? `handovers/pending?${qs}` : 'handovers/pending';
    return apiFetch(endpoint);
  },

  /** Return redacted, authorized print data for a completed handover only. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getHandoverSlip(handoverId: string): Promise<any> {
    return apiFetch(`handovers/${handoverId}/slip`);
  },

  /** Search existing LOST reports that can be linked to direct security intake. */
  async getEligibleDirectLostReports(search?: string): Promise<DirectRecoveryReport[]> {
    const params = new URLSearchParams();
    if (search?.trim()) params.set('search', search.trim());
    const query = params.toString();
    return apiFetch(`handovers/direct-reports${query ? `?${query}` : ''}`);
  },

  /** Retrieve active direct recovery records for authorized security staff. */
  async getDirectRecoveries(search?: string): Promise<DirectRecoveryRecord[]> {
    const params = new URLSearchParams();
    if (search?.trim()) params.set('search', search.trim());
    const query = params.toString();
    return apiFetch(`handovers/direct-recoveries${query ? `?${query}` : ''}`);
  },

  /** Retrieve completed direct recoveries so security can print saved receipts. */
  async getDirectRecoveryHistory(): Promise<DirectRecoveryRecord[]> {
    return apiFetch('handovers/direct-recoveries/history');
  },

  /** Record physical intake against a reporter's existing lost report. */
  async createDirectRecoveryIntake(payload: {
    reportId: string;
    physicalDeskLocation: string;
    custodyLocationId?: string;
    physicalItemReceived: boolean;
    intakeNotes?: string;
  }): Promise<DirectRecoveryRecord> {
    return apiFetch('handovers/direct-recoveries', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /** Independently verify or reject a direct recovery before any OTP is issued. */
  async reviewDirectRecovery(directRecoveryId: string, payload: {
    action: 'APPROVE' | 'REJECT';
    verificationNotes?: string;
    rejectionReason?: string;
    studentIdVerified?: boolean;
    privateDetailsMatched?: boolean;
    reportPhotoMatched?: boolean;
    verificationAnswers?: Array<{ challengeId: string; answer: string }>;
  }): Promise<DirectRecoveryRecord> {
    return apiFetch(`handovers/direct-recoveries/${directRecoveryId}/review`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  /** Verify the owner OTP and record actual physical direct handover. */
  async completeDirectRecovery(directRecoveryId: string, payload: {
    otp: string;
    physicalDeskLocation: string;
    custodyLocationId?: string;
    idCardPresentedType: string;
    idCardNumber: string;
    idCardInspected: boolean;
    recipientSignatureUrl?: string;
    acknowledgementNotes?: string;
    proofEvidenceUrl?: string;
  }): Promise<DirectRecoveryHandoverReceipt> {
    return apiFetch(`handovers/direct-recoveries/${directRecoveryId}/verify-otp`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /** Student/staff view of their own direct recovery status and active OTP. */
  async getMyDirectRecoveries(): Promise<DirectRecoveryRecord[]> {
    return apiFetch('handovers/direct-recoveries/my');
  },

  /** Fetch print-only data for a completed direct recovery. */
  async getDirectRecoverySlip(directRecoveryId: string): Promise<Record<string, unknown>> {
    return apiFetch(`handovers/direct-recoveries/${directRecoveryId}/slip`);
  },

  /**
   * Handover: Authenticate 6-digit OTP and complete physical property release
   */
  async verifyAndCompleteHandover(payload: {
    claimId: string;
    otp: string;
    physicalDeskLocation: string;
    custodyLocationId?: string;
    idCardPresentedType: string;
    idCardNumber: string;
    recipientSignatureUrl?: string;
    acknowledgementNotes?: string;
    proofEvidenceUrl?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }): Promise<any> {
    return apiFetch('handovers/verify-otp', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Security Dashboard: Aggregated metrics & recent events
   */
  async getSecurityStats(): Promise<{
    pendingClaimsCount: number;
    approvedAwaitingHandoverCount: number;
    custodyInventoryCount: number;
    completedHandoversCount: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recentAuditEvents: any[];
  }> {
    return apiFetch('security/dashboard-stats');
  },

  /** Security Desk: student/staff reports awaiting review. */
  async getSecuritySubmittedReports(filters?: {
    search?: string;
    itemType?: ItemType | 'ALL';
    page?: number;
    limit?: number;
  }): Promise<{
    items: SecurityReviewReport[];
    pagination: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
  }> {
    const params = new URLSearchParams();
    if (filters?.search) params.set('search', filters.search);
    if (filters?.itemType && filters.itemType !== 'ALL') params.set('itemType', filters.itemType);
    if (filters?.page) params.set('page', filters.page.toString());
    if (filters?.limit) params.set('limit', filters.limit.toString());

    const query = params.toString();
    return apiFetch(`security/reports${query ? `?${query}` : ''}`);
  },

  /**
   * Security Audit Trail: Paginated security events
   */
  async getAuditTrail(filters?: {
    action?: string;
    targetEntity?: string;
    actorRole?: string;
    page?: number;
    limit?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }): Promise<any[]> {
    const params = new URLSearchParams();
    if (filters?.action) params.set('action', filters.action);
    if (filters?.targetEntity) params.set('targetEntity', filters.targetEntity);
    if (filters?.actorRole) params.set('actorRole', filters.actorRole);
    if (filters?.page) params.set('page', filters.page.toString());
    if (filters?.limit) params.set('limit', filters.limit.toString());

    const qs = params.toString();
    const endpoint = qs ? `security/audit-trail?${qs}` : 'security/audit-trail';
    return apiFetch(endpoint);
  },

  /**
   * Admin Analytics: Complete live database metrics and distributions
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getAdminAnalytics(): Promise<any> {
    return apiFetch('admin/analytics');
  },

  /**
   * Admin Retention Queue: Ageing items with statutory escalation tracking
   */
  async getAdminAgeingQueue(filters?: {
    escalationState?: string;
    search?: string;
    category?: string;
    page?: number;
    limit?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }): Promise<any> {
    const params = new URLSearchParams();
    if (filters?.escalationState) params.set('escalationState', filters.escalationState);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.category) params.set('category', filters.category);
    if (filters?.page) params.set('page', filters.page.toString());
    if (filters?.limit) params.set('limit', filters.limit.toString());
    const qs = params.toString();
    return apiFetch(qs ? `admin/retention/queue?${qs}` : 'admin/retention/queue');
  },

  /**
   * Admin Disposal: Formal approval and execution of property disposal
   */
  async approveDisposal(payload: {
    itemId: string;
    method: 'DONATION' | 'AUCTION' | 'DESTRUCTION' | 'RECYCLED';
    reason: string;
    recipientOrganization?: string;
    certificateUrl?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }): Promise<any> {
    return apiFetch('admin/disposal/approve', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Admin Users: List and filter campus users
   */
  async getAdminUsers(filters?: {
    role?: string;
    userType?: string;
    search?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }): Promise<any> {
    const params = new URLSearchParams();
    if (filters?.role) params.set('role', filters.role);
    if (filters?.userType) params.set('userType', filters.userType);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.isActive !== undefined) params.set('isActive', filters.isActive.toString());
    if (filters?.page) params.set('page', filters.page.toString());
    if (filters?.limit) params.set('limit', filters.limit.toString());
    const qs = params.toString();
    return apiFetch(qs ? `admin/users?${qs}` : 'admin/users');
  },

  /** Admin Users: Create an active or inactive campus account */
  async createAdminUser(payload: {
    fullName: string;
    registrationNumber: string;
    email: string;
    userType: 'STUDENT' | 'STAFF' | 'SECURITY_OFFICER';
    password: string;
    department?: string;
    securityPost?: string;
    phone?: string;
    isActive?: boolean;
  }): Promise<Record<string, unknown>> {
    return apiFetch<Record<string, unknown>>('admin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Admin Users: Update user role, security post, and status
   */
  async updateAdminUser(
    userId: string,
    payload: {
      role?: string;
      userType?: string;
      securityPost?: string;
      department?: string;
      phone?: string;
      isActive?: boolean;
    }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return apiFetch(`admin/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  /** Admin Users: delete an unreferenced account or deactivate one with history. */
  async deleteAdminUser(userId: string): Promise<{ deleted: boolean; deactivated: boolean; message: string }> {
    return apiFetch(`admin/users/${userId}`, { method: 'DELETE' });
  },

  /**
   * Admin Categories: List categories
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getAdminCategories(includeInactive = true): Promise<any[]> {
    return apiFetch(`admin/categories?includeInactive=${includeInactive}`);
  },

  /**
   * Admin Categories: Create category
   */
  async createAdminCategory(payload: {
    code: string;
    name: string;
    description?: string;
    icon?: string;
    defaultRetentionDays: number;
    isActive?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }): Promise<any> {
    return apiFetch('admin/categories', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Admin Categories: Update category
   */
  async updateAdminCategory(
    id: string,
    payload: {
      name?: string;
      description?: string;
      icon?: string;
      defaultRetentionDays?: number;
      isActive?: boolean;
    }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return apiFetch(`admin/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Admin Locations: List locations
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getAdminLocations(includeInactive = true): Promise<any[]> {
    return apiFetch(`admin/locations?includeInactive=${includeInactive}`);
  },

  /**
   * Admin Locations: Create location
   */
  async createAdminLocation(payload: {
    code: string;
    name: string;
    campusZone: string;
    buildingName?: string;
    hasSecurityDesk?: boolean;
    securityContactPhone?: string;
    isActive?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }): Promise<any> {
    return apiFetch('admin/locations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Admin Locations: Update location
   */
  async updateAdminLocation(
    id: string,
    payload: {
      name?: string;
      campusZone?: string;
      buildingName?: string;
      hasSecurityDesk?: boolean;
      securityContactPhone?: string;
      isActive?: boolean;
    }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return apiFetch(`admin/locations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Admin Audit History Search
   */
  async getAdminAuditLogs(filters?: {
    action?: string;
    actorId?: string;
    actorSearch?: string;
    actorRole?: string;
    targetEntity?: string;
    targetId?: string;
    actionStatus?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }): Promise<any> {
    const params = new URLSearchParams();
    if (filters?.action) params.set('action', filters.action);
    if (filters?.actorId) params.set('actorId', filters.actorId);
    if (filters?.actorSearch) params.set('actor', filters.actorSearch);
    if (filters?.actorRole) params.set('actorRole', filters.actorRole);
    if (filters?.targetEntity) params.set('targetEntity', filters.targetEntity);
    if (filters?.targetId) params.set('targetId', filters.targetId);
    if (filters?.actionStatus) params.set('actionStatus', filters.actionStatus);
    if (filters?.startDate) params.set('startDate', filters.startDate);
    if (filters?.endDate) params.set('endDate', filters.endDate);
    if (filters?.page) params.set('page', filters.page.toString());
    if (filters?.limit) params.set('limit', filters.limit.toString());
    const qs = params.toString();
    return apiFetch(qs ? `admin/audit-logs?${qs}` : 'admin/audit-logs');
  },
};

