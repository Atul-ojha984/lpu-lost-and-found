import { ItemCategory, LPUCampusZone, ItemStatus, UserRole } from '@/types';

export const CATEGORY_LABELS: Record<ItemCategory, { label: string; icon: string }> = {
  ELECTRONICS: { label: 'Electronics & Gadgets', icon: 'Laptop' },
  STUDENT_ID_CARDS: { label: 'Student ID Cards', icon: 'CreditCard' },
  WALLETS_PURSE: { label: 'Wallets & Purses', icon: 'Wallet' },
  DOCUMENTS_BOOKS: { label: 'Documents & Notebooks', icon: 'FileText' },
  KEYS: { label: 'Keys & Keychains', icon: 'Key' },
  BAGS_BACKPACKS: { label: 'Bags & Backpacks', icon: 'Backpack' },
  CLOTHING_ACCESSORIES: { label: 'Clothing & Wearables', icon: 'Shirt' },
  SPORTS_EQUIPMENT: { label: 'Sports Equipment', icon: 'Dumbbell' },
  OTHERS: { label: 'Miscellaneous Items', icon: 'HelpCircle' },
};

export const CAMPUS_ZONE_LABELS: Record<LPUCampusZone, { label: string; area: string }> = {
  BLOCK_30_38: { label: 'Block 30–38', area: 'Engineering & Technology Academic Hub' },
  BLOCK_55_58: { label: 'Block 55–58', area: 'Management & Applied Sciences' },
  UNI_MALL: { label: 'Uni-Mall', area: 'Commercial Center & Student Food Court' },
  CENTRAL_LIBRARY: { label: 'Central Library', area: 'Reading Halls & Reference Wing' },
  INDOOR_STADIUM_SHANTI_DEVI: { label: 'Shanti Devi Sports Complex', area: 'Indoor Stadium, Gym & Courts' },
  RESIDENTIAL_BOYS_BH: { label: 'Boys Hostels (BH-1 to BH-8)', area: 'Residential Zone North' },
  RESIDENTIAL_GIRLS_GH: { label: 'Girls Hostels (GH-1 to GH-6)', area: 'Residential Zone South' },
  MAIN_GATE_SECURITY: { label: 'Main Security Posts (Gate 1 & 2)', area: 'Campus Transit Points' },
  ROBOPARK_BALDEV_RAJ_MITTAL: { label: 'Baldev Raj Mittal Unipolis & Park', area: 'Auditorium & Green Lawn' },
  OTHER_CAMPUS_AREA: { label: 'Other Campus Perimeter', area: 'General Grounds & Walkways' },
};

export const STATUS_CONFIG: Record<ItemStatus, { label: string; color: string; bg: string; border: string }> = {
  REPORTED: { label: 'Reported', color: 'text-amber-800', bg: 'bg-amber-50', border: 'border-amber-200' },
  IN_CUSTODY: { label: 'In Security Custody', color: 'text-blue-800', bg: 'bg-blue-50', border: 'border-blue-200' },
  MATCH_PENDING: { label: 'Match Found', color: 'text-purple-800', bg: 'bg-purple-50', border: 'border-purple-200' },
  CLAIM_IN_REVIEW: { label: 'Claim in Review', color: 'text-orange-800', bg: 'bg-orange-50', border: 'border-orange-200' },
  READY_FOR_HANDOVER: { label: 'Ready for Collection', color: 'text-emerald-800', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  HANDED_OVER: { label: 'Recovered & Handed Over', color: 'text-slate-700', bg: 'bg-slate-100', border: 'border-slate-300' },
  UNCLAIMED_EXPIRED: { label: 'Retention Expired (90+ d)', color: 'text-rose-800', bg: 'bg-rose-50', border: 'border-rose-200' },
  DISPOSED: { label: 'Archived / Disposed', color: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200' },
};

export const ROLE_LABELS: Record<UserRole, { label: string; badgeClass: string }> = {
  STUDENT_STAFF: { label: 'Student / Staff', badgeClass: 'bg-slate-100 text-slate-700 border-slate-300' },
  SECURITY_PERSONNEL: { label: 'Campus Security', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' },
  CAMPUS_ADMIN: { label: 'Campus Administrator', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
  SYSTEM_ADMIN: { label: 'System Administrator', badgeClass: 'bg-red-50 text-red-700 border-red-200' },
};

export const DISCLAIMER_TEXT = 
  "Campus Property Recovery Platform for Lovely Professional University. Independent campus community service — not officially endorsed by LPU administration unless authorization is granted.";
