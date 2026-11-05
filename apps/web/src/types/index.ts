export type UserRole = 
  | 'STUDENT_STAFF' 
  | 'SECURITY_PERSONNEL' 
  | 'CAMPUS_ADMIN' 
  | 'SYSTEM_ADMIN';

export type UserType =
  | 'STUDENT'
  | 'STAFF'
  | 'SECURITY_OFFICER'
  | 'CAMPUS_ADMIN'
  | 'SYSTEM_ADMIN'
  | 'UNSPECIFIED';

export type ItemType = 'LOST' | 'FOUND';

export type ItemCategory = 
  | 'ELECTRONICS'
  | 'STUDENT_ID_CARDS'
  | 'WALLETS_PURSE'
  | 'DOCUMENTS_BOOKS'
  | 'KEYS'
  | 'BAGS_BACKPACKS'
  | 'CLOTHING_ACCESSORIES'
  | 'SPORTS_EQUIPMENT'
  | 'OTHERS';

export type ItemStatus = 
  | 'REPORTED'
  | 'IN_CUSTODY'
  | 'MATCH_PENDING'
  | 'CLAIM_IN_REVIEW'
  | 'READY_FOR_HANDOVER'
  | 'HANDED_OVER'
  | 'UNCLAIMED_EXPIRED'
  | 'DISPOSED';

export type LPUCampusZone = 
  | 'BLOCK_30_38'
  | 'BLOCK_55_58'
  | 'UNI_MALL'
  | 'CENTRAL_LIBRARY'
  | 'INDOOR_STADIUM_SHANTI_DEVI'
  | 'RESIDENTIAL_BOYS_BH'
  | 'RESIDENTIAL_GIRLS_GH'
  | 'MAIN_GATE_SECURITY'
  | 'ROBOPARK_BALDEV_RAJ_MITTAL'
  | 'OTHER_CAMPUS_AREA';

export type ClaimStatus = 
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'CHALLENGE_REQUIRED'
  | 'APPROVED'
  | 'REJECTED'
  | 'COMPLETED';

export interface PublicItem {
  id: string;
  referenceNumber: string;
  itemType: ItemType;
  title: string;
  category: ItemCategory;
  campusZone: LPUCampusZone;
  specificLocation: string;
  eventDate: string;
  publicDescription: string;
  primaryImageUrl?: string;
  status: ItemStatus;
  reportedByRole: UserRole;
  isDemoItem?: boolean;
  currentCustodyDesk?: string;
  lockerStorageReference?: string;
  createdAt: string;
  isOwner?: boolean;
}

export interface Claim {
  id: string;
  itemId: string;
  itemTitle: string;
  itemReference: string;
  itemType: ItemType;
  claimantName: string;
  claimantRegNo: string;
  claimantEmail: string;
  claimStatus: ClaimStatus;
  statement: string;
  evidenceCount: number;
  submittedAt: string;
  challengeAnswer?: string;
  handoverOtp?: string;
  handoverOtpExpiresAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  rejectionReason?: string;
  privateEvidenceProofUrls?: string[];
}

export interface MatchSuggestion {
  id: string;
  lostItemId: string;
  lostItemTitle: string;
  foundItemId: string;
  foundItemTitle: string;
  matchScore: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  explanation: {
    categoryMatch: string;
    locationProximity: string;
    timeDelta: string;
    matchingTokens: string[];
  };
  createdAt: string;
}

export interface CustodyRecord {
  id: string;
  itemId: string;
  itemReference: string;
  itemTitle: string;
  action: 'INITIAL_INTAKE' | 'TRANSFERRED_DESK' | 'STORED_IN_LOCKER' | 'INSPECTION' | 'HANDED_OVER' | 'DISPOSED';
  location: string;
  lockerNumber?: string;
  officerName: string;
  officerPost: string;
  remarks?: string;
  timestamp: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  registrationNumber: string;
  role: UserRole;
  department?: string;
  securityPost?: string;
  isActive: boolean;
  joinedAt: string;
}
