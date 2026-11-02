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
  IN_CUSTODY: { label: 'In Security Custody', color: 'text-[#356DE8]', bg: 'bg-[#EBF1FD]', border: 'border-[#CADBFA]' },
  MATCH_PENDING: { label: 'Match Found', color: 'text-purple-800', bg: 'bg-purple-50', border: 'border-purple-200' },
  CLAIM_IN_REVIEW: { label: 'Claim in Review', color: 'text-[#0E706A]', bg: 'bg-[#E6F8F7]', border: 'border-[#A8EAE5]' },
  READY_FOR_HANDOVER: { label: 'Ready for Collection', color: 'text-[#16876A]', bg: 'bg-[#E6F5F1]', border: 'border-[#A3DACD]' },
  HANDED_OVER: { label: 'Recovered & Handed Over', color: 'text-slate-700', bg: 'bg-slate-100', border: 'border-slate-300' },
  UNCLAIMED_EXPIRED: { label: 'Retention Expired (90+ d)', color: 'text-[#DC4545]', bg: 'bg-[#FEE2E2]', border: 'border-[#FCA5A5]' },
  DISPOSED: { label: 'Archived / Disposed', color: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200' },
};

export const ROLE_LABELS: Record<UserRole, { label: string; badgeClass: string }> = {
  STUDENT_STAFF: { label: 'Student / Campus User', badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  SECURITY_PERSONNEL: { label: 'Security Officer', badgeClass: 'bg-[#EBF1FD] text-[#356DE8] border-[#CADBFA]' },
  CAMPUS_ADMIN: { label: 'Campus Administrator', badgeClass: 'bg-[#E9EEF7] text-[#192B4A] border-[#C3D2EB] font-bold' },
  SYSTEM_ADMIN: { label: 'System Administrator', badgeClass: 'bg-[#E6F8F7] text-[#192B4A] border-[#20B5AD]/40 font-bold' },
};

export const DISCLAIMER_TEXT = 
  "LPU Lost & Found Property Recovery Portal. Dedicated exclusively to managing, matching, and recovering lost and found property across Lovely Professional University campus.";
